# Eval для скіла `onion-architecture` (з vs без скіла)

## Context
Скіл `.claude/skills/onion-architecture` (11 KB, кільця Domain/Application/Infra/Presentation/Composition, правила cross-module, транзакцій, reviewer-core) ніколи не мав вимірюваної перевірки. Мета: через `skill-creator` зробити 3 базові eval-кейси «рев'ю фікстур» із ~3 прихованими порушеннями кожен, прогнати кожен у двох конфігураціях (with_skill / without_skill), порахувати pass-rate і показати у viewer. Структура має бути придатною для подальшого перенесення в CI.

## Де зберігати (рекомендація)
- **Eval-файли й фікстури — всередині скіла, коммітяться:**
  `.claude/skills/onion-architecture/evals/evals.json` (prompts + assertions = answer key)
  `.claude/skills/onion-architecture/evals/fixtures/<case>/…` (міні-серверні проєкти)
  Чому: це власне місце skill-creator (`evals/evals.json`), eval їде разом зі скілом, CI-джоб легко прив'язати `paths: .claude/skills/onion-architecture/**` (аналог існуючого `pr-self-review.yml`). Не в `server/test/` — там vitest-код, а це LLM-eval; не в `e2e/` — той для flow застосунку.
- **Workspace (виводи прогонів, grading, benchmark) — НЕ коммітиться:** `.claude/skills/onion-architecture-workspace/` + один рядок у `.gitignore` (поруч із `.claude/.pr-self-review/`). `.gitignore` уже має незакомічену правку — додам рядок поверх, не чіпаючи її.
- Fixtures лежать поза `server/src`, тож `pnpm arch`, `tsc` і dependency-cruiser їх не скануватимуть (перевірю `tsconfig`/eslint ignore перед комітом).

## Фікстури (без жодних коментарів про порушення)
Кожна — мінімальний ізольований проєкт на ~6–8 файлів з тими ж ролями файлів, що в `server` (`routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `platform/container.ts`, `vendor/shared/adapters.ts`). У коді **жодних коментарів**, назви нейтральні (без `bad`/`violation`/`TODO`); у каталогах немає README/CLAUDE.md, щоб не підказувати правила. Кожна має 1–2 **чисті «приманки»** (правильний код), щоб ловити хибні спрацювання.

| Кейс | Що перевіряє | 3 приховані порушення |
|---|---|---|
| `01-module-boundaries` | кільця + cross-module + порти | (a) `routes.ts` імпортує `drizzle-orm`/`db/schema` і робить запит; (b) `service.ts` модуля `pulls` імпортує `../reviews/repository.js` замість `container.reviewRepo`; (c) `new Octokit(...)` + `secrets.get('GITHUB_TOKEN')` у сервісі замість `container.github()` |
| `02-transactions-io` | правила транзакцій та idempotency | (a) виклик GitHub усередині `db.transaction`; (b) цикл публікації N коментарів в одній tx без `isNull(exportedAt)`-відбору; (c) `new AgentsRepository(tx)` в іншому модулі замість `container.agentsRepo.m(…, tx)` |
| `03-core-and-placement` | reviewer-core purity + розміщення логіки | (a) файл у `reviewer-core/src` імпортує SDK/`server/…`; (b) фільтр у JS після запиту + `row.workspaceId !== workspaceId` у сервісі замість SQL `where`; (c) рукописний wire-тип + повторний `parse` Zod у сервісі замість `z.infer` контракту |

Приманки (приклади): коректний `repository.ts` з drizzle; `import type { XRow }` у `helpers.ts`; `container.github()` в іншому сервісі; tx лише з DB-записів.

## Prompts (нейтральні, скіл не згадується)
Приклад: «Зроби рев'ю бекенд-коду в `<fixture>`: знайди проблеми проєктування/архітектури, для кожної вкажи файл:рядок, чому це проблема й як виправити. Нічого не змінюй.» Той самий prompt для обох конфігурацій; для with_skill додається лише «Skill path: …».

## Assertions (answer key, лише в `evals.json`, не у fixtures)
Для кожного кейсу: 3 assertions «знайдено порушення X у файлі Y» (імена описові), 1 «запропоноване виправлення відповідає правилу скіла» (напр. `container.reviewRepo`, метод у repository, виклик поза tx), 1 «немає хибних знахідок на файлах-приманках». Перевірка файлів — скриптом/grep де можливо, решта — grader-субагент (`agents/grader.md`), `grading.json` з полями `text/passed/evidence`.

## Виконання (за skill-creator)
1. Створити fixtures + `evals.json` + `eval_metadata.json` (описові імена eval-директорій).
2. Показати користувачу список кейсів на підтвердження (так вимагає skill-creator), потім стартувати.
3. В одному ході 6 субагентів: 3× with_skill, 3× without_skill (`without_skill/outputs/`). Фікстури копіюються в каталог прогону поза репо; baseline явно забороняється викликати Skill і читати `.claude/skills/onion-architecture` (обмеження: проєктні скіли видимі субагентам, тож це інструкція, а не жорстка ізоляція — зазначу у звіті).
4. По завершенні кожного — зберегти `timing.json` (tokens, duration).
5. Grade → `python -m scripts.aggregate_benchmark … --skill-name onion-architecture` → analyst pass (`agents/analyzer.md`: недискримінативні assertions, дисперсія) → `generate_review.py` viewer (вкладки Outputs / Benchmark).
6. Прочитати `feedback.json`, підсумок для користувача. Покращення SKILL.md й оптимізація description — лише якщо користувач попросить.

## Verification
- Перед прогоном: `grep -rniE 'violation|bad|wrong|todo|fixme|should|must' fixtures/` → порожньо; `grep -rn '//\|/\*' fixtures/` → порожньо (коментарів немає).
- Фікстури валідні як TS-синтаксис (`tsc --noEmit` у scratch або `node --check` через strip-types), щоб порушення були реальними, а не синтаксичними.
- Після прогону: `benchmark.json` містить обидві конфігурації для 3 eval; viewer відкривається; очікування — with_skill знаходить більше правило-специфічних порушень (cross-module, `container.*`, tx/IO), baseline — загальні (drizzle у routes) і пропускає project-specific.

## Критичні файли
- Прочитати: `.claude/skills/onion-architecture/{SKILL.md,tools.md}`, `server/.dependency-cruiser.cjs`.
- Створити: `.claude/skills/onion-architecture/evals/**`; змінити: `.gitignore` (+1 рядок).
- Утиліти skill-creator: `scripts/aggregate_benchmark`, `eval-viewer/generate_review.py`, `agents/grader.md`, `agents/analyzer.md`.
