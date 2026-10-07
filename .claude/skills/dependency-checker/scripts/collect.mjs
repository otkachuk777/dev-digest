#!/usr/bin/env node
// Deterministic fact collector for the dependency-checker skill. No LLM, no installs.
// Usage: node collect.mjs [--root <repo>] [--out <facts.json>] [--offline] [--top 12]
// Every section reports status: "ok" | "skipped" | "error" so the report never invents data.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : args[i + 1];
};
const ROOT = path.resolve(opt("root", process.cwd()));
const OUT = path.resolve(ROOT, opt("out", ".claude/.dependency-checker/facts.json"));
const OFFLINE = args.includes("--offline");
const TOP = Number(opt("top", 12));

const log = (m) => process.stderr.write(`[collect] ${m}\n`);
const exists = (p) => fs.existsSync(p);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const kb = (b) => Math.round(b / 1024);

/** Run a command; return stdout even on non-zero exit (audit/outdated exit 1 when they find something). */
function run(cmd, cmdArgs, cwd, timeout = 90_000) {
  try {
    return { out: execFileSync(cmd, cmdArgs, { cwd, timeout, encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    if (e.stdout && String(e.stdout).trim()) return { out: String(e.stdout) };
    return { error: String(e.stderr || e.message).split("\n")[0].slice(0, 200) };
  }
}

// ---------- module discovery ----------
const modules = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules" && exists(path.join(ROOT, d.name, "package.json")))
  .map((d) => d.name)
  .sort();

// ---------- sizes ----------
const sizeCache = new Map(); // realpath -> bytes (own files, excluding nested node_modules)
function dirSize(dir) {
  if (sizeCache.has(dir)) return sizeCache.get(dir);
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") stack.push(p); }
      else if (e.isFile()) { try { total += fs.statSync(p).size; } catch { /* broken link */ } }
    }
  }
  sizeCache.set(dir, total);
  return total;
}

/** Node-style resolution of `name` from the package dir `from` (works for npm-flat and pnpm-virtual layouts). */
function resolvePkg(name, from) {
  let dir = from;
  for (;;) {
    const cand = path.join(dir, "node_modules", name);
    if (exists(path.join(cand, "package.json"))) return fs.realpathSync(cand);
    // pnpm: realpath ends in .../node_modules/<name>; siblings live in the parent node_modules
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    const asSibling = path.join(parent, name);
    if (path.basename(parent) === "node_modules" && exists(path.join(asSibling, "package.json"))) return fs.realpathSync(asSibling);
    dir = parent;
  }
}

function closure(startDir) {
  const seen = new Map(); // realpath -> {name, version}
  const stack = [startDir];
  while (stack.length) {
    const d = stack.pop();
    if (seen.has(d)) continue;
    let pj;
    try { pj = readJson(path.join(d, "package.json")); } catch { continue; }
    seen.set(d, { name: pj.name, version: pj.version });
    for (const dep of Object.keys({ ...pj.dependencies, ...pj.optionalDependencies })) {
      const r = resolvePkg(dep, d);
      if (r) stack.push(r);
    }
  }
  return seen;
}

// ---------- unused heuristic (grep, no depcheck) ----------
// Packages used implicitly (compiler, peer of a framework, config-only) — never flagged as unused.
const IMPLICIT = new Set(["typescript", "tsx", "react-dom", "postcss", "tailwindcss", "autoprefixer", "dependency-cruiser", "eslint", "prettier"]);
// Code and config only: prose (.md) and CSS mention package names without using them, and
// vendored clones/docs (e.g. server/clones/) would make every documented package look used.
const SRC_EXT = /\.(m?[jt]sx?|cjs|json|ya?ml)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "coverage", ".git", "clones", ".devdigest", "docs", "specs", "playwright-report", "test-results"]);
function sourceBlob(modDir) {
  const parts = [];
  const stack = [modDir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (SRC_EXT.test(e.name) && !/lock/.test(e.name) && e.name !== "package.json") {
        try { if (fs.statSync(p).size < 2_000_000) parts.push(fs.readFileSync(p, "utf8")); } catch { /* skip */ }
      }
    }
  }
  return parts.join("\n");
}

// ---------- internal graph (dependency-cruiser) ----------
function unitOf(file) {
  // file like "src/modules/pulls/routes.ts" or "../reviewer-core/src/review/x.ts"
  let prefix = "";
  let f = file;
  const rc = f.match(/^\.\.\/([^/]+)\/(.*)$/);
  if (rc) { prefix = `${rc[1]}/`; f = rc[2]; }
  const segs = f.split("/");
  if (segs[0] !== "src") return prefix + segs[0];
  const deep = ["modules", "app", "features"].includes(segs[1]) && segs.length > 3;
  return prefix + segs.slice(0, deep ? 3 : Math.min(2, segs.length - 1 || 1)).join("/");
}

