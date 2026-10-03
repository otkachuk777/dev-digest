# Plan: SDD workflow — test-first, дешевший implementer, закриття дір

## Context
Аудит SDD-workflow (spec-creator → implementation-planner → implementer → reviewers → plan-verifier) показав:
- implementer дорогий не через тести (3–12% виводу), а через **ходи × контекст**: 192–426 ходів, контекст до 315k, 25–81M вхідних токенів на прогін (транскрипти 2026-09/10). Драйвери: один implementer на весь план, читання `sed -n`/`grep` шматками, десятки дрібних Edit, повторні читання plan/INSIGHTS, повні SKILL.md.
- діри: `mutation-probe.sh:12` відмовляє на незакоміченому коді → backfill після implementer завжди REFUSED; багів (correctness) не шукає ніхто; `[verify: e2e]` AC без виконавця; planner планує з `draft` SPEC.
- security-reviewer: виключення «no-auth → moot» хибне при `server/src/server.ts:43` `host: '0.0.0.0'`; не бачить SPEC `Untrusted inputs`; `pr-self-review` дублює security.
- brainstorm: planner не може його запросити, результат не зберігається.

Рішення користувача (апрув у чаті): 2.1–2.5, 3.1(A test-first), 3.2 (агент `feature-dev:code-reviewer`), 3.3(A test-writer пише e2e flows), 3.4, п.4–6 як рекомендовано, Test seams + Skeleton.

Новий порядок (main session):
```
spec-creator ⇄ user/researcher → SPEC approved
→ implementation-planner (+ brainstorm requests) → plan approved → docs/cc-plans/
→ implementer: Step 0 Skeleton → test-writer test-first (red) → WIP-коміт red tests
→ implementer по шматках (свіжий агент на 2–3 кроки / групу) → green → WIP-коміт
→ plan-verifier #1 → Not met → той самий implementer (SendMessage)
→ architecture-reviewer ∥ security-reviewer ∥ feature-dev:code-reviewer
→ фікси (SendMessage) → [test-writer backfill + e2e flows, після коміту]
→ plan-verifier #2 → SPEC implemented → doc-writer → pr-self-review → коміт
```

## Steps

