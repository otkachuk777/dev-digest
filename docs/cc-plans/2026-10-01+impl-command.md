# Plan: `/sdd` → `/impl` — тільки реалізація, дешевші моделі, тести inline

## Context
Щойно зроблений (не закомічений) skill `/sdd` вів увесь цикл від специфікації до PR. Користувач вирішив: spec-creator і implementation-planner запускаються **вручну окремо**; команда стартує з **затвердженого плану** і робить реалізацію → рев'ю-цикл → PR. Для економії токенів: **test-writer відкласти** (тести пише implementer inline, test-first лишається перемикачем), **architecture-reviewer → sonnet**, security — opus лише в раунді 1, re-review на sonnet; `feature-dev:code-reviewer` і plan-verifier — sonnet; doc-writer — опційно `--docs`.

Рішення (AskUserQuestion): назва `/impl`; тести — implementer inline + перемикач `Tests: inline | test-first`; моделі як вище; doc-writer опційно. Залишаються з попереднього рішення: worktree від origin/main, squash + PR у свій fork, G3, ≤3 review-раунди, minor = fix-along/defer.

## Flow
```
(вручну) spec-creator → SPEC approved → implementation-planner → plan approved
/impl <SPEC-NN | plan path> [--docs]
0 Setup   worktree feat/spec-NN-<slug> від origin/main; перенести SPEC + план (з ~/.claude/plans або
          з поточного checkout) у worktree, план → docs/cc-plans/; commit `SDD(SPEC-NN): plan`
1 Build   chunk 1…N, свіжий implementer на кожен (тести AC inline: test → red → code → green);
          test-first план → спершу Skeleton + test-writer red (лише якщо план так каже)   → `chunk-<k>`
2 Gate    plan-verifier pass 1 → Not met → implementer (≤2) → `gate`
3 Review  ≤3 раунди: r1 arch(sonnet) ∥ security(opus) ∥ code-reviewer(sonnet);
          r≥2 re-review delta, усі sonnet → triage → fix → `review-<n>`
4 Final   plan-verifier pass 2 (delta від gate) → ⛔ G3 → SPEC implemented → [--docs: doc-writer]
          → squash → /pr-self-review → PR
```
Без затвердженого SPEC або плану `/impl` зупиняється з підказкою, який агент запустити вручну.

## Steps

### 1. Skill: `.claude/skills/sdd/` → `.claude/skills/impl/` (файли ще не в git — `mv`)
- `SKILL.md`: `name: impl`, description «Implements an approved SDD plan end to end — build in chunks, verification gate, review-and-fix rounds, PR… Use only when the user invokes /impl…», `argument-hint: <SPEC-NN | plan path> [--docs]`, `disable-model-invocation: true`. Прибрати фази Spec/Plan і G1/G2; додати Setup-перенесення SPEC+плану; Build без test-writer за замовчуванням (test-first гілка — якщо план `Tests: test-first`); Late-tests фазу прибрати; Final: doc-writer лише з `--docs` (на G3 спитати, якщо не передано); моделі через `model` override в Agent-виклику (таблиця в skill).
- `references/review-loop.md`: колонка Model у таблиці раундів (r1: arch sonnet, security opus, code-reviewer sonnet; r≥2 усі sonnet).
- `scripts/sdd-status.sh` → `impl-status.sh` (+ `.test.sh`): вхід `SPEC-NN` або шлях до плану (id з `- Source:`); фази `blocked-spec` (немає/не approved) · `blocked-plan` (немає плану в docs/cc-plans і не передано шлях) · `build` · `review` · `final` · `done`; прибрати `late-tests`/`spec`/`plan` маркери з логіки (маркер `plan` = старт build). Тести оновити відповідно.

### 2. `implementation-planner.md`
- Новий рядок плану `## Test mode`: `inline` (default — implementer пише тести AC у своєму chunk) | `test-first` (лише коли caller просить: Test seams + Step 0 Skeleton + test-writer). Step 5 → умовний на `test-first`; у `inline` — Test plan з owner `implementer`, кожен тест у кроці, що реалізує його AC; `[verify: e2e]` → e2e flow у кроці, що робить UI.
- Final check: Test seams/Skeleton лише для test-first.

### 3. `implementer.md`
- Inline-тести: тести, які Test plan дає implementer'у, — **спершу тест**, запуск (червоний на відсутній поведінці), потім код, зелений; ім'я `AC-N: …`; шар за `[verify:]`; e2e flow — `e2e/flows/NN-*.flow.json` за `e2e/CLAUDE.md`. Червоний прогін — доказ, у звіті `Fail-proof`.
- Правило «never edit test-writer's tests» лишається для test-first; «You write no behavior tests yourself» → «…only those the Test plan gives you».

### 4. Моделі / агенти
- `architecture-reviewer.md` frontmatter `model: sonnet`.
- security-reviewer лишається `opus` у frontmatter; `/impl` передає `model: sonnet` у re-review раундах.
- README catalog: architecture-reviewer sonnet; test-writer «optional — test-first mode only, not used by /impl by default».

### 5. Документація
- `.claude/agents/README.md`: Workflow-діаграма (spec і plan — вручну, далі `/impl`), Runbook-параграф → `/impl`, посилання на design record.
- root `CLAUDE.md` Read when: `implementing an approved plan (build → review → PR) → /impl`; spec/plan — агенти вручну.
- `skill-map.md` Deliberately unmapped: `sdd` → `impl`.
- `ears-spec/SKILL.md` Consumers + `specs/README.md`: тести пише implementer inline (або test-writer у test-first).
- `docs/cc-plans/2026-10-01+sdd-command.md` (не закомічений, витіснений) → видалити; цей план архівується як `2026-10-01+impl-command.md`.

## Verification
- `bash .claude/skills/impl/scripts/impl-status.test.sh` зелений; `impl-status.sh SPEC-99` → `phase=blocked-spec`.
- `gate.test.sh`, `path-guard.test.sh` зелені; YAML-парс frontmatter `impl/SKILL.md` + змінених агентів.
- `grep -rn "skills/sdd\|/sdd" .claude CLAUDE.md specs` → порожньо.
- Smoke у новій сесії: `/impl` у списку skill'ів; `/impl SPEC-99` зупиняється з «run spec-creator»; architecture-reviewer показує модель sonnet.
- Коміт: усе разом з планом, явні шляхи.

## Risks
- Inline-тести пише той самий агент, що й код → слабша незалежність; компенсує red-перед-green у chunk і plan-verifier/рев'юери. Повернення test-first — перемикач у плані, без переписування.
- Sonnet-архітектор може пропустити тонкі порушення шарів; детерміновані перевірки (`pnpm arch`, baseline) не залежать від моделі.
