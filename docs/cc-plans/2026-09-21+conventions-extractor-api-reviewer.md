# Conventions Extractor + API Contract Reviewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Екран Conventions (Skills Lab), що витягує конвенції з репозиторію `burnjohn/quick-blog` дешевою моделлю з перевіркою доказів кодом, дає accept/reject/edit і збирає прийняте в один скіл `repo-conventions`; плюс новий агент API Contract Reviewer з 4 скілами й експеримент «без скілів vs зі скілами» на PR #484.

**Architecture:** Новий серверний модуль `modules/conventions` (routes → service → repository, чиста логіка в `extract.ts`/`evidence.ts`). Вибірка зразків — кодом (`repoIntel.getConventionSamples` + конфіги), один structured-виклик LLM (`completeStructured`), кожен кандидат проходить кодову перевірку доказів (файл був у вибірці, сніпет реально є у файлі, рядки перераховуються з файлу). Скіл із прийнятих кандидатів клієнт створює наявним `POST /skills` (`source: 'extracted'`), лінкування до агента — наявним Skills-табом агента.

**Tech Stack:** Fastify 5 + Drizzle + Zod, Next.js 15 / React 19 / react-query / next-intl, vitest, OpenRouter (`nvidia/nemotron-3-ultra-550b-a55b:free`).

**Spec:** завдання користувача (ДЗ) + **критерії оцінювання `hw2-criteria.md` (53 пункти, залік = усі обов'язкові; пп. 1–2 користувач виключив — AGENTS.md НЕ робимо)** + `docs/designs/DevDigest_Design.html` (артборди «Conventions (N7)», «Create skill (merged from accepted)», «empty»; вихідник `screen_conv_conf.jsx`).

## Критерії ДЗ №2 → де закриваються

Критерії охоплюють і попередню лабораторну (скіли/агенти), і цю фічу. Статичний аудит `main` показав:

| Пункти | Стан на `main` | Закриває |
|---|---|---|
| 4, 7, 8, 11, 12, 14, 17, 18, 20, 25–27, 30, 35, 36, 53 | вже ОК | лише перевірка (Task 15) |
| 3, 5, 21 | скіл `frontend-ui-architecture` (назва орієнтовна), `pr-self-review` існують; auto-hook на `git push` відсутній, є лише gate на `gh pr create` | перевірка в Task 15 (тип Workflow у frontmatter `pr-self-review`) |
| 6, 44 | немає групи SKILLS LAB | Task 1 |
| 10 | клік веде на `/skills/:id` (master-detail) — перевірити, що список лишається видимим збоку; інакше зробити панель | Task 12 |
| 13, 31, 37 | reorder кнопками ↑↓, немає drag&drop, тоггл лише на прив'язаних | Task 13 |
| 16 | немає скіла з `source: imported_file` | Task 10 (імпорт `deprecation-policy` до нового агента) |
| 19 | у трасі немає числа токенів блоку скілів | Task 14 |
| 22, 23, 24, 34 | немає version/agent_count, delete на картці, модалка підтвердження (зараз `window.confirm`) | Task 12 |
| 28, 29 | немає Diff і Restore (і серверного restore) | Task 12 |
| 32 | у плитці агента лише модель, без провайдера | Task 12 |
| 38–42, 45–52 | Conventions відсутні | Tasks 2–7 |
| 43 | 4 скіли API-агента | Tasks 8, 10 |

## Global Constraints

- **Гілка: `L02-HW`** (від `main`; локально її ще немає). PR — `L02-HW` → `main` у `otkachuk777/dev-digest`.
- Один запуск Extractor'а НЕ має автоматично приймати кандидатів: `accepted` за замовчуванням `false` (критерій 50: «Create skill з'являється після Accept хоча б одного»). У дизайні картки показані прийнятими — це ілюстративний стан.

