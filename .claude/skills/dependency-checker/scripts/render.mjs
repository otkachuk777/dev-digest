#!/usr/bin/env node
// Renders the final report (Markdown + self-contained HTML) from facts.json + analysis.json.
// Usage: node render.mjs --facts <facts.json> --analysis <analysis.json> --md <out.md> --html <out.html> [--standalone]
// The section order is fixed here on purpose: every report has the same shape, so developers know where to look.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i < 0 ? null : args[i + 1]; };
const need = (n) => opt(n) ?? (console.error(`missing --${n}`), process.exit(2));
const facts = JSON.parse(fs.readFileSync(need("facts"), "utf8"));
const analysis = JSON.parse(fs.readFileSync(need("analysis"), "utf8"));
const mdOut = need("md"), htmlOut = need("html");

const human = (k) => (k == null ? "—" : k >= 1024 ? `${(k / 1024).toFixed(1)} MB` : `${k} KB`);
const LEVELS = ["P0", "P1", "P2", "Info"];
const LEVEL_NAME = { P0: "Негайно", P1: "Найближчий спринт", P2: "Планово", Info: "До відома, без дій зараз" };
const mods = Object.entries(facts.modules);
const date = facts.generatedAt.slice(0, 10);

// ---------- block model ----------
const B = [];
const h = (level, text) => B.push({ t: "h", level, text });
const p = (text) => B.push({ t: "p", text });
const ul = (items) => items.length && B.push({ t: "ul", items });
const table = (head, rows) => B.push({ t: "table", head, rows });
const mermaid = (code) => B.push({ t: "mermaid", code });


// Section names and order are a contract: evals/skills/dependency-checker/*.cases.ts judge a report by
// "Scope", a Mermaid graph, a size table, "Findings & Priorities" in P0/P1/P2/Info tiers, and a closing "Summary".
const blocked = (m, k) => m[k].status !== "ok";
const totalDisk = mods.reduce((s, [, m]) => s + (m.sizes.nodeModulesDiskKB ?? 0), 0);
const vulnTotal = mods.reduce((s, [, m]) => s + (m.audit.status === "ok" ? m.audit.advisories.length : 0), 0);
const majorTotal = mods.reduce((s, [, m]) => s + (m.outdated.status === "ok" ? m.outdated.major : 0), 0);
const partial = (key) => mods.some(([, m]) => blocked(m, key));

h(1, `Dependency report — ${date}`);

// ---------- 1. Scope ----------
h(2, "1. Scope");
p(`Проаналізовано **${mods.length}** пакетів: ${mods.map(([n]) => `\`${n}\``).join(", ")}. Код між пакетами спільний через tsconfig path alias (\`@devdigest/*\`), а не через workspace-залежності.`);
table(["Пакет", "Менеджер", "prod / dev deps", "node_modules", "audit", "outdated", "граф імпортів"],
  mods.map(([n, m]) => [n, m.packageManager, `${m.counts.dependencies} / ${m.counts.devDependencies}`, human(m.sizes.nodeModulesDiskKB), m.audit.status, m.outdated.status, m.internal.status]));
table(["Метрика", "Значення"], [
  ["node_modules сумарно (диск)", human(totalDisk)],
  ["Вразливостей (audit)", partial("audit") ? `${vulnTotal} (неповно — див. Limitations)` : String(vulnTotal)],
  ["Пакетів з major-оновленням", partial("outdated") ? `${majorTotal} (неповно — див. Limitations)` : String(majorTotal)],
  ["Пакетів зі зсувом версій між модулями", String(facts.duplicates.filter((d) => d.drift).length)],
  ["Кандидатів на видалення (unused)", String(mods.reduce((s, [, m]) => s + m.packages.filter((x) => x.unusedCandidate).length, 0))],
]);
h(3, "Limitations");
const lim = [];
for (const [n, m] of mods)
  for (const k of ["sizes", "audit", "outdated", "internal"]) if (blocked(m, k)) lim.push(`${n}.${k}: ${m[k].status} — ${m[k].reason}`);