### 1. `implementation-planner.md`
- **Step 0**: SPEC `Status: draft` для фічі/зміни поведінки → **не планувати**, питання «approve SPEC?» (прибрати «`draft` is plannable» у Step 1a / шаблоні). Технічна задача без SPEC — як було.
- **Step 0**: нова секція виводу `## Brainstorm requests` — B1. <одне технічне рішення> — constraints — consumer: plan — blocking: yes/no. Main запускає `brainstorm` (паралельно, по одному на запит) і повертає звіти через SendMessage; без них плану немає, якщо blocking.
- **Step 4 Execution mode**: parallel лише якщо після Group 0 ≥2 групи по ≥3 файли; інакше single. **Chunks у single**: кроки згруповано в шматки по 2–3 (поле `Chunk` у таблиці), main дає кожен шматок свіжому implementer'у.
- **Шаблон плану**, нові секції:
  - `## Decisions` — рішення, обраний варіант, звіт B<n> (коротко), чому; джерело для ADR doc-writer'а.
  - `## Test seams` — публічна поверхня для тестів: роут + контракт (із SPEC), компонент (шлях, props, i18n namespace/ключі, role/тексти), сигнатури експортованих функцій. Без внутрішніх деталей.
  - **Step 0 — Skeleton** (обов'язковий при test-first): заглушки — роут зареєстровано → 501, компонент → `null`, функції → `throw new Error('NotImplemented')`; контракти (обидві копії vendor/shared), `messages/en/*.json`, міграції. Done when: typecheck зелений.
  - Test plan: власник кожного тесту (`test-writer test-first` для AC `[verify: unit|it]`; `test-writer e2e` для `[verify: e2e]` — після імплементації; implementer — лише Skeleton-рівень, без поведінкових тестів).
  - Кожен Step → `Skills`: правило + **точна секція** (`<skill>/SKILL.md` §Heading або sub-file), яку implementer читає (п.2.4).
- Final check: + Test seams, Skeleton, Chunks/Groups, Decisions (якщо був brainstorm).

### 2. `implementer.md`
- **Hard rules**: «Тести test-writer'а (перелічені в плані/red-коміті) не редагуєш. Тест суперечить плану/коду → зупини крок, Deviations» (3.1). «Твій шматок/група — тільки ці кроки» (узагальнити рядок про group на chunk).
- **Ефективність (2.2)**, новий короткий розділ: незалежні Read/Grep/Glob — паралельно в одному повідомленні; файл читати цілком один раз (`Read`), не `sed -n`/`cat` шматками; всі зміни файлу — одним Edit/Write де можливо; не перечитувати plan/INSIGHTS.
- **Skills (2.4)**: замість `Skill` на весь скіл — `Read` секцій, які план цитує для кроку; `Skill`/повний SKILL.md лише для файлу, якого план не покриває, або коли секції не вистачає. Прибрати «never rely on the plan's paraphrase alone» → «читай процитоване джерело, не переказ».
- **Insights (п.6/overhead)**: замінити «Read engineering-insights SKILL.md section A» одним рядком правила (read root + module INSIGHTS once, name 1–3). Те саме в усіх агентах (крок 9).
- **Тести (2.3)**, Step 3/4: на кроці — тільки `pnpm exec vitest run <файли кроку> --reporter=dot` або `vitest related --run <змінені src>`; server: без `*.it.test.ts` у циклі кроку. Повний `test` + `typecheck` + `arch` (таблиця модулів) — **один раз** у кінці шматка/групи.
- Prompt-формат handoff: + `Red tests made green: <list>`.

### 3. `test-writer.md` + `scripts/path-guard.sh` (+ `.test.sh`)
- Mode `test-first`: вхід — план (Test seams + Skeleton вже в коді). Red дозволено лише як assertion / HTTP 501 / `NotImplemented`; `Cannot find module` або typecheck-помилка → блок, звіт «Skeleton incomplete». Назви `AC-N: …`. Fail-proof = red run.
- Mode `backfill`: передумова — WIP-коміт (main робить перед запуском); `REFUSED` → «попроси main закомітити», не «not proven» мовчки.
- Новий mode `e2e`: `e2e/flows/NN-kebab.flow.json` для AC `[verify: e2e]`, після імплементації; формат — сусідні flows + `e2e/docs/README.md`; Verify: `cd e2e && npm run e2e:hermetic` (npm, не pnpm). Fail-proof: red run на гілці до фічі неможливий → «green run + selector targets AC text», явно в звіті.
- Description: + e2e flows.
- `path-guard.sh tests`: дозволити `e2e/flows/[0-9][0-9]-*.flow.json`; тести в `path-guard.test.sh`: allow `e2e/flows/08-x.flow.json`, deny `e2e/run.ts`, `e2e/flows/x.json`.

### 4. `plan-verifier.md`
- **Незмінність red-тестів**: якщо план/caller дає red-коміт → `git diff <red-commit> -- <test files>`; непогоджена зміна = Not met (з посиланням на Deviations implementer'а).
- **Контракти SPEC ↔ Zod (п.5)**: кожна таблиця Contracts у SPEC → рядки Traceability на поле (ім'я snake_case, тип, required) з inspection відповідної Zod-схеми в `vendor/shared/contracts`.
- **Дедуп команд**: файлові Verify кроків покриваються повним test-прогоном модуля — запускати модульний один раз і мапити результат на кроки.
- Режим `pass: 1 (gate) | 2 (final)` у вході; на #2 — тільки якщо caller дає delta, перевіряти пункти, які зачепила delta, + повний test/arch.

### 5. `security-reviewer.md`
- Exclusions: замінити «only matter with authentication — moot» на: moot лише розмежування між користувачами (IDOR user↔user — юзерів немає); **дія/дані, доступні без авторизації по мережі — в scope** (API слухає `0.0.0.0`, `server/src/server.ts:43`; CORS не захищає від не-браузерних клієнтів).
- Step 0: опційний вхід SPEC → кожен рядок `Untrusted inputs` = обов'язкове джерело для source→sink трасування; у звіті рядок на кожен (finding / handled at `file:line` / not in diff).

### 6. `pr-self-review` SKILL.md (Step 4)
Reuse за fingerprint: + `security-reviewer` для скіла `security` (як уже для architecture-reviewer → onion/frontend-ui).

### 7. `brainstorm.md`
- Consumer/вхід: запит `B<n>` від implementation-planner; Decision у виводі несе id `B<n>`, щоб main вставив у план `## Decisions`.
- Назву лишаємо (рішення користувача); description: + «Invoked on `B<n>` brainstorm requests from implementation-planner. NOT the interactive `superpowers:brainstorming` skill (product dialogue with the user).»

### 8. `.claude/agents/README.md` + root `CLAUDE.md`
- README: новий розділ **Runbook (main session)** — порядок вище, хто коли запускається, WIP-коміти (explicit paths, root INSIGHTS), chunks → свіжий implementer, фікси → SendMessage тому самому implementer'у (якщо його контекст не роздутий, інакше свіжий з findings), plan-verifier #1/#2, `feature-dev:code-reviewer` паралельно з рев'юерами (correctness bugs; architecture-reviewer багів не шукає), brainstorm requests від planner'а.
- README: оновити Workflow-діаграму, Catalog/Permissions/Inputs-outputs рядки (test-writer e2e, planner Test seams/Skeleton/Decisions/Brainstorm requests, plan-verifier контракти/red-diff, security SPEC input), посилання на цей design record.
- root `CLAUDE.md` «Read when»: + `running the SDD workflow (spec → plan → implement → review) → .claude/agents/README.md` (Runbook).

### 9. Insights overhead — усі агенти, що читають `engineering-insights` §A
`architecture-reviewer`, `security-reviewer`, `plan-verifier`, `brainstorm`, `test-writer`, `doc-writer`, `implementer`, `implementation-planner`: «Read `.claude/skills/engineering-insights/SKILL.md` section A…» → один рядок: «Read root `INSIGHTS.md` + touched modules' `INSIGHTS.md` once; name the 1–3 entries that bear on this task; never write them.» (planner зберігає «resolve modules from the task, not detect-module.sh»).

### 10. `specs/README.md`, `ears-spec/SKILL.md`
Lifecycle: planner не планує з `draft` (одне речення). `ears-spec` Consumers: test-writer пише `AC-N` тести test-first; `[verify: e2e]` → test-writer e2e mode.

### 11. API слухає тільки localhost (server)
- `server/src/platform/config.ts`: `EnvSchema` + `API_HOST: z.string().default('localhost')`; `AppConfig.apiHost`; `loadConfig` → `apiHost: parsed.API_HOST`.
- `server/src/server.ts:43`: `host: '0.0.0.0'` → `host: config.apiHost`; лог-рядок — з `config.apiHost`. `'localhost'` (не `127.0.0.1`): Fastify 5 на `localhost` слухає і IPv4, і IPv6 (`::1`), тож `http://localhost:3001` з Node fetch / браузера / curl працює незалежно від порядку резолву.
- `server/.env.example`: `# API_HOST=localhost — set 0.0.0.0 only to expose the no-auth API on the LAN`.
- Тест: один unit-тест `loadConfig({})` → `apiHost === 'localhost'`, `loadConfig({API_HOST:'0.0.0.0'})` → `'0.0.0.0'` (новий `server/test/config.test.ts`, за зразком сусідніх unit-тестів).
- Споживачі вже ходять на `localhost` (`.github/workflows/e2e-web.yml:35`, `scripts/e2e.sh`, `scripts/dev.sh`, `client/src/lib/api/client.ts`) — змін не треба.
- security-reviewer (крок 5): рядок про `0.0.0.0` → «API binds `config.apiHost` (default localhost); `API_HOST=0.0.0.0` exposes the no-auth API — unauthenticated network-reachable actions stay in scope».
- Verify: `cd server && pnpm typecheck && pnpm test -- config`; `pnpm dev` → `lsof -iTCP:3001 -sTCP:LISTEN` показує `localhost`/`127.0.0.1`/`[::1]`, не `*`; `curl -fsS http://localhost:3001/health`; `cd e2e && npm run e2e:hermetic` зелений.

## Out of scope
- Флакі server-тест — фікситься в іншій сесії (task_4f2fde4b).

## Verification
- Передумова: після merge `origin/main` (fast-forward до `b44a3d8`: testcontainers 10→11) — `cd server && pnpm install` перед тестами.
- `bash .claude/agents/scripts/path-guard.test.sh` (нові e2e кейси), `readonly-bash-guard.test.sh`, `.claude/skills/pr-self-review/scripts/gate.test.sh`, `.claude/skills/ears-spec/scripts/spec-lint.test.sh` — зелені.
- `grep -rn "engineering-insights/SKILL.md\` section" .claude/agents` → порожньо; `grep -n "plannable" .claude/agents` → порожньо.
- Узгодженість: кожен агент, згаданий у Runbook, існує; frontmatter валідний (`head -8` кожного змінного агента).
- Smoke (нова сесія, бо агенти перезавантажуються лише так): planner на `draft` SPEC → питання без файлу; на approved → план із Test seams, Step 0 Skeleton, Chunks, Decisions/Brainstorm requests.
- Після апруву: `mv` плану в `docs/cc-plans/2026-10-01+sdd-workflow-test-first.md`, коміт разом зі змінами явними шляхами.

## Risks
- Test-first на погано визначених seams → тести вгадують реалізацію; мітигація — Test seams лише з SPEC-контрактів/props/role.
- Chunks збільшують кількість запусків (кожен перечитує план ~4–10k токенів) — все одно на порядок дешевше за 300k-контекст × сотні ходів.
- `vitest related` може пропустити тести з динамічними імпортами — повний прогін у кінці шматка це ловить.