- Перед роботою в модулі прочитати його `INSIGHTS.md`. Релевантні записи: **server** — «Checking the parent's workspace is not checking the child's» (скопити ОБИДВА боки, репо і рядки конвенцій по `workspaceId`); «A base agent prompt that already teaches the skill's checks hides the skill» (промпт агента не перелічує перевірки, що є в скілах); «two trace builders»; вміст `vendor/shared` дублюється. **client** — «page-level state into layout context» (cleanup `ShellCrumb` не чіпати); не використовувати `@testing-library/user-event` (лише `fireEvent`); `pnpm build` не запускати при живому `next dev`.
- `src/vendor/shared/` існує у `server/` і `client/` — кожну зміну контракту робити в ОБОХ копіях (потім `diff -r`). `platform.ts` зараз синхронний.
- Міграції лише через `pnpm db:generate`; журнал `meta/_journal.json` не переписувати. Lock-файли руками не правити.
- Onion: модулі не імпортують один одного; чужі дані — через `container.*`. Перевірка `pnpm arch` (baseline лише зменшується).
- Стилі — inline `CSSProperties` у `styles.ts`; тести `<Name>.test.tsx`; інтеграційні `*.it.test.ts` самі скіпаються без Docker.
- Wire-поля `snake_case`; i18n — `messages/en/conventions.json` (файл уже існує) + `useTranslations("conventions")`.
- Провайдер/модель Extractor'а: `openrouter` / `nvidia/nemotron-3-ultra-550b-a55b:free` (рішення користувача). Ключ — `OPENROUTER_API_KEY`.
- Сайдбар (правка користувача): **Skills, Agents, Conventions мають бути в блоці SKILLS LAB, а не WORKSPACE**; порядок — Skills, Agents, Conventions. Блок WORKSPACE лишається з Pull Requests.
- Експеримент API-агента — на засіяному PR #484 (`acme/payments-api`); нового агента створюємо через UI, 4 нові скіли, один — через імпорт.
- Один коміт на задачу, Conventional Commits, `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Чернетку цього плану після затвердження `mv` у `docs/cc-plans/2026-09-21+conventions-extractor-api-reviewer.md` і закомітити разом з першим імплементаційним комітом. PR — у `otkachuk777/dev-digest` ← `main`; перед PR — `/pr-self-review`.
- Поза скоупом (додаткові завдання): імпорт скіла з URL, пакування в Claude Code plugin, підвищення якості repo-intel. Згадати у PR як «не робили».

---

## Виявлені факти (з дослідження коду)

- Таблиця `conventions` **уже є** (`server/src/db/schema/knowledge.ts:31`): `id, workspaceId, repoId, rule, evidencePath, evidenceSnippet, confidence, accepted`. Немає `category`, рядків, sha, `created_at`, `sample_count`.
- Контракт `ConventionCandidate` уже є (`contracts/knowledge.ts:181`): `{id, rule, evidence_path, evidence_snippet, confidence, accepted}`.
- `FEATURE_MODELS['conventions']` існує (`contracts/platform.ts:72`), default `openai/gpt-5.4` — змінюємо на OpenRouter/nemotron. Резолв: `resolveFeatureModel(container, workspaceId, 'conventions')` (`modules/settings/feature-models.ts`).
- `container.repoIntel.getConventionSamples(repoId, n): Promise<string[]>` (лише шляхи; `[]`, якщо repo-intel вимкнений/не проіндексований). Вміст: `container.git.readFile({owner,name}, path)`; sha: `container.git.currentHead(repoRef)`.
- LLM: `(await container.llm('openrouter')).completeStructured<T>({model, schema, schemaName, messages, ...})` → `{data, costUsd, tokensIn, tokensOut}`; є parse-with-repair. Тест-мок: `MockLLMProvider(id, {structured, structuredBySchema})`, `overrides.llm`.
- Промпти: `platform/prompts.ts` `renderPrompt(name, vars)` з `server/src/prompts/*.md`; недовірений вміст обгортати `wrapUntrusted(label, text)`.
- Скіли: `POST /skills` приймає `{name, description, type, body, source?, enabled?}`; `source ≠ 'manual'` при ревʼю обгортається як недовірений — для `extracted` це нормально.
- Клієнт: `NAV` у `client/src/vendor/ui/nav.ts` (усі три пункти зараз у WORKSPACE); `helpers.ts:31` у app-shell уже мапить `/conventions` → `"conventions"`; `messages/en/conventions.json` та `nav.conventions` уже є; `Icon.ListChecks` є.
- Засіяний API-агент «API Contract Reviewer» з `api-breaking-changes`/`api-versioning` **не чіпаємо** — новий агент має іншу назву.

## File Structure

**Server (create):** `src/modules/conventions/{routes.ts,service.ts,repository.ts,extract.ts,evidence.ts,helpers.ts,constants.ts}`, `src/prompts/conventions.system.md`, `test/conventions-evidence.test.ts`, `test/conventions-extract.test.ts`, `test/conventions.it.test.ts`, нова міграція (генерується).
**Server (modify):** `src/db/schema/knowledge.ts`, `src/modules/index.ts`, `src/vendor/shared/contracts/{knowledge,platform}.ts`.
**Client (create):** `src/lib/api/conventions.ts`, `src/app/(shell)/repos/[repoId]/conventions/page.tsx`, `.../conventions/_components/{ConventionsView,ConventionCard,CreateSkillFromConventionsModal}/…`.
**Client (modify):** `src/vendor/ui/nav.ts`, `src/vendor/shared/contracts/{knowledge,platform}.ts`, `messages/en/conventions.json`.
**Docs (create):** `docs/api-contract-skills/{breaking-change,response-schema,semver-discipline,deprecation-policy}/SKILL.md`, `docs/agent-prompts/api-contract-skills-lab.md`, `docs/reports/conventions-extractor-quality.md`, `docs/reports/api-contract-experiment.md`.

---

### Task 0: Передумови і гілка

**Files:** —

- [ ] **Step 1: Гілка** — `git switch -c L02-HW` (з `main`; перевірено: гілки `L02-HW` немає локально, є `L01-HW`, `L02-lab`).
- [ ] **Step 2: Перенести план** — `mv ~/.claude/plans/conventions-deep-pond.md docs/cc-plans/2026-09-21+conventions-extractor-api-reviewer.md` (коміт разом із Task 1).
- [ ] **Step 3: Перевірити середовище** — Postgres у Docker піднятий; `server/.env` має `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `REPO_INTEL_ENABLED=true`; `pnpm db:migrate && pnpm db:seed` пройшли.
- [ ] **Step 4: Перевірити, що quick-blog готовий** — `curl -s localhost:3001/repos` містить `burnjohn/quick-blog`; у БД `repos.clone_path` не null і `repo_index_state` показує проіндексований репо (інакше `getConventionSamples` поверне `[]`). Якщо не проіндексований — запустити reindex через UI/Project Context і дочекатися. Зафіксувати `repoId` для наступних задач.
- [ ] **Step 5: Базовий стан** — у `server/` і `client/`: `pnpm typecheck && pnpm test` зелені.

---

### Task 1: Сайдбар — блок SKILLS LAB

**Files:** Modify `client/src/vendor/ui/nav.ts:21-30,55-57`; Test: наявні тести shell/sidebar.

**Interfaces:** Produces: пункт `{ key: "conventions", … href: "/repos/:repoId/conventions" }` (ключ уже мапиться у `app-shell/helpers.ts:31`; `nav.conventions` існує в `messages/en/shell.json`).

- [ ] **Step 1:** Замінити `NAV`:

```ts
export const NAV: NavGroup[] = [
  {
    section: "WORKSPACE",
    items: [
      { key: "pulls", label: "Pull Requests", icon: "GitPullRequest", href: "/repos/:repoId/pulls", gKey: "p" },
    ],
  },
  {
    section: "SKILLS LAB",
    items: [
      { key: "skills", label: "Skills", icon: "Sparkles", href: "/skills", gKey: "s" },
      { key: "agents", label: "Agents", icon: "Cpu", href: "/agents", gKey: "a" },
      { key: "conventions", label: "Conventions", icon: "ListChecks", href: "/repos/:repoId/conventions", gKey: "c" },
    ],
  },
];
```

- [ ] **Step 2:** У `SHORTCUTS` додати `{ keys: "g c", label: "Go to Conventions", group: "Navigation" }`.
- [ ] **Step 3:** `cd client && pnpm typecheck && pnpm test` — якщо тест перевіряв єдину групу WORKSPACE, оновити його очікування (три групи → дві).
- [ ] **Step 4:** Commit `feat(client): move Skills/Agents into Skills Lab nav group and add Conventions` (з архівованим планом).

---

### Task 2: Схема БД і контракти

**Files:** Modify `server/src/db/schema/knowledge.ts:31-42`; `server/src/vendor/shared/contracts/{knowledge.ts:181-189,platform.ts:72-78}` і `client/src/vendor/shared/contracts/*` (ідентично); нова міграція.

**Interfaces:** Produces (використовують Tasks 3–7):

```ts
// contracts/knowledge.ts
export const ConventionCandidate = z.object({
  id: z.string().uuid(),
  category: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_start: z.number().int(),
  evidence_end: z.number().int(),
  evidence_snippet: z.string(),
  evidence_url: z.string().url(),
  confidence: z.number().min(0).max(1),
  accepted: z.boolean(),
});
export const ConventionScan = z.object({
  items: z.array(ConventionCandidate),
  sample_count: z.number().int(),
  scanned_at: z.string().nullable(),
});
export const UpdateConventionInput = z.object({
  accepted: z.boolean().optional(),
  rule: z.string().min(1).optional(),
});
```

- [ ] **Step 1:** У схемі додати колонки (імпортувати `integer`): `category text`, `evidenceStart integer`, `evidenceEnd integer`, `evidenceSha text`, `sampleCount integer notNull default 0`, `createdAt: now()`; `accepted` лишається `default false` (критерій 50); Reject видаляє рядок (критерій 48 — не повертається після перезавантаження).
- [ ] **Step 2:** `cd server && pnpm db:generate` → перевірити, що згенеровано ОДНУ нову міграцію і журнал лише дописано (`git diff meta/_journal.json` — тільки новий запис).
- [ ] **Step 3:** Оновити контракти (вище) в обох `vendor/shared`, у `platform.ts` змінити запис `conventions`: `defaultProvider: 'openrouter'`, `defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free'`. `diff -r server/src/vendor/shared client/src/vendor/shared` для цих двох файлів — порожній.
- [ ] **Step 4:** `pnpm db:migrate`; `pnpm typecheck` (server і client).
- [ ] **Step 5:** Commit `feat(conventions): extend conventions table and shared contracts`.

---

### Task 3: Перевірка доказів (чиста логіка, TDD)

**Files:** Create `server/src/modules/conventions/evidence.ts`; Test `server/test/conventions-evidence.test.ts`.

**Interfaces:** Produces: `verifyEvidence(fileText: string, claim: { snippet: string; startLine: number }): { startLine: number; endLine: number; snippet: string } | null`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { verifyEvidence } from '../src/modules/conventions/evidence.js';

const file = ['import x from "x";', '', 'export async function load(id) {', '  const u = await db.find(id);', '  return u;', '}'].join('\n');

describe('verifyEvidence', () => {
  it('relocates real line numbers from the file, ignoring the model\'s claim', () => {
    const r = verifyEvidence(file, { snippet: 'const u = await db.find(id);\nreturn u;', startLine: 99 });
    expect(r).toEqual({ startLine: 4, endLine: 5, snippet: '  const u = await db.find(id);\n  return u;' });
  });
  it('rejects a snippet that is not in the file', () => {
    expect(verifyEvidence(file, { snippet: 'fetch(url).then(r => r.json())', startLine: 4 })).toBeNull();
  });
  it('rejects trivially short snippets', () => {
    expect(verifyEvidence(file, { snippet: '}', startLine: 6 })).toBeNull();
  });
  it('prefers the occurrence nearest the claimed line', () => {
    const dup = ['const a = compute(1);', 'x', 'y', 'const a = compute(1);'].join('\n');
    expect(verifyEvidence(dup, { snippet: 'const a = compute(1);', startLine: 4 })?.startLine).toBe(4);
  });
});
```

- [ ] **Step 2:** `cd server && pnpm vitest run test/conventions-evidence.test.ts` → FAIL (модуля немає).
- [ ] **Step 3: Реалізація**

```ts
const MIN_SNIPPET_CHARS = 8;

export interface VerifiedEvidence { startLine: number; endLine: number; snippet: string }

/**
 * Locate the snippet in the file (line-trimmed, contiguous) and return the REAL
 * line range. The model's line numbers are only a tiebreaker between duplicates.
 * ponytail: contiguous match only — a snippet that skips blank file lines is
 * rejected; loosen to a fuzzy match if the quality report shows real misses.
 */