if (facts.offline) lim.push("Запуск з --offline: audit/outdated не виконувались.");
lim.push("unused — евристика (текстовий пошук по коду й конфігах), не доказ: перевіряй перед видаленням.", "Розмір = місце на диску в node_modules, не розмір клієнтського бандла.", ...(analysis.notes || []));
ul(lim);

// ---------- 2. Dependency graph ----------
h(2, "2. Dependency graph");
h(3, "2.1 Зовнішні (npm) залежності по пакетах — топ за розміром, з транзитивними");
mermaid(facts.mermaid.packages);
if (facts.mermaid.sharedAcrossModules) {
  h(3, "2.2 npm-пакети, спільні для кількох модулів (підпис ребра = встановлена версія)");
  mermaid(facts.mermaid.sharedAcrossModules);
}
h(3, "2.3 Внутрішні залежності: модулі коду і зв'язки між пакетами");
p("Внутрішні = код репозиторію (модулі, path-alias, імпорти між пакетами); окремо від зовнішніх npm-пакетів вище.");
for (const [name] of mods) {
  const code = facts.mermaid[`internal_${name}`];
  if (!code) continue;
  p(`**${name}** — ${facts.modules[name].internal.files} файлів, циклів: ${facts.modules[name].internal.circular}, порушень правил: ${facts.modules[name].internal.violations.length}.`);
  mermaid(code);
  if (facts.mermaid[`internal_${name}_note`]) p(`_${facts.mermaid[`internal_${name}_note`]}_`);
}
const cross = mods.flatMap(([n, m]) => (m.internal.crossPackage || []).map((c) => ({ module: n, ...c })));
if (cross.length) {
  const byTarget = new Map();
  for (const c of cross) {
    const k = `${c.module}|${c.specifier}|${c.via}|${c.publicEntry}`;
    (byTarget.get(k) || byTarget.set(k, { ...c, files: 0 }).get(k)).files++;
  }
  p("Імпорти між пакетами. `alias → index` йде через публічну точку входу; `relative` або глибокий шлях її обходить.");
  table(["Пакет-споживач", "Специфікатор", "Спосіб", "Публічна точка входу", "Файлів"],
    [...byTarget.values()].sort((a, b) => Number(a.publicEntry) - Number(b.publicEntry) || b.files - a.files)
      .map((c) => [c.module, c.specifier, c.via, c.publicEntry ? "так" : "**ні — обхід**", String(c.files)]));
}
const noGraph = mods.filter(([, m]) => m.internal.status !== "ok").map(([n, m]) => `${n}: ${m.internal.reason}`);
if (noGraph.length) p(`Без внутрішнього графа: ${noGraph.join("; ")}.`);

// ---------- 3. Sizes ----------
h(2, "3. Sizes");
p("`Власний` — файли самого пакета. `З транзитивними` — пакет + усе, що він тягне (спільні транзитивні рахуються в кожному пакеті, тому сума рядків більша за підсумок модуля). `(lazy)` — пакет імпортується лише через `import()`, тож у початковий бандл не потрапляє.");
for (const [name, m] of mods) {
  h(3, name);
  if (m.sizes.status !== "ok") { p(`Пропущено: ${m.sizes.reason}.`); continue; }
  p(`${m.packageManager} · node_modules на диску: **${human(m.sizes.nodeModulesDiskKB)}** · оголошені залежності разом з транзитивними: **${human(m.sizes.declaredClosureKB)}** (${m.sizes.closurePackages} пакетів) · dependencies: ${m.counts.dependencies}, devDependencies: ${m.counts.devDependencies}`);
  table(["Пакет", "Тип", "Версія", "Власний", "З транзитивними", "Транзит. пакетів", "% модуля", "Імпорт (static/dynamic)"],
    m.packages.filter((x) => x.withTransitiveKB != null).slice(0, 15).map((x) => [
      x.name, x.type === "dependencies" ? "prod" : "dev", x.installed, human(x.selfKB), human(x.withTransitiveKB), String(x.transitiveCount),
      `${Math.round((x.withTransitiveKB / m.sizes.declaredClosureKB) * 100)}%`,
      x.importingFiles == null ? "—" : `${x.staticImportFiles}/${x.dynamicImportFiles}${x.lazyOnly ? " (lazy)" : ""}`,
    ]));
}

