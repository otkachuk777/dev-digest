#!/usr/bin/env node
// Programmatic grader for dependency-checker evals. Usage: node grade.mjs <run-dir> <eval-id>
// Writes <run-dir>/grading.json with {text, passed, evidence} expectations (skill-creator viewer schema).
import fs from "node:fs";
import path from "node:path";
const [runDir, evalId] = [process.argv[2], Number(process.argv[3])];
const out = path.join(runDir, "outputs");
const mdPath = path.join(out, "report.md");
const md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : "";
const find = (re) => { const m = md.match(re); return m ? m[0].slice(0, 80) : null; };
const sizeUnit = /\b\d+(\.\d+)?\s?(MB|KB|GB|МБ|КБ)\b/g;
const checks = [
  ["Звіт report.md існує і непорожній", () => md.length > 500 && `${md.length} chars`],
  ["Є щонайменше одна Mermaid-схема (```mermaid)", () => find(/```mermaid/)],
  ["Mermaid-схем ≥ 2 (зовнішні пакети + внутрішні/спільні зв'язки)", () => { const n = (md.match(/```mermaid/g) || []).length; return n >= 2 && `${n} diagrams`; }],
  ["Розміри пакетів вказані з одиницями (≥10 значень MB/KB)", () => { const n = (md.match(sizeUnit) || []).length; return n >= 10 && `${n} size values`; }],
  ["Є пріоритизація з рівнями P0–P3 (≥2 різні рівні)", () => { const s = new Set(md.match(/\bP[0-3]\b/g) || []); return s.size >= 2 && [...s].join(","); }],
  ["Є секція порад / рекомендацій", () => find(/^#{1,4}\s.*(Пораді|Поради|Рекомендац|Advice|Recommend)/im)],
  ["Згадані обмеження/що не виміряно (евристика, disk size ≠ bundle тощо)", () => find(/(евристик|обмежен|не вдалося|disk|на диску|не бандл|bundle)/i)],
  ["Згадано вразливості (audit/advisory/CVE/vulnerab)", () => find(/(вразливост|advisor|vulnerab|audit)/i)],
  ["Згадано застарілі пакети (outdated/major)", () => find(/(outdated|застаріл|major)/i)],
];
// Ground truth discovered in iteration 1: mermaid is already imported via import() in client; advice to "move it
// to a dynamic import" is wrong. Fails when a line pairs mermaid with such advice and does not say it is already lazy.
const noFalseLazyAdvice = () => {
  const bad = md.split("\n").filter((l) => /mermaid/i.test(l) && /(винести|вин[еі]сти|перенести|move|extract|замінити на)[^\n]{0,80}(dynamic|динамічн|lazy)/i.test(l) && !/(вже|already|не потрібно|нічого)/i.test(l));
  return bad.length === 0 && "no wrong lazy-load advice for mermaid";
};
const per = {
  1: [["Не радить виносити mermaid в dynamic import (вже lazy)", noFalseLazyAdvice], ["Охоплено ≥5 модулів репозиторію (client, server, reviewer-core, e2e, mcp…)", () => { const n = ["client", "server", "reviewer-core", "e2e", "mcp"].filter((m) => md.includes(m)).length; return n >= 5 && `${n}/5`; }]],
  2: [["Не радить виносити mermaid в dynamic import (вже lazy)", noFalseLazyAdvice], ["Названо mermaid як головний важкий пакет client", () => find(/mermaid[^\n]{0,120}(MB|КБ|KB)|\|\s*mermaid/i)], ["Порада про lazy-load / dynamic import", () => find(/(lazy|dynamic\s*import|next\/dynamic|динамічн)/i)]],
  3: [["@fastify/autoload названо кандидатом на видалення (unused)", () => find(/autoload/i)], ["Є внутрішній граф server/src/modules (згадка модулів pulls/reviews/agents…)", () => { const n = ["pulls", "reviews", "agents", "repos"].filter((m) => md.includes(m)).length; return n >= 3 && `${n}/4 modules`; }], ["Згадано циклічні залежності", () => find(/(цикл|circular|cycle)/i)], ["Порівняння з іншими модулями (дублікати/зсув версій)", () => find(/(дублік|drift|зсув|різн[іи] верс|duplicate)/i)]],
};
const expectations = [...checks, ...(per[evalId] || [])].map(([text, fn]) => { let r = false; try { r = fn(); } catch { /* fail */ } return { text, passed: !!r, evidence: r ? String(r) : "not found" }; });
const passed = expectations.filter((e) => e.passed).length;
fs.writeFileSync(path.join(runDir, "grading.json"), JSON.stringify({ expectations, summary: { passed, failed: expectations.length - passed, total: expectations.length, pass_rate: +(passed / expectations.length).toFixed(2) } }, null, 2));
console.log(path.basename(path.dirname(runDir)), path.basename(runDir), `${passed}/${expectations.length}`);
