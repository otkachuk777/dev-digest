import { extname, posix } from 'node:path';

/**
 * Path kinds excluded from rank-driven file samples (conventions/onboarding):
 * tests, configs, declaration files, migrations, generated dirs. Substring
 * match on the repo-relative path (kept deliberately simple + deterministic).
 */
export const JUNK_PATH_PATTERNS = [
  '.test.',
  '.spec.',
  '.d.ts',
  '__tests__/',
  '__mocks__/',
  '/test/',
  '/tests/',
  '/migrations/',
  '/__fixtures__/',
  '.config.',
  'vitest.',
  'jest.',
  'eslint',
  'prettier',
] as const;

export function isJunkPath(path: string): boolean {
  const lower = path.toLowerCase();
  return JUNK_PATH_PATTERNS.some((p) => lower.includes(p));
}

// --- Onboarding fact parsers (pure, deterministic, no fs) -------------------

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (xs: Iterable<string>) => [...new Set(xs)].sort(cmp);

/** Package manager from the root lockfile names. */
export function detectPackageManager(rootFiles: string[]): 'npm' | 'pnpm' | 'yarn' | 'bun' | null {
  const has = (f: string) => rootFiles.includes(f);
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('bun.lockb') || has('bun.lock')) return 'bun';
  if (has('package-lock.json')) return 'npm';
  return null;
}

/** Scripts, dependency names and entry-point paths of a package.json; null on invalid JSON. */
export function parsePackageJson(
  text: string,
): { scripts: string[]; deps: string[]; entries: string[] } | null {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  const keys = (v: unknown) => (v && typeof v === 'object' ? Object.keys(v) : []);
  const entries: string[] = [];
  for (const k of ['main', 'module']) if (typeof o[k] === 'string') entries.push(o[k] as string);
  if (typeof o.bin === 'string') entries.push(o.bin);
  else if (o.bin && typeof o.bin === 'object') {
    for (const v of Object.values(o.bin)) if (typeof v === 'string') entries.push(v);
  }
  return {
    scripts: keys(o.scripts).sort(cmp),
    deps: uniqSorted([...keys(o.dependencies), ...keys(o.devDependencies)]),
    entries,
  };
}

export function parseMakefileTargets(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z0-9][\w.-]*)\s*:(?!=)/.exec(line);
    if (m) out.push(m[1]!);
  }
  return uniqSorted(out);
}

// ponytail: no YAML lib — top-level `services:` + first-indent child keys only; anchors/flow style unsupported; add `yaml` if real repos break it.
export function parseComposeServices(text: string): string[] {
  const out: string[] = [];
  let inServices = false;
  let indent = -1;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const lead = line.length - line.trimStart().length;
    if (lead === 0) {
      inServices = /^services\s*:/.test(line);
      indent = -1;
      continue;
    }
    if (!inServices) continue;
    if (indent < 0) indent = lead;
    if (lead !== indent) continue;
    const m = /^\s*["']?([\w.-]+)["']?\s*:/.exec(line);
    if (m) out.push(m[1]!);
  }
  return uniqSorted(out);
}

/** Variable NAMES only — values are never returned (AC-60). */
export function parseEnvExampleNames(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m) out.push(m[1]!);
  }
  return uniqSorted(out);
}

/** Commands from fenced shell blocks (sh/bash/shell/zsh/console or untagged), in order. */
export function parseReadmeShellCommands(text: string): string[] {
  const out: string[] = [];
  let inShell = false;
  let inOther = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const fence = /^```\s*([\w-]*)/.exec(line);
    if (fence) {
      if (inShell || inOther) inShell = inOther = false;
      else if (/^(sh|bash|shell|zsh|console|)$/i.test(fence[1]!)) inShell = true;
      else inOther = true;
      continue;
    }
    if (!inShell || !line || line.startsWith('#')) continue;
    const cmd = line.replace(/^\$\s+/, '');
    if (!out.includes(cmd)) out.push(cmd);
  }
  return out;
}

/** Relative markdown link targets, normalised, in order, deduped. Existence is checked by the caller. */
export function parseReadmeLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)/g)) {
    let t = m[1]!;
    if (t.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('/') || t.startsWith('//')) continue;
    t = t.replace(/[#?].*$/, '');
    if (!t) continue;
    t = posix.normalize(t);
    if (t.startsWith('..') || t === '.') continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export function languagesByExt(paths: string[]): { ext: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const ext = extname(p).toLowerCase();
    if (ext) counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return [...counts]
    .map(([ext, files]) => ({ ext, files }))
    .sort((a, b) => b.files - a.files || cmp(a.ext, b.ext));
}

/** Files per top-level directory (root-level files excluded), dir asc. */
export function topLevelStructure(paths: string[]): { dir: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const i = p.indexOf('/');
    if (i > 0) counts.set(p.slice(0, i), (counts.get(p.slice(0, i)) ?? 0) + 1);
  }
  return [...counts].map(([dir, files]) => ({ dir, files })).sort((a, b) => cmp(a.dir, b.dir));
}

/** hotness = commits touching the file / highest count, over `indexed` paths only; all 0 when no commit touches one. */
export function hotnessFromCommits(commits: string[][], indexed: string[]): Record<string, number> {
  const counts = new Map(indexed.map((p) => [p, 0]));
  for (const c of commits) {
    for (const p of new Set(c)) if (counts.has(p)) counts.set(p, counts.get(p)! + 1);
  }
  const max = Math.max(0, ...counts.values());
  return Object.fromEntries([...counts].map(([p, n]) => [p, max === 0 ? 0 : n / max]));
}