// ---------- 4. Findings & Priorities ----------
h(2, "4. Findings & Priorities");
const prios = [...(analysis.priorities || [])].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
for (const lv of LEVELS) {
  const items = prios.filter((x) => x.level === lv);
  if (!items.length) continue;
  h(3, `${lv} — ${LEVEL_NAME[lv]}`);
  table(["Що", "Модуль", "Чому (факти)", "Дія", "Зусилля"], items.map((x) => [x.title, x.module || "—", x.why, x.action, x.effort || "—"]));
}
if (!prios.length) p("Дій не потрібно.");

h(3, "Evidence: вразливості");
const advRows = mods.flatMap(([n, m]) => (m.audit.status === "ok" ? m.audit.advisories.map((a) => [n, a.package, a.severity, a.inProd ? "так" : "dev", a.title, a.fix || "—"]) : []));
const sevOrder = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
advRows.sort((a, b) => (sevOrder[a[2]] ?? 9) - (sevOrder[b[2]] ?? 9));
advRows.length ? table(["Модуль", "Пакет", "Severity", "Prod?", "Опис", "Фікс"], advRows) : p("Вразливостей не знайдено у модулях, де audit виконався (див. Limitations).");
h(3, "Evidence: застарілі пакети (major — перші)");
const outRows = mods.flatMap(([n, m]) => (m.outdated.status === "ok" ? m.outdated.items.filter((i) => i.kind === "major").map((i) => [n, i.package, i.current, i.latest]) : []));
outRows.length ? table(["Модуль", "Пакет", "Поточна", "Остання"], outRows) : p("Major-відставань не знайдено у модулях, де outdated виконався (див. Limitations).");
const minorCount = mods.reduce((s, [, m]) => s + (m.outdated.status === "ok" ? m.outdated.total - m.outdated.major : 0), 0);
if (minorCount) p(`Ще ${minorCount} пакетів з minor/patch-оновленнями — у \`facts.json\`.`);
h(3, "Evidence: кандидати на видалення (unused)");
const unused = mods.flatMap(([n, m]) => m.packages.filter((x) => x.unusedCandidate).map((x) => [n, x.name, x.type === "dependencies" ? "prod" : "dev", human(x.withTransitiveKB)]));
unused.length ? table(["Модуль", "Пакет", "Тип", "Звільнить"], unused) : p("Кандидатів немає.");
h(3, "Evidence: дублікати та зсув версій між модулями");
const dups = facts.duplicates.filter((d) => d.drift);
dups.length ? table(["Пакет", "Версії по модулях"], dups.map((d) => [d.package, d.uses.map((u) => `${u.module}: ${u.installed ?? u.range}`).join(" · ")])) : p("Зсуву версій немає.");
h(3, "Recommendations");
ul((analysis.advice || []).map((a) => `**${a.topic}** — ${a.text}${a.packages?.length ? ` (${a.packages.map((x) => `\`${x}\``).join(", ")})` : ""}`));

// ---------- 5. Summary (last: 3–5 takeaways ordered by priority) ----------
h(2, "5. Summary");
ul((analysis.summary || analysis.tldr || []).slice(0, 5));

