# Експеримент 2 — onion-architecture (evals)

## Context
Лаба: зламати правило в SKILL.md → побачити, що падає саме пов'язана expectation → повернути → перевірити відновлення на серії → власний кейс (3–5 expectations + негативний prompt).
Обрано `onion-architecture` (12.8KB). **Готового skill-eval для нього в repo немає** — є лише `evals/agents/architecture-reviewer` (агент, sonnet, maxTurns 25 = дорого) і `evals/skills/dependency-checker`. Тому пишемо дешевий кейс сами за зразком `dependency-checker.cases.ts`.

## Дешево за токенами
- `skillTask`: SKILL.md як system prompt, без tools, haiku-4-5 (task) — діф/сценарій інлайнимо в prompt (як REPO_DATA).
- `maxTurns: 3`, 1 скіл-файл, repeat N=3 (не 10).
- `patternMatch` grounding-гейт першим → judge не платимо, якщо відповідь порожня.

## Кроки
1. **Кейс** `evals/skills/onion-architecture/onion-architecture.{eval,cases}.ts` (копія структури dependency-checker). Prompt: короткий діф з 2 порушеннями:
   - `new OpenAI(...)` / `new Octokit(...)` у модулі (правило "concrete adapters лише в composition root / `container.llm()`" — це і є DI-container правило, рядок у Red flags + Step 2 "New external system").
   - `new AgentsRepository(tx)` в чужому модулі, або `../reviews/repository.js` імпорт.
   Expectations (4): (a) DI: бере через `container.github()/llm()`, а не `new` — evidence цитата; (b) cross-module через `container.<x>`/`index.ts`, не `../<other>/repository.js`; (c) route тонкий: бізнес-`if` → service; (d) вказує на `pnpm arch`. Негативний кейс: діф без порушень (локальний rename) → не вигадувати порушень, verdict чистий.
   Відсікти: критерії, які haiku проходить без скіла ("domain не імпортує fastify" — загальновідомо) — перевірити через `pnpm eval:benchmark` (with vs without).
2. **Baseline**: `cd evals && pnpm eval:repeat` (N=3, label `baseline`) → `results/records.jsonl`.
3. **Ламаємо**: у `.claude/skills/onion-architecture/SKILL.md` видалити рядок Red flags про `new Octokit/OpenAI` + фразу "It is the only place that `new`s concrete adapters" (дві згадки DI). Тільки локально, без коміту.
4. **Repeat** (label `broken`) + `pnpm eval:delta baseline broken` → очікуємо: впала тільки DI-expectation (a), решта стабільні.
5. **Відновлення**: `git checkout .claude/skills/onion-architecture/SKILL.md`, repeat (label `restored`), delta vs baseline → повернулось на серії N=3.
6. Негативний prompt + фінальне прибирання слабких expectations; `pnpm eval:quality` як статичний гейт.
7. Коміт: кейс + цей план (архів у `docs/cc-plans/2026-10-07+onion-architecture-evals-experiment.md` через `mv`).

## Файли
- нові: `evals/skills/onion-architecture/*` (2 файли)
- тимчасово змінюється (і відкочується): `.claude/skills/onion-architecture/SKILL.md`
- читаємо: `evals/skills/dependency-checker/dependency-checker.cases.ts` (шаблон), `evals/src/{repeat,delta}.ts`

## Перевірка
`pnpm eval:skills` зелений на оригіналі; delta показує падіння лише (a) на broken; delta restored≈baseline.