export function verifyEvidence(
  fileText: string,
  claim: { snippet: string; startLine: number },
): VerifiedEvidence | null {
  const want = claim.snippet.split('\n').map((l) => l.trim()).filter(Boolean);
  if (want.join('').length < MIN_SNIPPET_CHARS) return null;
  const lines = fileText.split('\n');
  const norm = lines.map((l) => l.trim());
  const hits: number[] = [];
  for (let i = 0; i + want.length <= norm.length; i++) {
    if (want.every((w, k) => norm[i + k] === w)) hits.push(i);
  }
  if (!hits.length) return null;
  const best = hits.reduce((a, b) =>
    Math.abs(b + 1 - claim.startLine) < Math.abs(a + 1 - claim.startLine) ? b : a,
  );
  return {
    startLine: best + 1,
    endLine: best + want.length,
    snippet: lines.slice(best, best + want.length).join('\n'),
  };
}
```

- [ ] **Step 4:** Тест → PASS. **Step 5:** Commit `feat(conventions): verify candidate evidence against file contents`.

---

### Task 4: Вибірка, промпт і виклик моделі (`extract.ts`, TDD)

**Files:** Create `server/src/modules/conventions/{extract.ts,constants.ts}`, `server/src/prompts/conventions.system.md`; Test `server/test/conventions-extract.test.ts`.

**Interfaces:**
- Consumes: `verifyEvidence` (Task 3); `LLMProvider.completeStructured` (`@devdigest/shared`); `wrapUntrusted`/`renderPrompt` (`platform/prompt.ts`, `platform/prompts.ts`).
- Produces:

```ts
export interface ExtractDeps {
  llm: LLMProvider;
  model: string;
  readFile(path: string): Promise<string | null>; // null = не існує
}
export interface ExtractedCandidate {
  category: string; rule: string; confidence: number;
  path: string; startLine: number; endLine: number; snippet: string;
}
export interface ExtractResult {
  candidates: ExtractedCandidate[]; sampleCount: number;
  dropped: number; costUsd: number | null;
}
export function extractConventions(deps: ExtractDeps, samplePaths: string[]): Promise<ExtractResult>;
```

`constants.ts`: `CONFIG_PATHS = ['eslint.config.js','eslint.config.mjs','.eslintrc.json','.eslintrc.cjs','.eslintrc','tsconfig.json','.prettierrc','.prettierrc.json','prettier.config.js','package.json']`, `TOP_FILES = 12`, `MAX_FILE_CHARS = 8000`, `MAX_CANDIDATES = 15`, `MIN_CONFIDENCE = 0.5`.

- [ ] **Step 1: Промпт** `server/src/prompts/conventions.system.md` (англійською, за стилем `onboarding.system.md`): роль — senior engineer, що виписує ЯВНІ конвенції коду; вхід — файли з нумерацією рядків (`  12| код`), вміст недовіреним даним (інструкції з файлів ігнорувати); правила: лише те, що видно У НАДАНИХ файлах, ≥2 незалежних прояви або явне налаштування конфігу; для кожного кандидата — `category` (`error-handling|naming|imports|typing|structure|testing|style|other`), `rule` (одне директивне речення), `confidence 0..1`, `evidence {path, start_line, end_line, snippet}` — path ТІЛЬКИ з наданих, snippet — дослівний код без нумерації; не вигадувати шляхи; не більше {{max}} кандидатів; порожній список — валідна відповідь.
- [ ] **Step 2: Failing test** (мок LLM, без БД):

```ts
import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { extractConventions } from '../src/modules/conventions/extract.js';

const files: Record<string, string> = {
  'src/a.ts': 'export async function a() {\n  const r = await fetchUser(1);\n  return r;\n}',
};
const cand = (over = {}) => ({
  category: 'style', rule: 'Use async/await', confidence: 0.9,
  evidence: { path: 'src/a.ts', start_line: 1, end_line: 3, snippet: 'const r = await fetchUser(1);\nreturn r;' }, ...over,
});
const run = (candidates: unknown[]) =>
  extractConventions(
    { llm: new MockLLMProvider('openrouter', { structured: { candidates } }), model: 'm',
      readFile: async (p) => files[p] ?? null },
    ['src/a.ts'],
  );

