# Plan: planner → implementation-planner

## Context
У гілці вже є `spec-creator` (commit `e49b793`): пише `<module>/specs/SPEC-NN-<slug>.md` / `specs/SPEC-NN-<slug>.md` з `US-N`, `AC-N` (EARS), `EC-N`, `NFR-N`, `OQ-N` (blocking yes/no), `Status: draft|approved|implemented`. `planner` зараз сам формулює вимоги в Context і приймає продуктові рішення в Step 0 — це тепер зона spec-creator.

Мета: перейменувати `planner` → `implementation-planner`, який **тільки** будує implementation plan із SPEC, не пише і не вигадує вимог; рев'юїть SPEC відносно коду, уточнює незрозуміле, дає рекомендації «як зробити краще»; питає (через main session — subagent не має `AskUserQuestion`) про режим: single-agent чи parallel implementers.

Рішення користувача:
- Вимоги — тільки вхід; джерело — SPEC від spec-creator.
- Нова фіча / зміна поведінки без SPEC → Step 0 питання «спершу запустити spec-creator?», плану немає. Виняток: чисто технічна задача без зміни поведінки (рефактор, tooling) — план з вимог caller-а.
- `Status: draft` — можна планувати, з позначкою в Requirements review. Blocking `OQ-N` у SPEC → Step 0 питання, план не пишеться.
- Режим питається в Step 0, якщо caller не передав; multi-agent = паралельні `implementer` на групах кроків (worktree isolation).
- Рекомендації → секція плану «Requirements review».

Заборона писати specs уже забезпечена хуком `path-guard.sh plans` (лише `~/.claude/plans/*.md`) — хуки не міняються, правило дублюється в промпті.

## Steps

### 1. Rename
`git mv .claude/agents/planner.md .claude/agents/implementation-planner.md`; frontmatter `name: implementation-planner`; description: «Read-only implementation planner. Use after spec-creator (SPEC-NN exists) or for a purely technical change without behavior change — reviews the spec against the code, asks what is unclear and which execution mode (single / parallel implementers) to plan for, then produces a Development Plan with modules, files, INSIGHTS.md entries, constraints and project skills… Does not write or change specs, does not edit code.» Tools/hooks без змін.

### 2. Тіло промпта `implementation-planner.md`
- Intro: «You are **implementation-planner**: you turn a spec (`SPEC-NN`) into a Development Plan…». Hard rules, новий пункт **No specification work**: не пише/не редагує `specs/**`, `*/specs/**`; не вигадує US/AC/поведінку, не приймає продуктових рішень. Прогалина в SPEC → питання або рекомендація «передати spec-creator», ніколи тихе доповнення.
- **Step 0 → «Inputs & questions»**. Знайти SPEC (від caller або `rg -l "^# Spec:" --glob "**/specs/SPEC-*.md"` — перенести поточний рядок з Step 1). Повертати питання без файлу, якщо:
  1. нова фіча / зміна поведінки без SPEC → «Run spec-creator first?» (з proposed interpretation);
  2. SPEC має `OQ-N … blocking: yes`, або AC суперечать коду/одне одному настільки, що план неоднозначний;
  3. caller не передав execution mode (`single` | `parallel`).
  Формат: `## Clarifying questions` (3–5, «why it matters») · `## Execution mode` (питання + рекомендація з причиною: к-сть незалежних груп, спільні seams) · `## Proposed interpretation`. Щоб обґрунтувати рекомендацію режиму, дозволено спершу пройти Step 1 read-only.
  Прибрати формулювання «leaves a product decision open → do not plan» як власне рішення планера — тепер це «open product decision → question for spec-creator/user».
- **Step 1a — Requirements review** (новий): звірити кожен AC/EC/NFR з кодом, contracts, `INSIGHTS.md`, skills; зафіксувати: Status draft, gaps, conflicts, ризики, рекомендації (reuse, менший diff, простіший варіант). Блокуюче → Step 0; неблокуюче → секція плану; зміни до SPEC — як рекомендація для spec-creator.
- **Step 4 — Execution mode** (новий): `single` — як зараз. `parallel` — групи кроків з **disjoint file ownership**; спільні seams (обидві копії `vendor/shared`, `contracts/*.ts`, `messages/en/*.json`, migrations, `package.json`/lock) — в «Group 0», що виконується першою; вказати залежності й порядок merge; Verify у worktree потребує install залежностей (крок плану); main session комітить явними шляхами (root `INSIGHTS.md`: no `git add -A` while subagent runs). < 2 незалежних груп → сказати, що parallel нічого не дає, і планувати single.
- **Output template**:
  - `## Requirements` — шлях до SPEC + Status (або «technical task, from caller»); IDs посиланням, текст AC не переписувати.
  - `## Requirements review` — Status · Gaps · Conflicts · Recommendations.
  - `## Execution mode` — mode + (parallel) таблиця `Group | Steps | Owned files | Depends on | Merge order`.
  - кожен Step: `Covers: AC-1, EC-2, NFR-1`.
  - Context — лише task, why, user decisions; без нових вимог.
- **Final check**: + кожен AC/EC/NFR покритий кроком/Test plan або явно в Out of scope з причиною; + жодної поведінки поза SPEC; + execution mode заданий і узгоджений із групами. Final message: + рядок `Mode: single | parallel (N groups)`.

### 3. Посилання (живі файли; архів `docs/cc-plans/*`, `server/clones/**`, фікстура `Markdown.test.tsx` — не чіпати)
- `.claude/agents/README.md` — каталог, workflow (`spec-creator → implementation-planner`, гілка `parallel → implementer ×N (worktree)`), рядок 53 «planner and plan-verifier trace to its AC-N», Permissions, hooks-таблиця, Inputs/Outputs (+ Requirements · Requirements review · Execution mode), note про TypeScript skill, «planner / implementer split», посилання на design record.
- `.claude/agents/spec-creator.md` — description «Use before planner» та згадки planner у тілі (рядки intro, «What, not how … planner's job») → `implementation-planner`.
- `.claude/agents/implementer.md:3` — «from the implementation-planner agent»; + у Hard rules: «Caller assigned a step group (parallel mode) → execute only that group's steps and owned files».
- `.claude/agents/brainstorm.md:32,74,82,117` — `planner` → `implementation-planner`.
- `.claude/agents/scripts/readonly-bash-guard.sh:2`, `path-guard.sh:6` — лише коментарі.
- Перевірити `CLAUDE.md`, `specs/README.md`, `TESTING.md` на згадки `planner` і оновити, якщо є.

## Verification
- `grep -rnw planner .claude CLAUDE.md TESTING.md specs --exclude-dir=cc-plans` → порожньо (крім postgres «query planner» у skill).
- `bash .claude/agents/scripts/path-guard.test.sh && bash .claude/agents/scripts/readonly-bash-guard.test.sh` — зелені.
- Smoke (нова сесія): `implementation-planner` без SPEC для фічі → питання про spec-creator + execution mode, без файлу; з існуючим SPEC і `mode: parallel` → план з Requirements / Requirements review / Execution mode, `Covers:` у кроках, групи з disjoint файлами.
- Після approval — `mv` цього плану в `docs/cc-plans/2026-10-01+implementation-planner-agent.md`, закомітити разом зі змінами (явні шляхи).

## Risks
- Нове ім'я агента з'явиться лише в новій сесії.
- Parallel у worktree без `node_modules` — Verify впаде без install-кроку; план агента має це вказувати.