// Owning package of a depcruise path: "../reviewer-core/src/x.ts" → "reviewer-core"; "src/x.ts" → "" (the module itself).
const pkgOf = (f) => (f.startsWith("../") ? f.split("/")[1] : "");

function internalGraph(mod) {
  const modDir = path.join(ROOT, mod);
  const cfg = path.join(modDir, ".dependency-cruiser.cjs");
  const bin = path.join(modDir, "node_modules/.bin/depcruise");
  if (!exists(cfg)) return { status: "skipped", reason: "no .dependency-cruiser.cjs in module" };
  if (!exists(bin)) return { status: "skipped", reason: "depcruise not installed (run install in module)" };
  const roots = mod === "server" ? ["src", "../reviewer-core/src"] : ["src"];
  const r = run(bin, [...roots, "--config", ".dependency-cruiser.cjs", "--output-type", "json"], modDir, 180_000);
  if (r.error) return { status: "error", reason: r.error };
  let json;
  try { json = JSON.parse(r.out); } catch { return { status: "error", reason: "depcruise output is not JSON" }; }

  const edges = new Map();
  const unitFiles = new Map();
  const npmUsage = new Map();
  const crossPackage = new Map();
  for (const m of json.modules) {
    if (m.coreModule || /node_modules/.test(m.source)) continue;
    const from = unitOf(m.source);
    unitFiles.set(from, (unitFiles.get(from) || 0) + 1);
    for (const d of m.dependencies || []) {
      if (d.dependencyTypes?.some((t) => t.startsWith("npm"))) {
        const name = d.module.startsWith("@") ? d.module.split("/").slice(0, 2).join("/") : d.module.split("/")[0];
        const u = npmUsage.get(name) || npmUsage.set(name, { static: new Set(), dynamic: new Set() }).get(name);
        (d.dynamic ? u.dynamic : u.static).add(m.source);
        continue;
      }
      if (d.coreModule || d.couldNotResolve) continue;
      if (d.resolved.startsWith("../") && pkgOf(m.source) !== pkgOf(d.resolved)) {
        // Sibling-package import. Packages are not workspace deps here: code is shared via tsconfig
        // path aliases, so a relative specifier or a non-index target bypasses the package's public entry.
        const key = `${m.source}\u0000${d.module}`;
        crossPackage.set(key, { from: m.source, specifier: d.module, to: d.resolved, via: d.module.startsWith(".") ? "relative" : "alias", publicEntry: /\/src\/index\.[tj]sx?$/.test(d.resolved) });
      }
      const to = unitOf(d.resolved);
      if (to === from) continue;
      const k = `${from}\u0000${to}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  const violations = (json.summary?.violations || []).filter((v) => v.rule?.severity !== "ignore");
  const cycleViolations = violations.filter((v) => v.cycle || v.rule?.name === "no-circular");
  return {
    status: "ok",
    files: json.summary?.totalCruised ?? json.modules.length,
    units: [...unitFiles].map(([unit, files]) => ({ unit, files })).sort((a, b) => b.files - a.files),
    edges: [...edges].map(([k, n]) => { const [from, to] = k.split("\u0000"); return { from, to, imports: n }; }).sort((a, b) => b.imports - a.imports),
    // static = top-level import (lands in the initial chunk); dynamic = import() (already lazy)
    crossPackage: [...crossPackage.values()].slice(0, 200),
    npmUsage: Object.fromEntries([...npmUsage].map(([k, v]) => [k, { static: v.static.size, dynamic: v.dynamic.size, files: new Set([...v.static, ...v.dynamic]).size }])),
    violations: violations.map((v) => ({ rule: v.rule?.name, severity: v.rule?.severity, from: v.from, to: v.to })),
    circular: cycleViolations.length,
  };
}

// ---------- audit / outdated ----------
function pm(modDir) {
  return exists(path.join(modDir, "pnpm-lock.yaml")) ? "pnpm" : exists(path.join(modDir, "package-lock.json")) ? "npm" : "unknown";
}

function audit(mod, manager) {
  if (OFFLINE) return { status: "skipped", reason: "--offline" };
  if (manager === "unknown") return { status: "skipped", reason: "no lockfile" };
  const r = run(manager, ["audit", "--json"], path.join(ROOT, mod));
  if (r.error) return { status: "error", reason: r.error };
  let j;
  try { j = JSON.parse(r.out); } catch { return { status: "error", reason: "audit output is not JSON (registry unreachable?)" }; }
  const advisories = [];
  if (j.advisories) { // pnpm
    for (const a of Object.values(j.advisories)) advisories.push({ package: a.module_name, severity: a.severity, title: a.title, range: a.vulnerable_versions, fix: a.patched_versions, url: a.url });
  } else if (j.vulnerabilities) { // npm
    for (const [name, v] of Object.entries(j.vulnerabilities)) {
      const via = (v.via || []).filter((x) => typeof x === "object");
      advisories.push({ package: name, severity: v.severity, title: via[0]?.title || "transitive via " + (v.via || []).join(", "), range: v.range, fix: v.fixAvailable === true ? "npm audit fix" : v.fixAvailable ? `${v.fixAvailable.name}@${v.fixAvailable.version}` : "none", url: via[0]?.url });
    }
  } else if (j.error) return { status: "error", reason: String(j.error.summary || j.error.code || "audit error").slice(0, 200) };
  const counts = {};
  for (const a of advisories) counts[a.severity] = (counts[a.severity] || 0) + 1;
  return { status: "ok", counts, advisories };
}

function outdated(mod, manager) {
  if (OFFLINE) return { status: "skipped", reason: "--offline" };
  if (manager === "unknown") return { status: "skipped", reason: "no lockfile" };
  const r = run(manager, manager === "pnpm" ? ["outdated", "--format", "json"] : ["outdated", "--json"], path.join(ROOT, mod));
  if (r.error) return { status: "error", reason: r.error };
  let j;
  try { j = JSON.parse(r.out.trim() || "{}"); } catch { return { status: "error", reason: "outdated output is not JSON" }; }
  const items = Object.entries(j).map(([name, v]) => {
    const cur = v.current, lat = v.latest;
    const major = cur && lat && cur.split(".")[0] !== lat.split(".")[0];
    return { package: name, current: cur ?? null, wanted: v.wanted ?? null, latest: lat ?? null, kind: !cur ? "not-installed" : major ? "major" : "minor/patch" };
  }).sort((a, b) => (a.kind === "major" ? 0 : 1) - (b.kind === "major" ? 0 : 1) || a.package.localeCompare(b.package));
  return { status: "ok", total: items.length, major: items.filter((i) => i.kind === "major").length, items };
}

// ---------- main ----------
const facts = { generatedAt: new Date().toISOString(), root: ROOT, offline: OFFLINE, modules: {}, duplicates: [], mermaid: {} };

for (const mod of modules) {
  log(`module ${mod}`);
  const modDir = path.join(ROOT, mod);
  const pkg = readJson(path.join(modDir, "package.json"));
  const manager = pm(modDir);
  const nm = path.join(modDir, "node_modules");
  const declared = [
    ...Object.entries(pkg.dependencies || {}).map(([name, range]) => ({ name, range, type: "dependencies" })),
    ...Object.entries(pkg.devDependencies || {}).map(([name, range]) => ({ name, range, type: "devDependencies" })),
  ];
  const m = { name: pkg.name, packageManager: manager, installed: exists(nm), counts: { dependencies: Object.keys(pkg.dependencies || {}).length, devDependencies: Object.keys(pkg.devDependencies || {}).length } };

  const graph = internalGraph(mod);
  m.internal = graph;

  if (!m.installed) {
    m.sizes = { status: "skipped", reason: "node_modules missing — install first" };
    m.packages = declared.map((d) => ({ ...d, installed: null, selfKB: null, withTransitiveKB: null, transitiveCount: null }));
  } else {
    const blob = sourceBlob(modDir);
    const scripts = JSON.stringify(pkg.scripts || {});
    m.packages = declared.map((d) => {
      const real = resolvePkg(d.name, modDir);
      if (!real) return { ...d, installed: null, selfKB: null, withTransitiveKB: null, transitiveCount: null, usedHint: "not installed" };
      const cl = closure(real);
      let total = 0;
      for (const dir of cl.keys()) total += dirSize(dir);
      const bare = d.name.replace(/^@types\//, "");
      const mentioned = new RegExp(`['"\`]${bare.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(['"\`/])`).test(blob) || scripts.includes(bare) || (graph.npmUsage?.[d.name]?.files ?? 0) > 0;
      return {
        ...d,
        installed: readJson(path.join(real, "package.json")).version,
        selfKB: kb(dirSize(real)),
        withTransitiveKB: kb(total),
        transitiveCount: cl.size - 1,
        importingFiles: graph.npmUsage?.[d.name]?.files ?? null,
        staticImportFiles: graph.npmUsage?.[d.name]?.static ?? null,
        dynamicImportFiles: graph.npmUsage?.[d.name]?.dynamic ?? null,
        // true = imported only via import(): already code-split, lazy-load advice does not apply
        lazyOnly: graph.npmUsage?.[d.name] ? graph.npmUsage[d.name].static === 0 && graph.npmUsage[d.name].dynamic > 0 : null,
        unusedCandidate: !mentioned && !IMPLICIT.has(d.name) && !d.name.startsWith("@types/"),
      };
    }).sort((a, b) => (b.withTransitiveKB ?? -1) - (a.withTransitiveKB ?? -1));
    let all = 0;
    const unionDirs = new Set();
    for (const d of declared) { const r = resolvePkg(d.name, modDir); if (r) for (const k of closure(r).keys()) unionDirs.add(k); }
    for (const dir of unionDirs) all += dirSize(dir);
    const du = run("du", ["-sk", nm], modDir);
    m.sizes = {
      status: "ok",
      nodeModulesDiskKB: du.out ? Number(du.out.split(/\s/)[0]) : null,
      declaredClosureKB: kb(all),
      closurePackages: unionDirs.size,
      note: "withTransitiveKB counts shared transitives in every package that pulls them; sum of rows > declaredClosureKB.",
    };
  }
  m.audit = audit(mod, manager);
  if (m.audit.status === "ok" && m.installed) {
    // Flag advisories whose package ships to production (reachable from `dependencies` only) — drives P0 vs P2.
    const prodNames = new Set();
    for (const d of declared.filter((x) => x.type === "dependencies")) {
      const r = resolvePkg(d.name, modDir);
      if (r) for (const v of closure(r).values()) prodNames.add(v.name);
    }
    for (const a of m.audit.advisories) a.inProd = prodNames.has(a.package);
  }
  m.outdated = outdated(mod, manager);
  facts.modules[mod] = m;
}