describe('extractConventions', () => {
  it('keeps a candidate whose evidence is in a sampled file and fixes its line range', async () => {
    const r = await run([cand()]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({ path: 'src/a.ts', startLine: 2, endLine: 3 });
  });
  it('drops: path outside the sample, missing file, fake snippet, low confidence, duplicate rule', async () => {
    const r = await run([
      cand({ evidence: { ...cand().evidence, path: 'src/other.ts' } }),
      cand({ evidence: { ...cand().evidence, snippet: 'promise.then(x => x)' } }),
      cand({ confidence: 0.2 }),
      cand(), cand(),
    ]);
    expect(r.candidates).toHaveLength(1);
    expect(r.dropped).toBe(4);
  });
});
```

- [ ] **Step 3:** vitest → FAIL. **Step 4: Реалізація** `extract.ts`: (1) `paths = unique([...CONFIG_PATHS, ...samplePaths])`; читати кожен через `readFile`, пропустити `null`; (2) обрізати до `MAX_FILE_CHARS`, префіксувати рядки `String(n).padStart(4)+'| '`; (3) `sampleCount = кількість прочитаних файлів`; (4) messages: system = `renderPrompt('conventions.system', { max: MAX_CANDIDATES })`, user = `wrapUntrusted('file:'+path, numbered)` для кожного файлу; (5) `completeStructured({ model, schema: ExtractionSchema, schemaName: 'ConventionExtraction', messages, temperature: 0, timeoutMs: 90_000 })`, де `ExtractionSchema = z.object({ candidates: z.array(z.object({ category, rule, confidence, evidence: z.object({ path, start_line, end_line, snippet }) })) })`; (6) фільтр по кандидату: `readSet.has(path)` → `verifyEvidence(text, {snippet, startLine: start_line})` (використати ОРИГІНАЛЬНИЙ, не обрізаний текст, якщо файл був обрізаний — читати повний і в промпт слати обрізаний) → `confidence >= MIN_CONFIDENCE` → унікальність за `rule.toLowerCase()` → `slice(0, MAX_CANDIDATES)`; `dropped = raw.length - kept.length`.
- [ ] **Step 5:** vitest → PASS. **Step 6:** Commit `feat(conventions): sample files and extract grounded candidates with the model`.

---

### Task 5: Репозиторій, сервіс, роути

**Files:** Create `modules/conventions/{repository.ts,service.ts,helpers.ts,routes.ts}`; Modify `modules/index.ts` (реєстрація); Test `server/test/conventions.it.test.ts`.

**Interfaces:**
- Consumes: `extractConventions` (Task 4); `resolveFeatureModel`; `container.repoIntel.getConventionSamples`; `container.git.readFile/currentHead`; `container.llm('openrouter')`; `getContext` (`_shared/context.ts`); `IdParams`.
- Produces (HTTP): `GET /repos/:id/conventions → ConventionScan`; `POST /repos/:id/conventions/extract → ConventionScan` (замінює всі рядки репо в транзакції, `accepted: false`); `PATCH /conventions/:id` body `UpdateConventionInput → ConventionCandidate`; `DELETE /conventions/:id → 204` (Reject).

- [ ] **Step 1:** `helpers.ts`: `evidenceUrl(fullName, sha, path, start, end) = \`https://github.com/${fullName}/blob/${sha}/${path}#L${start}-L${end}\``; `toCandidateDto(row, {fullName})` (snake_case, `evidence_url` з `evidenceSha ?? repo.defaultBranch`).
- [ ] **Step 2:** `repository.ts` (клас над `container.db`): `repoBasics(workspaceId, repoId)` — вибірка з `t.repos` **з фільтром `workspaceId`** (за INSIGHTS: скоуп на обох сторонах) → `{id, owner, name, fullName, defaultBranch}`; `list(workspaceId, repoId)`; `replaceForRepo(workspaceId, repoId, rows)` (транзакція delete+insert); `update(workspaceId, id, patch)` і `delete(workspaceId, id)` — обидва з `and(eq(id), eq(workspaceId))`. Якщо в `container` є готовий геттер репозиторію repos — використати його замість прямого запиту (перевірити `container.ts`).
- [ ] **Step 3:** `service.ts`: `extract(workspaceId, repoId)` — `repoBasics` (404 `NotFoundError`), `samples = await container.repoIntel.getConventionSamples(repoId, TOP_FILES)`; порожній список → `ValidationError('Repo is not indexed yet — run reindex in Project Context')` (422); `choice = await resolveFeatureModel(...,'conventions')`; `llm = await container.llm(choice.provider)`; `sha = await container.git.currentHead(ref)`; `readFile = (p) => container.git.readFile(ref, p).catch(() => null)`; `extractConventions(...)`; зберегти рядки (`sampleCount`, `evidenceSha: sha`); залогувати `costUsd`/`dropped`; повернути `list`.
- [ ] **Step 4:** `routes.ts` за шаблоном `modules/skills/routes.ts` (`ZodTypeProvider`, `getContext`, Zod-схеми з `@devdigest/shared`); `scanned_at` = `max(created_at)`, `sample_count` = з першого рядка (0, якщо порожньо). Зареєструвати в `modules/index.ts`.
- [ ] **Step 5: Інтеграційний тест** `conventions.it.test.ts` (за шаблоном `skills.it.test.ts`, `dockerAvailable`): `overrides` — `MockLLMProvider('openrouter', {structured:{candidates:[…]}})`, `repoIntel` з `getConventionSamples: async () => ['src/a.ts']`, `MockGitClient`/фейк з `readFile`+`currentHead`. Перевірити: POST extract → 200, `items[0].evidence_url` містить `/blob/<sha>/src/a.ts#L2-L3`; повторний POST замінює (не дублює); PATCH `{accepted:false}` зберігається; DELETE → 204 і зникає; **репо з іншого workspace → 404** (міжтенантний кейс).
- [ ] **Step 6:** `pnpm typecheck && pnpm test && pnpm arch` — без нових порушень. **Step 7:** Commit `feat(conventions): extract/list/update/reject endpoints`.

---

### Task 6: Клієнт — екран Conventions

**Files:** Create `client/src/lib/api/conventions.ts`, `…/repos/[repoId]/conventions/page.tsx`, `_components/ConventionsView/{ConventionsView.tsx,index.ts,styles.ts,helpers.ts,constants.ts,ConventionsView.test.tsx}`, `_components/ConventionCard/{ConventionCard.tsx,index.ts,styles.ts,helpers.ts,ConventionCard.test.tsx}`; Modify `messages/en/conventions.json`.

**Interfaces:**
- Consumes: `ConventionCandidate`, `ConventionScan`, `UpdateConventionInput` (Task 2); `useActiveRepo`, `useRepoNotFound`, `ShellCrumb`; `@devdigest/ui` (`Button`, `Card`, `EmptyState`, `ErrorState`, `ProgressBar`, `MonoLink`, `Icon`, `Skeleton`, `TextInput`).
- Produces: `conventionKeys`, `useConventions(repoId)`, `useExtractConventions(repoId)`, `useUpdateConvention()`, `useRejectConvention()`; `ConventionsView` приймає `{ repoId: string }`.

- [ ] **Step 1: API-шар** за зразком `lib/api/context.ts`: `conventionKeys.list(repoId)`; `useConventions` (`api.get('/repos/${id}/conventions', ConventionScan)`), `useExtractConventions` (POST, `onSuccess` → `setQueryData`), `useUpdateConvention` (PATCH, invalidate), `useRejectConvention` (DELETE, invalidate).
- [ ] **Step 2: i18n** — доповнити `conventions.json`: `page.subtitleScan` («Detected from {count} sample files · last scan {when}»), `page.deselectAll`, `page.acceptAll`, `page.acceptedCount` («{accepted} of {total} accepted»), `page.createSkill`, `card.accept`, `card.reject`, `card.edit`, `card.copy`, `card.viewOnGithub`, ключі модалки `modal.*` (title «Create skill from conventions», banner, labels Name/Description/Type/Enabled/Skill body, hint-и, `footer` «Saved as v1 · added to Skills Lab», cancel, create). Наявні ключі не перейменовувати.
- [ ] **Step 3: Сторінка** `page.tsx` — тонка: `useParams<{repoId}>` → `<Suspense><ConventionsView repoId=… /></Suspense>` (як `pulls/page.tsx`).
- [ ] **Step 4: `ConventionsView`** за дизайном: контейнер `maxWidth 880`, `padding "20px 28px 40px"`; `ShellCrumb` (`crumbLab`, `crumbConventions`); заголовок `Conventions in <mono accent>{repo}</mono>`; підзаголовок зі `sample_count` і відносним `scanned_at`; **дві окремі кнопки (п. 45):** «Run Scan» (`primary sm`; активна лише коли кандидатів ще немає) і «ReScan» (`secondary sm`, `RefreshCw`; активна лише коли вони є); обидві видимі завжди, `loading` поки триває POST extract; toolbar: «Deselect all/Accept all» (ghost sm; `Promise.all` по `useUpdateConvention`), лічильник «N of M accepted», праворуч `Create skill` (`primary sm`, `Sparkles`) — **рендериться лише коли accepted ≥ 1** (п. 50); порожній стан `EmptyState icon="ListChecks"` з CTA «Run Scan» (замість «Run extraction» у i18n `page.runExtraction`); `ErrorState` з `onRetry` при помилці extract (текст 422 «not indexed» показати як є). Скелетон на завантаженні.
- [ ] **Step 5: `ConventionCard`** за дизайном: `borderLeft: 3px solid var(--ok)` якщо accepted, інакше `var(--border)`; правило — italic 14px/600; **три кнопки Accept / Reject / Edit (п. 47)**: «Edit» перемикає правило на місці в `TextInput` (inline, п. 49) зі Save/Cancel → PATCH `{rule}`; блок доказів: `MonoLink` `path:start-end` з `href={evidence_url}` `target="_blank" rel="noreferrer"` (клікабельне посилання на GitHub — критерій ДЗ), іконка Copy копіює `evidence_snippet`, `<pre class="mono">` зі сніпетом; рядок Confidence: `ProgressBar` 90px, колір `confidence >= 0.85 ? 'var(--ok)' : 'var(--warn)'`, `%`; права колонка 150px: «Accepted»(primary, Check)/«Accept»(secondary, Plus) → PATCH `{accepted}`; «Reject» (ghost, X) → DELETE.
- [ ] **Step 6: Тести** (RTL, `vi.mock('@/lib/api/conventions')`, `fireEvent`, `NextIntlClientProvider` з `conventions.json`): картка показує лінк з `href` = `evidence_url`; клік «Reject» викликає `mutate` з id; клік «Accepted» викликає update з `{accepted:false}`; `ConventionsView` при 0 прийнятих НЕ рендерить `Create skill`, а після Accept — рендерить; є кнопки «Run Scan» і «ReScan»; «Edit» показує input і зберігає правило; порожній стан показує CTA «Run Scan». `helpers.ts`: `confidenceColor(c)`, `formatEvidenceRange(path,s,e)` — юніт-тести.
- [ ] **Step 7:** `pnpm typecheck && pnpm test`. **Step 8:** Commit `feat(client): conventions screen with accept/reject/edit`.

---

### Task 7: Модалка «Create skill from conventions»

**Files:** Create `_components/CreateSkillFromConventionsModal/{CreateSkillFromConventionsModal.tsx,index.ts,styles.ts,helpers.ts,constants.ts,CreateSkillFromConventionsModal.test.tsx}`; Modify `ConventionsView.tsx` (відкриття модалки).

**Interfaces:**
- Consumes: `useCreateSkill` (`lib/api/skills.ts`, `POST /skills`, приймає `source`, `enabled`); `Modal`, `FormField`, `TextInput`, `SelectInput`, `Toggle`, `Textarea`, `Badge`, `Icon`.
- Produces: `conventionsToDraft(accepted: ConventionCandidate[], repoName: string): { name: string; description: string; body: string }`.

- [ ] **Step 1: Failing test для `conventionsToDraft`:**

```ts
it('merges only the given (accepted) conventions into one repo-conventions skill body', () => {
  const d = conventionsToDraft(
    [{ id: '1', category: 'style', rule: 'Use async/await', evidence_path: 'src/a.ts', evidence_start: 2, evidence_end: 3,
       evidence_snippet: 'const r = await f();', evidence_url: 'https://github.com/o/r/blob/abc/src/a.ts#L2-L3', confidence: .9, accepted: true }],
    'quick-blog',
  );
  expect(d.name).toBe('repo-conventions');
  expect(d.description).toBe('1 house conventions extracted from quick-blog');
  expect(d.body).toContain('# repo-conventions');
  expect(d.body).toContain('Use async/await');
  expect(d.body).toContain('[src/a.ts:2-3](https://github.com/o/r/blob/abc/src/a.ts#L2-L3)');
  expect(d.body).toContain('const r = await f();');
});
```

- [ ] **Step 2:** FAIL → реалізувати за `conventionsToDraft` з дизайну: `# repo-conventions`, речення «House conventions for `repo`. Flag changes that violate any rule below and cite the offending `file:line`.», далі `## <slug правила>` + правило + `Detected in [path:s-e](evidence_url):` + fenced-сніпет. Ім'я завжди `repo-conventions` (вимога ДЗ; поле редаговане). У body — лише переданий список (accepted), відхилені туди потрапити не можуть.
- [ ] **Step 3: Модалка** (`Modal width=760`, `subtitle={name}`): банер «Merged from **N accepted conventions** in `repo`. Everything below is editable before you save.»; Name (mono, required), Description, Type (`SelectInput`: rubric/convention/security/custom, default `convention`) поруч з Enabled (`Toggle`, default on, підказка «Whether this block is added to agents' prompts.»); Skill body — редактор із нумерацією рядків: **мінімальний варіант** — `Textarea mono` 460px + лічильник токенів `Math.round(len/4)` і бейдж `unsaved` у шапці (окремий line-numbered editor з дизайну — прототипний компонент; не будуємо, ponytail: додати лише якщо викладач вимагатиме нумерацію). Footer: «Saved as v1 · added to Skills Lab», Cancel, `Create skill` (`primary`, `Sparkles`, loading).
- [ ] **Step 4:** Додати в модалку необов'язковий `SelectInput` «Attach to agent» (`useAgents()`, порожній варіант «— none —»; п. 42). Submit → `create.mutateAsync({ name, description, type, body, source: 'extracted', enabled })`; якщо вибрано агента — `POST /agents/:agentId/skills` з `{skill_id, order?}` (append; наявний ендпоінт, `useLinkAgentSkill`/`api.post` у `lib/api/agents.ts`); → закрити → `router.push('/skills/' + id)`. Тест: при вибраному агенті викликається лінк із `skill_id` нового скіла. Тест: клік Create шле payload з `source: 'extracted'` і body без відхилених правил; кнопка disabled при порожніх `name`/`body`. Якщо `CreateSkillInput` (`contracts/knowledge.ts:142`) не приймає `enabled` — додати в обох копіях і в `SkillsService.create` (уже передає `enabled`).
- [ ] **Step 5:** `pnpm typecheck && pnpm test`. **Step 6:** Commit `feat(client): create skill from accepted conventions`.

---

### Task 8: Матеріали API Contract Reviewer (промпт + 4 скіли)

**Files:** Create `docs/agent-prompts/api-contract-skills-lab.md`, `docs/api-contract-skills/<name>/SKILL.md` ×4.

**Принцип (INSIGHTS):** промпт агента володіє роллю, стеком, severity/verdict/дисципліною знахідок і **не містить жодного списку перевірок контракту**; уся «що перевіряти» — у скілах. Інакше експеримент нічого не доведе.

- [ ] **Step 1: Промпт** «API Contract Reviewer (Skills Lab)»: роль — рев'юер PR для Node.js/TS HTTP-сервісу (Fastify 5, zod, snake_case на дроті); отримує повний diff; «report defects you can show reaching a caller»; severity CRITICAL/WARNING/SUGGESTION (CRITICAL — єдиний, що блокує merge, лише коли можна показати зламаного клієнта); verdict як функція знахідок (як у `docs/agent-prompts/api-contract-reviewer.md:52-59`); findings discipline (унікальні, точні `file:line` з diff, `kind: "finding"`, нуль знахідок — валідно). **Без** розділів «What to look for»/«How to analyze» з порівнянням BEFORE/AFTER.
- [ ] **Step 2: Скіли** — кожен `SKILL.md` з frontmatter (`name`, `description` директивним стилем «Use when the diff…») + тіло: правила, та блок **Good / Bad** з кодом, + рівні severity. Зміст:
  - `breaking-change` — зміна/видалення публічного контракту (нове required поле, перейменування/видалення query/path/поля, звуження enum, посилення валідації, зміна методу/шляху/статусу); CRITICAL для публічного роуту, SUGGESTION для внутрішнього з оновленими викликачами; вимагати назвати клієнта, що ламається.
  - `response-schema` — зміни форми відповіді: тип поля, nullable↔non-null, optional→required, масив→обгортка `{items}`, змінена форма помилки; Good: додати поле адитивно / зберегти старе поруч.
  - `semver-discipline` — коли потрібен major (будь-яка breaking зміна публічного API), minor (адитивна), patch (без зміни контракту); перевіряти, чи бампнуто версію/`/v2`/CHANGELOG разом зі зміною.
  - `deprecation-policy` — не видаляти мовчки: залишити старе поле/роут, позначити `Deprecation`/`Sunset` заголовками або `deprecated` у схемі, назвати заміну, вікно міграції; Bad: перейменувати поле «на місці».
- [ ] **Step 3:** Commit `docs: API Contract Reviewer prompt and four skills`.

---

### Task 9: Живий прогін Extractor'а на quick-blog + звіт якості

**Files:** Create `docs/reports/conventions-extractor-quality.md`.

- [ ] **Step 1:** `pnpm dev` (server+client, окремі процеси; НЕ `pnpm build` поки dev запущений). Відкрити `/repos/<quick-blog-id>/conventions`, натиснути Run extraction. Спостерігати мережу/`preview_logs`: відповідь 200 за ≤90 с. Якщо free-модель повертає невалідний JSON/порожньо — перевірити `attempts`/repair у логах; запасний вихід — тимчасовий override у Settings → Feature Models (не змінюючи код) і зафіксувати це у звіті.
- [ ] **Step 2:** Для кожного кандидата вручну відкрити `evidence_url`, підтвердити, що код на GitHub збігається зі сніпетом і рядками (SHA = HEAD клону; якщо локальний HEAD не запушений — `evidence_url` дасть 404, тоді використати `defaultBranch`/запушений коміт і зафіксувати).
- [ ] **Step 3:** Розмітити кожного кандидата: **valid / trivial / wrong**; у UI прийняти valid, відхилити решту; перевірити, що Reject прибирає картку і після Re-scan дані замінюються.
- [ ] **Step 4:** Написати звіт: скільки кандидатів згенеровано / відкинуто перевіркою доказів (`dropped` з логів) / прийнято; частка valid; 2–3 приклади добрих і поганих; вартість (`costUsd` із логів, для `:free` — 0/null); ідеї покращення (більше сигналів у repo-intel, 2-кроковий діалог «вибір файлів → витяг», вибірка за шаром).
- [ ] **Step 4b:** `Create skill` → перевірити тіло (лише прийняті, лінки на GitHub), `enabled`, створення v1 у Skills.
- [ ] **Step 5:** Commit `docs: conventions extractor quality report`.

---

### Task 10: Агент + скіли через UI і експеримент на PR #484

**Files:** Create `docs/reports/api-contract-experiment.md`.

- [ ] **Step 1: Створити агента через UI** (Agents → New; якщо кнопки немає — `POST /agents` як запасний шлях і зафіксувати це у звіті): назва «API Contract Reviewer (Skills Lab)», провайдер `openrouter`, та сама модель, що й у засіяних агентів (`deepseek/deepseek-v4-flash`), промпт із Task 8.
- [ ] **Step 2: Скіли** — три скіли створити через Skills → Create (вставити тексти з `docs/api-contract-skills/`), **один (`deprecation-policy`) — через Import** (`.md` або `.zip` за `docs/skills-import-demo/README.md`: `zip -qr` з `SKILL.md`), щоб пройти шлях імпорту й закрити п. 16 (прив'язаний до нового агента скіл має походження `imported_file`). Після імпорту скіл `enabled: false` — увімкнути.
- [ ] **Step 3: Прогін A (без скілів)** — до агента нічого не прив'язано; Pull Requests → `acme/payments-api` → PR #484 → Review з цим агентом. Зберегти: findings, verdict, summary; відкрити Trace і підтвердити, що блок `skills` порожній.
- [ ] **Step 4: Прив'язка** — Agents → агент → вкладка Skills → додати всі 4 скіли (порядок: breaking-change, response-schema, semver-discipline, deprecation-policy).
- [ ] **Step 5: Прогін B (зі скілами)** — ще раз Review на #484; у Trace підтвердити `skills: 4 skill(s) attached`.
- [ ] **Step 6: Порівняння** (у звіті таблицею): findings/severity/verdict/чи названо зламаного клієнта (`page_size` замість `limit`, обов'язкові `status`/`customer_id`, `failed` зник з enum, масив → `{items}`). Очікування: A — пропускає або `comment`; B — CRITICAL + `request_changes`. **Якщо A теж ловить breaking change** — це проблема промпту, не скілів (INSIGHTS): урізати generic-формулювання промпту, повторити A і B, чесно зафіксувати обидва набори прогонів у звіті.
- [ ] **Step 7:** Прив'язати `repo-conventions` (Task 9) до одного з наявних ревʼю-агентів (напр., General Reviewer) у його Skills-табі і запустити ревʼю — підтвердити в Trace, що блок скілів містить `repo-conventions` (критерій «прилінкований і запускається на ревʼю»).
- [ ] **Step 8:** Commit `docs: API contract reviewer skills experiment report`.

---

### Task 12: Skills — картка, видалення, Diff/Restore, панель, плитка агента (пп. 10, 22–24, 28, 29, 32, 34)

**Files:** Modify `server/src/modules/skills/{routes.ts,service.ts,repository.ts,helpers.ts}`, `*/vendor/shared/contracts/knowledge.ts` (обидві копії: `Skill.agent_count: z.number().int()`), `client/src/lib/api/skills.ts`, `client/.../skills/_components/SkillsView/_components/{SkillCard,SkillEditor/_components/{ConfigTab,VersionsTab}}/…`, `client/.../agents/_components/AgentCard/AgentCard.tsx`; Create `client/src/components/confirm-modal/{ConfirmModal.tsx,index.ts,styles.ts,ConfirmModal.test.tsx}`, `…/VersionsTab/helpers.ts` (`lineDiff`), тести; Test: `server/test/skills.it.test.ts` (доповнити), `server/test/skills-helpers.test.ts`.

**Interfaces:** Produces: `POST /skills/:id/versions/:version/restore → Skill`; `Skill.agent_count`; `<ConfirmModal open title body confirmLabel onConfirm onClose />` (спільний, бо 3 споживачі — `SkillCard`, `ConfigTab`, `AgentCard`); `lineDiff(a: string, b: string): { type: 'same'|'add'|'del'; text: string }[]`.

- [ ] **Step 1 (п. 22): `agent_count`.** У репозиторії скілів — підрахунок `count(*)` з `agent_skills` по `skill_id` (один запит з `groupBy` для `list`, join/підзапит для `byId`); `toSkillDto` віддає `agent_count`. Failing IT-тест: скіл, прив'язаний до 2 агентів, повертає `agent_count: 2`, непривʼязаний — `0`. Картка показує `v{version}` і «{n} agents» (i18n `skills` namespace — додати ключі `listItem.version`, `listItem.agentCount` як ICU plural).
- [ ] **Step 2 (пп. 23–24, 34): ConfirmModal.** Написати компонент на `Modal` з `@devdigest/ui` (кнопки Cancel / Delete, хрестик — вбудований `onClose`). На `SkillCard` додати кнопку «Delete» (IconBtn `Trash`, `stopPropagation`, щоб не відкривати картку) → `ConfirmModal` → `useDeleteSkill`. У `ConfigTab.tsx:50` і `AgentCard.tsx:41` замінити `window.confirm` на `ConfirmModal`. Тести: підтвердження викликає delete, Cancel і хрестик — ні (`fireEvent`).
- [ ] **Step 3 (п. 29): Restore.** Failing IT-тест: скіл v1 (body A) → PUT body B (v2) → `POST /skills/:id/versions/1/restore` → відповідь `body == A`, `version == 3` (restore = нова версія, історія не переписується), чужий workspace → 404. Реалізація: сервіс бере знімок через `repo.listVersions`/`byId` з workspace-скоупом і викликає наявний `repo.update(workspaceId, id, { body })`, що сам створює новий snapshot. Клієнт: `useRestoreSkillVersion` (invalidate `skillKeys.all/detail/versions`), кнопка «Restore» у кожному рядку не-поточної версії.
- [ ] **Step 4 (п. 28): Diff.** `helpers.ts` — `lineDiff` (ponytail: простий LCS по рядках, достатньо для тіл скілів; юніт-тест: додавання/видалення/без змін). Кнопка «Diff» на кожній попередній версії розкриває блок під рядком із рядками `add` (`--ok-bg`) / `del` (`--crit-bg`) — версія vs поточна.
- [ ] **Step 5 (п. 32): плитка агента** показує `provider · model` (наприклад `openrouter · deepseek/deepseek-v4-flash`).
- [ ] **Step 6 (п. 10): бічна панель.** У браузері перевірити: клік по картці відкриває прев'ю справа, а список лишається видимим. Аудит бачив master-detail на `/skills/:id` — якщо список зникає або відкривається окрема сторінка, змінити `SkillsView` так, щоб деталі рендерились у правій панелі того ж екрана (вкладки Config/Preview/Versioning із п. 25 зберегти). Якщо вже так — нічого не змінювати, зафіксувати в Task 15.
- [ ] **Step 7:** `pnpm typecheck && pnpm test` (server + client), `diff -r` контрактів. Commit `feat(skills): card version/agent count, confirm delete, diff and restore`.

---

### Task 13: Skills-таб агента — drag&drop і тоггл на кожному скілі (пп. 13, 14, 31, 37)

**Files:** Modify `client/.../agents/[id]/_components/AgentEditor/_components/SkillsTab/{SkillsTab.tsx,styles.ts,helpers.ts}`, `SkillsTab.test.tsx`.

**Interfaces:** Consumes: `useSetAgentSkills` (`POST /agents/:id/skills`, `{skill_ids: {id, enabled}[]}` — порядок масиву = `order`, вже впливає на промпт: `agents/repository.ts:208,244`, `reviews/helpers.ts:115`). Produces: `reorder(ids: string[], from: string, to: string): string[]` у `helpers.ts`.

- [ ] **Step 1: Failing тест** `reorder(['a','b','c'], 'c', 'a') → ['c','a','b']`; невідомий id → без змін.
- [ ] **Step 2:** Нативний HTML5 DnD без бібліотек (у `client` dnd-залежностей немає; ponytail: миша/тач-девайси без клавіатурної альтернативи — кнопки ↑↓ **залишити** як a11y-фолбек): `draggable` лише для рядків `attached && enabled` (п. 31; вимкнені й непривʼязані не драгаються і не є дропзоною), `onDragStart/onDragOver(preventDefault)/onDrop` → `reorder` → `setSkills` з новим порядком (оптимістичне оновлення вже є).
- [ ] **Step 3 (п. 37):** тоггл показувати на КОЖНОМУ рядку списку всіх скілів системи; на непривʼязаному рядку клік прив'язує скіл із `enabled: true` (одна дія), на привʼязаному — перемикає `enabled`; чекбокс прив'язки залишити. Лейбл типу вже є.
- [ ] **Step 4: Тести** (`fireEvent.dragStart/dragOver/drop`): drop `c` на `a` викликає `mutate` із порядком `[c,a,b]`; вимкнений рядок має `draggable=false`; тоггл присутній у непривʼязаного рядка й прив'язує його.
- [ ] **Step 5:** `pnpm typecheck && pnpm test`. Commit `feat(agents): drag&drop skill order for enabled skills and toggle on every row`.

---

### Task 14: Трейс — токени блоку скілів (пп. 19, 20)

**Files:** Modify `client/.../pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:66-77`, `.../PromptBlock/PromptBlock.tsx`, `.../TraceBody/helpers.ts`; Test `.../TraceBody.test.tsx`.

**Interfaces:** Consumes: `prompt_assembly.skills: string | null` (`contracts/trace.ts:41`); `estimateTokens` (є в `PreviewTab/helpers.ts` = `chars/4`; якщо в межах feature-folders імпорт недоречний — перенести в `client/src/lib/tokens.ts` і імпортувати з обох місць, лише коли з'являється другий споживач — він з'являється тут).

- [ ] **Step 1: Failing тест:** трасу зі `skills: 'x'.repeat(400)` рендерить блок «Skills» із числом `~100 tokens` поруч із заголовком; трасу зі `skills: null` — блоку немає (п. 20).
- [ ] **Step 2:** `PromptBlock` приймає необов'язковий `tokens?: number` і показує `~{tokens} tokens` у шапці блоку; `TraceBody` передає `estimateTokens(skills)` ЛИШЕ для блоку скілів (не для всього промпта; `TB:66` не чіпати).
- [ ] **Step 3:** Сервер не змінюємо (критерій дозволяє `довжина/4`). `pnpm typecheck && pnpm test`. Commit `feat(trace): show token count of the skills prompt block`.

---

### Task 15: Аудит усіх 53 критеріїв у живому застосунку

**Files:** Create `docs/reports/hw2-criteria-audit.md`.

- [ ] **Step 1:** Пройти пп. 3–53 (1–2 виключені користувачем) у запущеному застосунку (`pnpm dev`) і заповнити таблицю «№ · PASS/FAIL · де перевірено · доказ»; по FAIL — виправити й повторити. Особливо: п. 5 (у frontmatter `pr-self-review` вказано тип Workflow), п. 21 (запуск `/pr-self-review` вручну на diff з `client/` і `server/` підтягує обидва набори скілів — скористатись власним diff цієї гілки), п. 8 (створити скіл через API → знайти рядок у БД `psql`; видалити в БД → `GET /skills` не повертає), п. 14 (переставити скіли drag&drop → запустити ревʼю → у трасі блоки скілів у новому порядку), п. 10 (бічна панель), п. 15 (імпорт `.md` і `.zip` із прев'ю), п. 38/48 (перезавантажити сторінку — кандидати збереглись, відхилені не повернулись), п. 53 (Settings → Models → рядок Conventions, пошук моделі; вибір `nvidia/nemotron-3-ultra-550b-a55b:free` змінює модель наступного скану — підтвердити в логах сервера).
- [ ] **Step 2:** Commit `docs: hw2 criteria audit`.

---

### Task 11: Демо-відео, self-review, PR

- [ ] **Step 1: Відео** (skill `browser-demo-screencast`) має показати **і фічу попереднього коміту (лабораторна), і нову**: (а) Skills Lab у сайдбарі; сторінка Skills — картки (версія, agent_count, тоггл), бічна панель, «додати» → створити/імпортувати (.zip із прев'ю), видалення з модалкою, вкладки Config/Preview/Versioning з Diff і Restore; (б) Agents — плитки, редактор агента, вкладка Skills: пошук, drag&drop порядку; (в) контрольний експеримент Test Quality на PR #483 без скіла / зі скілом; (г) трасa прогону: блок скілів із токенами, вимкнений скіл — блоку немає, порядок змінився; (д) **Conventions**: Run Scan на quick-blog → картки → клік по доказу на GitHub → Accept/Reject/Edit → Create skill → attach до агента → Settings → Models → Conventions; (е) API Contract Reviewer: прогін A (без скілів) vs B (зі скілами) на #484. Файл покласти поза git (посилання у PR), розмір не комітити.
- [ ] **Step 2:** `/pr-self-review`; виправити BLOCK-знахідки; `server`: `pnpm typecheck && pnpm test && pnpm arch && pnpm build`; `client`: `pnpm typecheck && pnpm test` (зупинити `next dev` перед `pnpm build`); `diff -r` обох `vendor/shared` для змінених файлів; e2e-потік за бажанням (`e2e/specs/`, потрібен prose-spec у `e2e/specs-docs/`).
- [ ] **Step 3: `/engineering-insights`** — записати неочевидне (наприклад, поведінку free-моделі зі structured output, перерахунок рядків доказів).
- [ ] **Step 4: PR** у `otkachuk777/dev-digest` ← `main`: опис (що зроблено по обох частинах, скріншоти, посилання на відео, короткий звіт якості знахідок Extractor'а з `docs/reports/`, результат експерименту, що НЕ робили — URL-імпорт/plugin/repo-intel), підпис `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Після створення — `mcp__ccd_pr__get_status` для CI, не поллити `gh`.

---

## Порядок виконання

T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T12 → T13 → T14 → T8 → T9 → T10 → T15 → T11 (T12–T14 незалежні від Conventions і можуть іти паралельно окремим субагентам після T1).

## Перевірка (end-to-end)

0. `docs/reports/hw2-criteria-audit.md`: усі обов'язкові пункти (3–53) PASS.
1. `pnpm db:migrate` чисто на свіжій БД; журнал міграцій лише дописано.
2. `server`: `pnpm typecheck && pnpm test && pnpm arch`; `client`: `pnpm typecheck && pnpm test`.
3. У браузері: сайдбар має SKILLS LAB (Skills, Agents, Conventions) і WORKSPACE (Pull Requests); `/repos/<quick-blog>/conventions` → Run extraction → картки з клікабельними доказами, що відкривають реальний код на GitHub; Reject прибирає; редагування правила зберігається; Create skill з прийнятих створює `repo-conventions` (відхилені відсутні в тілі).
4. Trace ревʼю з прив'язаним `repo-conventions` показує скіл у промпті.
5. Експеримент #484: прогін A vs B задокументований у `docs/reports/api-contract-experiment.md`.

## Self-review плану

- **Покриття критеріїв hw2 (пп. 3–53):** див. таблицю на початку; нові задачі T12–T15 закривають розбіжності попередньої лабораторної; пп. 38–52 — T2–T7; п. 53 — T15 (реєстр і UI вже є, перевіряємо динамічний вибір моделі).
- **Покриття ДЗ:** таблиця + `POST /repos/:id/conventions/extract` (T2,T5) · вибірка кодом (T4,T5) · дешева модель, кандидати `{категорія, правило, evidence, впевненість}` (T4) · кодова перевірка доказів (T3,T4) · UI approve/reject/edit (T6) · один скіл + лінк до агента (T7,T10.7) · клік до GitHub (T5 `evidence_url`, T6) · 4 скіли з good/bad, імпорт одного, прив'язка (T8,T10) · експеримент без/зі скілами (T10) · відео + PR + звіт (T9,T11) · правка сайдбару (T1).
- **Типи:** `ConventionCandidate/ConventionScan/UpdateConventionInput` визначені в T2 і однаково вживаються в T5–T7; `verifyEvidence` (T3) → `extractConventions` (T4) → сервіс (T5); `conventionsToDraft` (T7).
- **Відкриті ризики:** п. 10 (бічна панель) і п. 37 (семантика тоггла) допускають різне трактування — рішення в T12/T13 зафіксовані, за потреби користувач уточнить; п. 16 залежить від стану БД після UI-імпорту (не в seed); free-модель `nemotron` може не підтримувати `json_schema strict` (є repair-цикл; запасний override у Settings); `getConventionSamples` повертає `[]` без індексації (T0.4, 422 з підказкою); `evidence_url` потребує запушеного SHA (T9.2); кнопки «New agent» у UI могло не бути (T10.1 запасний шлях).