// ---------- Markdown renderer ----------
const cell = (s) => String(s ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ");
const md = B.map((b) => {
  switch (b.t) {
    case "h": return `${"#".repeat(b.level)} ${b.text}\n`;
    case "p": return `${b.text}\n`;
    case "ul": return b.items.map((i) => `- ${i}`).join("\n") + "\n";
    case "table": return [`| ${b.head.join(" | ")} |`, `| ${b.head.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n") + "\n";
    case "mermaid": return "```mermaid\n" + b.code + "\n```\n";
  }
}).join("\n");
fs.mkdirSync(path.dirname(path.resolve(mdOut)), { recursive: true });
fs.writeFileSync(mdOut, md);

// ---------- HTML renderer ----------
const esc = (s) => String(s ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/_(.+?)_/g, "<em>$1</em>");
const body = B.map((b) => {
  switch (b.t) {
    case "h": return `<h${b.level}>${inline(b.text)}</h${b.level}>`;
    case "p": return `<p>${inline(b.text)}</p>`;
    case "ul": return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
    case "table": return `<div class="tw"><table class="sortable"><thead><tr>${b.head.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    case "mermaid": return `<pre class="mermaid">${esc(b.code)}</pre>`;
  }
}).join("\n");

const STYLE = `<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#57534e;--line:#e7e5e4;--card:#fff;--accent:#2563eb;--code:#f5f5f4}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141311;--fg:#f5f5f4;--muted:#a8a29e;--line:#2c2926;--card:#1c1a18;--accent:#60a5fa;--code:#262321;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#141311;--fg:#f5f5f4;--muted:#a8a29e;--line:#2c2926;--card:#1c1a18;--accent:#60a5fa;--code:#262321;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.8rem;text-wrap:balance}h2{margin-top:2.5rem;padding-bottom:.3rem;border-bottom:1px solid var(--line)}h3{margin-top:1.6rem}
code{background:var(--code);padding:.1em .35em;border-radius:4px;font-size:.9em}
.tw{overflow-x:auto;margin:.8rem 0;background:var(--card);border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:.45rem .7rem;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{cursor:pointer;color:var(--muted);font-weight:600;white-space:nowrap;user-select:none}th:focus-visible{outline:2px solid var(--accent)}tr:last-child td{border-bottom:0}
pre.mermaid{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto;text-align:center}
</style>`;
const SORT = `<script>
document.querySelectorAll("table.sortable th").forEach(function(th,i){th.tabIndex=0;var go=function(){
 var tb=th.closest("table").tBodies[0],rows=[].slice.call(tb.rows),asc=th.dataset.asc!=="1";th.dataset.asc=asc?"1":"0";
 var num=function(s){var m=s.replace(",",".").match(/^([\\d.]+)\\s*(KB|MB|%)?/);return m?parseFloat(m[1])*(m[2]==="MB"?1024:1):NaN};
 rows.sort(function(a,b){var x=a.cells[i].textContent,y=b.cells[i].textContent,nx=num(x),ny=num(y);
  var c=(!isNaN(nx)&&!isNaN(ny))?nx-ny:x.localeCompare(y);return asc?c:-c});rows.forEach(function(r){tb.appendChild(r)})};
 th.addEventListener("click",go);th.addEventListener("keydown",function(e){if(e.key==="Enter")go()})});
</script>`;
// Default = fragment for the Artifact tool (its wrapper supplies <html>/<head>/<body>; mermaid renders natively).
// --standalone = full page with mermaid from cdnjs, for opening the file directly.
const fragment = `<title>Dependencies Report</title>\n${STYLE}\n<main>\n${body}\n</main>\n${SORT}`;
const html = args.includes("--standalone")
  ? `<!doctype html>\n<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${fragment.replace("\n<main>", "</head><body>\n<main>")}<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.4.0/mermaid.min.js" integrity="sha384-Wm9qzEgq4j1jEnuFK2FxKTlwuhbV2QqtGhcchvjDoKxeJ7WWAW7fysBq+1s6myfX" crossorigin="anonymous"></script><script>mermaid.initialize({startOnLoad:true,theme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"default",securityLevel:"strict"})</script></body></html>`
  : fragment;
fs.mkdirSync(path.dirname(path.resolve(htmlOut)), { recursive: true });
fs.writeFileSync(htmlOut, html);
console.log(`${mdOut}\n${htmlOut}`);