// duplicates / version drift across modules
const byName = new Map();
for (const [mod, m] of Object.entries(facts.modules))
  for (const p of m.packages) (byName.get(p.name) || byName.set(p.name, []).get(p.name)).push({ module: mod, range: p.range, installed: p.installed, type: p.type, selfKB: p.selfKB });
for (const [name, uses] of byName)
  if (uses.length > 1) facts.duplicates.push({ package: name, drift: new Set(uses.map((u) => u.installed ?? u.range)).size > 1, uses });
facts.duplicates.sort((a, b) => Number(b.drift) - Number(a.drift) || b.uses.length - a.uses.length);

// ---------- mermaid (built here so diagrams are always syntactically valid) ----------
const id = (s) => s.replace(/[^A-Za-z0-9]/g, "_");
const label = (s) => s.replace(/"/g, "'");
const human = (k) => (k >= 1024 ? `${(k / 1024).toFixed(1)} MB` : `${k} KB`);
{
  const lines = ["flowchart LR"];
  for (const [mod, m] of Object.entries(facts.modules)) {
    const top = m.packages.filter((p) => p.type === "dependencies" && p.withTransitiveKB != null).slice(0, TOP);
    if (!top.length) continue;
    lines.push(`  subgraph ${id(mod)}["${mod}"]`);
    for (const p of top) lines.push(`    ${id(mod)}__${id(p.name)}["${label(p.name)}<br/>${human(p.withTransitiveKB)}"]`);
    lines.push("  end");
  }
  const shared = facts.duplicates.filter((d) => d.uses.filter((u) => u.type === "dependencies").length > 1);
  facts.mermaid.packages = lines.join("\n");
  facts.mermaid.sharedAcrossModules = shared.length
    ? ["flowchart LR", ...shared.slice(0, TOP).flatMap((d) => d.uses.map((u) => `  ${id(u.module)}["${u.module}"] -->|"${label(u.installed ?? u.range)}"| ${id(d.package)}(["${label(d.package)}"])`))].join("\n")
    : null;
}
for (const [mod, m] of Object.entries(facts.modules)) {
  const g = m.internal;
  if (g.status !== "ok") continue;
  const bad = new Set(g.violations.map((v) => `${unitOf(v.from)}\u0000${unitOf(v.to)}`));
  const keep = g.edges.filter((e) => e.imports >= 1).slice(0, 60);
  const nodes = new Set(keep.flatMap((e) => [e.from, e.to]));
  const lines = ["flowchart LR", ...[...nodes].map((n) => `  ${id(n)}["${label(n)}"]`)];
  const badIdx = [];
  keep.forEach((e, i) => {
    const isBad = bad.has(`${e.from}\u0000${e.to}`);
    lines.push(`  ${id(e.from)} ${isBad ? "-.->" : "-->"}|${e.imports}| ${id(e.to)}`);
    if (isBad) badIdx.push(i);
  });
  if (badIdx.length) lines.push(`  linkStyle ${badIdx.join(",")} stroke:#d33,stroke-width:2px`);
  facts.mermaid[`internal_${mod}`] = lines.join("\n");
  if (g.edges.length > keep.length) facts.mermaid[`internal_${mod}_note`] = `Показано ${keep.length} найважчих зв'язків з ${g.edges.length}; червоні пунктирні — порушення правил dependency-cruiser.`;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(facts, null, 2));
log(`wrote ${path.relative(ROOT, OUT)} (${modules.length} modules)`);
process.stdout.write(OUT + "\n");
