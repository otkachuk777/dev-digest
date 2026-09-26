# L03-HW — Smart Diff

## Context

Вкладка **Files changed** показує файли в порядку GitHub (lock-файл поруч з бізнес-логікою), а знахідки агентів живуть лише на **Agent runs**. Smart Diff: (1) групує файли за роллю `core → tests → wiring → docs → boilerplate`, (2) показує знахідки прямо в diff — лічильник на групі, крапка на картці файла, картка знахідки під рядком. Групування детерміноване (glob-правила), **без виклику моделі**. Здача: PR `L03-HW` у `otkachuk777/dev-digest` + демо-відео.

Рішення користувача:
- показувати **лише непорожні** групи (тому тестовий PR має містити всі 5 ролей);
- знахідки **видимі** за замовчуванням, GitHub-коментарі — сховані; один перемикач «Hide/Show comments» ховає/показує обидва типи;
- у diff — знахідки **останнього рев'ю кожного агента** (як `findingsCountsByPr`);
- я роблю: код фічі, тестовий PR у форку, демо-відео, PR `L03-HW`.

INSIGHTS, що стосуються: client — «Severity-pill counts after hideLow», «UI `Severity` vs wire `Severity` (INFO)», «`user-event` не встановлено — `fireEvent`»; server — «Reuse existing severity tally / findingsCountsByPr (latest per agent)».

## Конвеєр виконання

Гілка `L03-HW` від `main`. Після approve: цей план → `docs/cc-plans/2026-09-24+smart-diff.md`.
1. **planner** — деталізує цей план у Development Plan (файли, скіли, arch-обмеження), дописує у той самий файл.
2. **implementer** — виконує, запускає typecheck/tests/`pnpm arch` у `server` і `client`.
3. **architecture-reviewer ∥ plan-verifier** — паралельно; фікси знахідок.
4. Жива перевірка в Browser pane, `pr-self-review`, коміт (разом з архівованим планом), PR.

## Server

**Контракт** — `SmartDiffRole = z.enum(['core','tests','wiring','docs','boilerplate'])` в обох копіях `vendor/shared/contracts/brief.ts` (лишити ідентичними, перевірити `diff`).

**Класифікатор** — `server/src/modules/reviews/smart-diff/`:
- `constants.ts` — `ROLE_ORDER` і впорядкований масив правил `{ role, patterns: RegExp[] }` (порядок = пріоритет; перше збігле правило виграє). Регекси замість glob-бібліотеки — без нової залежності.
- `classify.ts` — чиста `classifyFile(path): SmartDiffRole`, без імпортів HTTP/DB (на L08 стане фільтром перед промптом).
- `build.ts` — чиста `buildSmartDiff(files, findings): SmartDiff`: групи у порядку `ROLE_ORDER`, лише непорожні, файли в межах групи в порядку GitHub; `finding_lines` = унікальні `start_line` знахідок цього файла; `split_suggestion = { too_big:false, total_lines: Σ(additions+deletions), proposed_splits: [] }`; `pseudocode_summary` не заповнюємо (це LLM).

Правила (порядок): boilerplate (`*.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `dist/**`, `build/**`, `**/__snapshots__/**`, `*.snap`, `*.generated.*`, `*.min.js`) → tests (`*.test.ts(x)`, `*.it.test.ts`, `*.spec.ts`, `**/test/**`, `**/tests/**`, `**/__tests__/**`, `e2e/**`) → wiring (`index.ts/js`, `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`, `docker-compose*.yml`, `.github/**`, `.claude/**`) → docs (`*.md`, `docs/**`, `README*`, `CHANGELOG*`, `LICENSE`) → core.
Зафіксоване рішення: `e2e/README.md` → `tests` (лишаємо стартовий порядок: e2e-документація живе разом з тестами).

**Роут** `GET /pulls/:id/smart-diff` у `reviews/routes.ts` (workspace-scoped через `getContext`): файли PR з `t.prFiles` (не GitHub-запит), знахідки — останнє рев'ю кожного агента (перевикористати групування з `pulls/findings-counts.ts`, якщо витягується; інакше метод у `reviews/repository.ts`). Відповідь валідується `SmartDiffResponse` (response schema). Жодного виклику моделі.

**Тести** (`server/test/`):
- `smart-diff-classify.test.ts` — `it.each` таблиця «шлях → роль», включно з `__tests__/__snapshots__/x.snap → boilerplate`, `.claude/skills/security/SKILL.md → wiring`, `e2e/README.md → tests`, `pnpm-lock.yaml → boilerplate`, `client/src/index.ts → wiring`.
- `smart-diff-build.test.ts` — порядок груп, пропуск порожніх, `finding_lines`, `total_lines`, `SmartDiff.parse` проходить.

## Client

- `client/src/vendor/shared/contracts/brief.ts` — те саме розширення enum.
- `client/src/lib/api/reviews.ts` — `reviewKeys.smartDiff` + `useSmartDiff(prId)`.
- `client/messages/en/prReview.json` `smartDiff`: `testsLabel`, `docsLabel`, `smartOrder`, `originalOrder`, `noReviewYet`, `unanchoredFindings`, лейбли рядка `blocker/warning/suggestion`.
- **DiffTab** (`pulls/[number]/_components/DiffTab/DiffTab.tsx`):
  - `usePrReviews(prId)` → helper `latestFindingsPerAgent(reviews)` (у `_lib/findings.ts`, поруч з `allFindings`) → `Map<path, FindingRecord[]>`.
  - `useFindingAction()` → `onFindingAction(findingId, action)` з `prId` (інвалідує reviews).
  - Перемикач `Smart order | Original order` (дві `Button` з `active`, як у прототипі); стан локальний.
  - Видимість: `{ github: false, findings: true }`; кнопка показується, коли є коментарі або знахідки; клік: якщо щось видно → сховати все, інакше показати все.
  - Порожній стан «рев'ю ще не запускали» (нема reviews) — підпис замість лічильників.
  - Оновлення без reload: `usePrActiveRuns(prId)`; коли кількість активних прогонів падає до 0 → інвалідувати `reviewKeys.list`.
- **Нові компоненти** в `DiffTab/diff-viewer/`:
  - `SmartDiffGroup/` — заголовок групи (chevron, кольоровий квадрат ролі, лейбл з i18n, підпис ролі, `● N` = кількість файлів зі знахідками, `N files`), `position: sticky`, згорнутий за замовчуванням для `docs`/`boilerplate`; всередині — `FileCard`-и.
  - `DiffViewer` отримує `smartDiff?`, `order`, `findingsByPath`, `onFindingAction`; в smart-режимі мапить `group.files[].path` → `PrFile` з `files`; в original — як зараз.
- **FileCard** — пропс `findings?: FindingRecord[]` + `onFindingAction`; крапка severity-кольору біля шляху (окремо від лічильника коментарів `MessageSquare`); `partition` знахідок на ті, що мають `RIGHT:${start_line}` серед відрендерених ключів (`keysForLine`), і решту → блок «Findings outside the diff» наприкінці файла.
- **CodeLine** — пропс `findings`: смужка зліва (`borderLeft` кольору `SEV`) + підпис справа (`blocker|warning|suggestion`), під рядком — `FindingCard` з `../../FindingCard` (`defaultExpanded`, `onAction`) — клік по заголовку згортає в один рядок (P3). Кольори — `SEV`/`SEV_COLOR` з наявних констант, без нової палітри.
- **Тести** (Vitest + RTL, `fireEvent`): `latestFindingsPerAgent` helper; `SmartDiffGroup` (лічильник файлів зі знахідками, згорнутість docs/boilerplate); `FileCard` (крапка, картка під рядком, unanchored-блок).

## Тестовий PR у форку

Гілка `smart-diff-demo` у `otkachuk777/dev-digest`, PR → `main` (не мерджити). Вміст: нова залежність у `server/package.json` (+ `server/pnpm-lock.yaml`), невелика зміна в `server/src/modules/...` з навмисною вадою (щоб рев'ю дало знахідку в `core`), тест у `server/test/`, barrel/config-файл, `.md`-файл → усі 5 груп. Перевірити, що форк доданий у DevDigest як репозиторій; для рев'ю обрати сильнішу модель агента.

## Verification

- `cd server && pnpm typecheck && pnpm test && pnpm arch`; `cd client && pnpm typecheck && pnpm test && pnpm arch`; `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` → порожньо.
- `curl localhost:<port>/pulls/<id>/smart-diff` → валідна відповідь, у логах сервера нема LLM-виклику.
- Browser pane на тестовому PR: 5 груп у правильному порядку, docs/boilerplate згорнуті, lock-файл у boilerplate → Run review → `● N` на групі, крапка на файлі, картка знахідки під рядком зі смужкою й підписом, Accept/Dismiss змінює стан, Hide comments ховає, Original order повертає порядок GitHub.
- Демо-відео (скіл `browser-demo-screencast`) за сценарієм «Як перевірити», 1–3 хв.
- PR `L03-HW` → `otkachuk777/dev-digest:main`: опис реалізації, які субагенти що робили, що знайшов plan-verifier, відео. Наприкінці — `/engineering-insights`.

## Development Plan (planner)

Paths below: `PR = client/src/app/(shell)/repos/[repoId]/pulls/[number]`, `DV = PR/_components/DiffTab/diff-viewer`.

### Scope
- Modules: server and client, including both `vendor/shared` copies. e2e: no new flow, but the existing `05-pr-diff` must stay green.
- Out of scope, done or decided elsewhere:
  - fork test PR, demo video, commit and PR (the caller does these);
  - `split_suggestion.too_big` and `pseudocode_summary` (LLM work, later lessons);
  - i18n of the existing hard-coded "Hide/Show comments" string;
  - refactoring `pulls/findings-counts.ts`;
  - architecture and security review (separate agents).

### Deviations from the approved sections (small, evidence-backed)
1. **`SmartDiffResponse` already exists.** It is defined in `server/src/vendor/shared/contracts/review-api.ts:82-84` as `= SmartDiff`, and both copies are identical. Reuse it. Do not add a new schema.
2. **"Latest review per agent" is not extracted from `findingsCountsByPr`.**
   - Why not: that function does three things at once (keys by PR, picks the latest review, rolls up severities) and lives in `pulls` (`server/src/modules/pulls/findings-counts.ts:22-53`). Reusing it would need a new `pulls/index.ts` (`server/INSIGHTS.md:92-96`).
   - Instead: one repository query that mirrors the query in `pulls/routes.ts:162-172` (findings ⋈ reviews, `kind='review'`, newest first), plus a pure ~8-line `latestPerAgent` in `smart-diff/build.ts`.
   - `latestPerAgent` uses the **same group key** as findings-counts: `agentId ?? reviewId`.
   - The `kind='review'` predicate stays in SQL (`onion-architecture/SKILL.md` §Red flags: "filter rows in JS after the query").
3. **Order inside a group is GitHub order, taken on the client.**
   - `pr_files` has no position column (`server/src/db/schema/pulls.ts:36-44`), and the PR-detail route also selects it unordered (`pulls/routes.ts:271`).
   - In smart mode, DiffViewer builds each group as `files.filter(f => groupPaths.has(f.path))`, where `files` is the prop in PR-detail order.
   - Files that are in no group (for example, `pr_files` was refreshed after the smart-diff fetch) render after the groups, so no file is silently dropped.
4. **Counters and dots use client findings, not `finding_lines`.** The group count `● N`, the file dot and the inline cards all come from one `findingsByPath` map built from `usePrReviews`. They cannot disagree, and they all refresh on the same invalidation (same idea as `client/INSIGHTS.md:32-36`). The server still fills `finding_lines` because the contract requires it.
5. **FindingCard import path.** From `DV/CodeLine/CodeLine.tsx` the path is `../../../FindingCard`, not `../../FindingCard`.

### Insights applied
- `server/INSIGHTS.md:67-71` (findingsCountsByPr defines "latest per agent"): reuse its grouping rule and key (deviation 2). Do not write a second severity tally.
- `server/INSIGHTS.md:92-96` (cross-module imports only via `index.ts`): keep everything inside `reviews`. No import from `pulls`.
- `server/INSIGHTS.md:128-138` (vendor copies drift): `brief.ts` and `review-api.ts` are byte-identical today (checked with `diff`). Edit both, then diff again.
- `client/INSIGHTS.md:38-42` (severity UI): loop over the wire `Severity` (3 values), not the UI token (4 values). Applies to `topSeverity` and the line-label map.
- `client/INSIGHTS.md:46-50`: `user-event` is not installed, so tests use `fireEvent`.
- `client/INSIGHTS.md:79-83`: when a `beforeEach` configures mocks, use braces: `beforeEach(() => { … })`.
- `client/INSIGHTS.md:87-91`: never pair `borderColor` with `borderLeft*`. The CodeLine stripe uses only `borderLeft` and no other border property on the same element.
- `client/INSIGHTS.md:10-14`: runtime Zod imports from `@devdigest/shared` work in the client, so `useSmartDiff` parses with `SmartDiffResponse`.
- Root `INSIGHTS.md:40-44`: e2e uses npm, not pnpm.

### Constraints
- **Shared contracts.** Both `vendor/shared` copies change together (root `CLAUDE.md:37`). No lock-file or migration changes: no new dependency and no new table.
- **Naming and tests.** Wire fields are snake_case and every shape is a Zod contract (`CLAUDE.md:30`). The i18n namespace is the file name (`CLAUDE.md:31`). Server tests go in `server/test/`; client tests are co-located (`CLAUDE.md:32`).
- **Server arch** (`server/.dependency-cruiser.cjs`):
  - `routes-thin` (:43-57): the route imports only the service, contracts, `_shared` and errors.
  - `no-db-outside-infra` (:18-41): drizzle only in `repository/*.repo.ts`.
  - `smart-diff/*.ts` are domain files: they import only `@devdigest/shared` and each other. The `domain-pure` regex (:59-74) does not match the nested folder, so keep them pure by hand.
  - The known-violations baseline only shrinks (`onion-architecture/SKILL.md:17`).
- **Client arch** (`client/.dependency-cruiser.cjs`):
  - `no-cross-route-internals` (:35-57) allows `DiffTab → ../FindingCard` and `DiffTab → PR/_lib`, because both sit under the same `repos` segment.
  - `no-circular`: FindingCard must not import from DiffTab.
  - `no-orphans` (:70-96): every new file must be imported by a component. Imports from tests do not count.
- **Response schema.** It is enforced at runtime because `serializerCompiler` is set (`server/src/app.ts:65`).
- **ReDoS.** The regexes run on untrusted PR paths. Use linear patterns only (no nested quantifiers) and never `new RegExp(path)` (`security/SKILL.md` §Framework quirks).
- **Access control.** The service calls `repo.getPull(workspaceId, prId)` first and throws `NotFoundError` if it is missing, as `reviews/service.ts:207-209` does (`security/SKILL.md` §A01).

### Skills for implementer
| Files | Skills | Key rules |
|---|---|---|
| `server/src/modules/reviews/smart-diff/*`, `service.ts` | onion-architecture | Pure domain code in `smart-diff/`. The service orchestrates: load, then call the pure builder. No drizzle outside the repository (SKILL §Step 1 table, §Red flags). |
| `server/src/modules/reviews/routes.ts` | fastify-best-practices, onion-architecture | Parse → `getContext` → service. Params and response schema on the route ("Schema-first", `fastify-best-practices/SKILL.md` §Core Principles). No if/loop logic in the route (onion §Red flags). |
| `server/src/modules/reviews/repository*` | drizzle-orm-patterns, onion-architecture | Select only the columns you need. Put the predicate in `where` (drizzle SKILL §Best Practices 8; onion §Step 2 "rule naturally a WHERE"). |
| `*/src/vendor/shared/contracts/brief.ts` | zod | Use `z.enum` for a fixed set (`zod/references/schema-use-enums.md`). Types only via `z.infer` (`type-use-z-infer`). |
| `client/src/**` (non-test) | frontend-ui-architecture, react-best-practices, next-best-practices | See the notes below this table. |
| `client/**/*.test.{ts,tsx}` | react-testing-library | Test behaviour. Query with `getByRole` first, then `getByTitle` / `getByText`. Prefer fewer, longer tests (RTL SKILL §Philosophy, §Query Priority). |
| all non-test `.ts/.tsx` | security | Workspace scope and no ReDoS (see Constraints). |

Client rules for `client/src/**` (non-test):
- frontend-ui-architecture (§Step 1–2): code with a single consumer stays colocated. The role → color map is a UI mapping, so it goes in the component's `constants.ts`. Wire types come from `z.infer`.
- react-best-practices:
  - Derive values in render; don't store them in state (§Derive).
  - No array-index keys on lists that can reorder (§Key Prop).
  - Use `count > 0 &&`, not `count &&` (§Conditional).
  - Put `aria-label` on icon-only controls (§Accessibility).
  - At most 200 lines and 5–7 props per component (§Component Design).
- next-best-practices (§RSC Boundaries): put `"use client"` on interactive leaves only. Everything touched here is already a client component.

Unmapped skills: none. `typescript-expert` is not used because there is no type-level work.

### Steps

#### Step 1 — Contract enum (both copies)
- Files: modify `server/src/vendor/shared/contracts/brief.ts:97` and `client/src/vendor/shared/contracts/brief.ts:97`.
- Skills: zod (schema-use-enums).
- Change: `export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);`. **The enum order is the display order.**
- Verify:
  - `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing.
  - `cd server && pnpm exec vitest run test/contracts.test.ts` passes. The existing `SmartDiff` case at :110 uses `core`.
- Done when: both files are identical and the contracts test is green.

#### Step 2 — Classifier (test table first, then rules)
- Files: create `server/test/smart-diff-classify.test.ts`, `server/src/modules/reviews/smart-diff/constants.ts` and `server/src/modules/reviews/smart-diff/classify.ts`.
- Skills: onion-architecture (Domain ring: no fastify, drizzle, db or container), security (linear regexes).
- Change:
  - **Test first.** `it.each([[path, role], …])('%s → %s', …)` with at least these rows:

    | Role | Paths |
    |---|---|
    | boilerplate | `pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `Cargo.lock`, `client/dist/app.js`, `src/__tests__/__snapshots__/x.snap`, `api.generated.ts`, `vendor/x.min.js` |
    | tests | `client/src/Foo.test.tsx`, `server/test/reviews.it.test.ts`, `a.spec.ts`, `server/test/helpers/pg.ts`, `e2e/README.md` |
    | wiring | `client/src/index.ts`, `vitest.config.ts`, `tsconfig.build.json`, `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml`, `.claude/skills/security/SKILL.md` |
    | docs | `docs/architecture.md`, `README.md`, `CHANGELOG`, `LICENSE` |
    | core | `server/src/modules/reviews/service.ts`; `src/config.ts` (only `x.config.y` is wiring); `server/src/modules/reviews/smart-diff/build.ts` (`build/` is matched only as a directory) |
  - **`constants.ts`:**
    - `import { SmartDiffRole } from '@devdigest/shared'`
    - `export const ROLE_ORDER = SmartDiffRole.options;`
    - `export const ROLE_RULES: readonly { role: Exclude<SmartDiffRole, 'core'>; patterns: readonly RegExp[] }[]`, in priority order boilerplate → tests → wiring → docs. Patterns are tested against the full POSIX path:
      - boilerplate: `/(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/`, `/\.lock$/`, `/(^|\/)(dist|build)\//`, `/(^|\/)__snapshots__\//`, `/\.snap$/`, `/\.generated\./`, `/\.min\.js$/`
      - tests: `/\.(test|spec)\.[cm]?[jt]sx?$/` (also matches `.it.test.ts`), `/(^|\/)(test|tests|__tests__)\//`, `/(^|\/)e2e\//`
      - wiring: `/(^|\/)index\.[jt]s$/`, `/(^|\/)[^/]+\.config\.[^/]+$/`, `/(^|\/)tsconfig[^/]*\.json$/`, `/(^|\/)\.eslintrc[^/]*$/`, `/(^|\/)\.env[^/]*$/`, `/(^|\/)docker-compose[^/]*\.ya?ml$/`, `/(^|\/)\.github\//`, `/(^|\/)\.claude\//`
      - docs: `/\.mdx?$/i`, `/(^|\/)docs\//`, `/(^|\/)(README|CHANGELOG|LICENSE)[^/]*$/i`
  - **`classify.ts`:** `export function classifyFile(path: string): SmartDiffRole`. Return the role of the first rule with a matching pattern; otherwise return `'core'`.
- Verify: `cd server && pnpm exec vitest run test/smart-diff-classify.test.ts` fails before the implementation and passes after.
- Done when: all rows pass, and `classify.ts` / `constants.ts` import only `@devdigest/shared` and each other.

#### Step 3 — Builder + latest-per-agent (test first)
- Files: create `server/test/smart-diff-build.test.ts` and `server/src/modules/reviews/smart-diff/build.ts`.
- Skills: onion-architecture (pure domain; mirrors `findings-counts.ts`); zod only in the test (`SmartDiff.parse`). Do not re-parse in production code (onion §Red flags).
- Change:
  - **`latestPerAgent`:** `export function latestPerAgent<T extends { agentId: string | null; reviewId: string }>(rows: T[]): T[]`.
    - Rows arrive newest first.
    - For each `key = agentId ?? reviewId`, keep only rows whose `reviewId` equals the first `reviewId` seen for that key.
    - Docblock: "same rule as pulls/findings-counts.ts".
  - **`buildSmartDiff`:** `export function buildSmartDiff(files: { path: string; additions: number; deletions: number }[], findings: { file: string; startLine: number }[]): SmartDiff`.
    - Bucket files with `classifyFile`, keeping input order inside each bucket.
    - Emit groups as `ROLE_ORDER.filter(nonEmpty)`.
    - `finding_lines` = `[...new Set(lines for this path)].sort((a, b) => a - b)`.
    - `split_suggestion = { too_big: false, total_lines: Σ(additions + deletions), proposed_splits: [] }`.
    - Leave out `pseudocode_summary`.
  - **Tests for `buildSmartDiff`:**
    - Shuffled input comes out in group order core → tests → wiring → docs → boilerplate.
    - Empty roles are absent.
    - Finding lines are deduplicated, sorted, and attached only to their own file.
    - `total_lines` is correct.
    - `expect(() => SmartDiff.parse(out)).not.toThrow()`.
  - **Tests for `latestPerAgent`:**
    - When an agent re-runs, its older review is dropped.
    - Two different agents are both kept.
    - Rows with `agentId: null` are grouped per review.
- Verify: `cd server && pnpm exec vitest run test/smart-diff-build.test.ts` passes.
- Done when: all cases pass.

#### Step 4 — Repository query, service method, route
- Files: modify `server/src/modules/reviews/repository/review.repo.ts`, `server/src/modules/reviews/repository.ts`, `server/src/modules/reviews/service.ts` and `server/src/modules/reviews/routes.ts`.
- Skills: drizzle-orm-patterns + onion-architecture (SQL only in the repo), fastify-best-practices (schema-first route), security (A01).
- Change:
  - **`review.repo.ts`:** add `reviewFindingLocations(db, prId)`:
    ```ts
    db.select({
      agentId: t.reviews.agentId,
      reviewId: t.findings.reviewId,
      file: t.findings.file,
      startLine: t.findings.startLine,
    })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt))
    ```
    `and`, `desc` and `eq` are already imported at :1.
  - **`repository.ts`:** add a pass-through method on `ReviewRepository` next to `reviewsForPull`, with a one-line docblock: "newest review first, kind=review only".
  - **`service.ts`:** add `async smartDiff(workspaceId, prId): Promise<SmartDiff>`:
    1. `getPull`; if it is missing, throw `NotFoundError('Pull request not found')`.
    2. `Promise.all([repo.getPrFiles(prId), repo.reviewFindingLocations(prId)])`.
    3. Return `buildSmartDiff(files, latestPerAgent(rows))`.

    Import `SmartDiff` as a type from `@devdigest/shared`. No LLM or container calls.
  - **`routes.ts`:**
    - Add a docblock line: `GET /pulls/:id/smart-diff → role-grouped files + finding lines (no LLM)`.
    - Register the route:
      ```ts
      app.get(
        '/pulls/:id/smart-diff',
        { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
        async (req) => {
          const { workspaceId } = await getContext(container, req);
          return service.smartDiff(workspaceId, req.params.id);
        },
      );
      ```
    - Import `SmartDiffResponse` as a value from `@devdigest/shared`.
  - **Extend `server/test/reviews.it.test.ts`**, in the test "runs a review: map-reduce…" (~:183), after the reviews assertions:
    - `GET /pulls/${pr.id}/smart-diff` returns 200.
    - `groups` equals `[{ role: 'core', files: [{ path: 'src/config.ts', additions: 1, deletions: 0, finding_lines: [11] }] }]`.
    - `split_suggestion.total_lines === 1`.

    The test skips itself when Docker is not available.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/reviews.it.test.ts && pnpm arch`.
- Done when: typecheck and arch are green, and the it-test passes or is skipped because Docker is absent. Report which one happened.

#### Step 5 — Client data layer + findings helper
- Files: modify `client/src/lib/api/reviews.ts`, `PR/_lib/findings.ts` and `client/messages/en/prReview.json`; create `PR/_lib/findings.test.ts`.
- Skills: frontend-ui-architecture (data access lives in `lib/api/reviews.ts` with the exported key factory; the domain rule lives in the subtree `_lib`), react-testing-library (a unit test is fine for pure logic).
- Change:
  - **`reviews.ts`:**
    - Add `reviewKeys.smartDiff: (prId) => ["pr-smart-diff", prId] as const`.
    - Add `export function useSmartDiff(prId)`: `useQuery({ queryKey: reviewKeys.smartDiff(prId), queryFn: () => api.get(`/pulls/${prId}/smart-diff`, SmartDiffResponse), enabled: !!prId })`.
  - **`_lib/findings.ts`:** add `export function latestFindingsPerAgent(reviews: ReviewRecord[]): Map<string, FindingRecord[]>`.
    - Take only `kind === "review"` reviews, in the given newest-first order.
    - Keep the first review per `agent_id ?? id`.
    - Group their findings by `file`.
  - **`prReview.json` → `smartDiff`:** keep the existing keys and add:
    - labels and hints: `testsLabel`, `docsLabel`, `coreHint`, `testsHint`, `wiringHint`, `docsHint`, `boilerplateHint`;
    - order toggle: `smartOrder`, `originalOrder`;
    - `noReviewYet`;
    - `unanchoredFindings`: "{count, plural, one {# finding} other {# findings}} outside the diff";
    - `filesWithFindings`: "{count} files with findings";
    - line labels: `blocker`, `warning`, `suggestion`.
  - **Tests:**
    - When an agent re-runs, only its newest review's findings are kept.
    - Findings from two agents are merged.
    - A `summary` review is ignored.
    - Findings are grouped by path.
- Verify: `cd client && pnpm exec vitest run _lib/findings.test.ts && pnpm typecheck`.
- Done when: green.

#### Step 6 — SmartDiffGroup component
- Files: create `DV/SmartDiffGroup/{SmartDiffGroup.tsx,index.ts,styles.ts,constants.ts,SmartDiffGroup.test.tsx}`.
- Skills: frontend-ui-architecture (the role → color map and the collapsed-by-default set are UI mappings in `constants.ts`), react-best-practices (composition via `children`; at most 5 props), react-testing-library.
- Change:
  - **Props:** `{ role: SmartDiffRole; fileCount: number; filesWithFindings: number; children: React.ReactNode }`. The children are the FileCards; DiffViewer passes them in.
  - **State:** `open` starts as `!COLLAPSED_BY_DEFAULT.has(role)`. The collapsed set is `docs` and `boilerplate`.
  - **Header:** a `<button type="button" aria-expanded={open}>`, sticky (`position: "sticky", top: 0, zIndex: 2`, background `var(--bg-primary)`). Contents, in order:
    1. the chevron (`chevronFor` from `../styles`);
    2. a 10×10 square in `ROLE_COLOR[role]`, using existing tokens only: core `var(--accent)`, tests `var(--ok)`, wiring `var(--info)`, docs `var(--text-muted)`, boilerplate `var(--border-strong)`;
    3. `t(ROLE_I18N[role].label)`;
    4. the muted hint `t(ROLE_I18N[role].hint)`;
    5. `● {filesWithFindings}`, only when it is `> 0`, with a `title` from `filesWithFindings`;
    6. `t("smartDiff.filesCount", { count })`.
  - **Constants:** `ROLE_I18N` is an explicit `Record<SmartDiffRole, { label; hint }>` map, not built from string templates.
  - **Imports:** `import type { SmartDiffRole } from "@devdigest/shared"`. Do not import the `SmartDiffGroup` contract type into this file, because its name clashes with the component.
  - **Test** (wrap in NextIntlClientProvider with `{ prReview }`; use `fireEvent`):
    - (a) A `core` group renders its children and shows "3 files" and `● 2`.
    - (b) A `docs` group hides its children until the header button is clicked.
    - (c) With `filesWithFindings=0`, no `●` is shown.
- Verify: `cd client && pnpm exec vitest run SmartDiffGroup`.
- Done when: green, and the component is under 200 lines.

#### Step 7 — Findings in FileCard + CodeLine
- Files: create `DV/findings.ts` (next to `comments.ts`) and `DV/FileCard/FileCard.test.tsx`; modify `DV/FileCard/FileCard.tsx`, `DV/CodeLine/CodeLine.tsx`, `DV/styles.ts`, `DV/constants.ts` and `DV/index.ts`.
- Skills: react-best-practices (derive values in render; `useMemo` only where the existing comments code already uses it), frontend-ui-architecture (the API shape and pure helpers sit next to `comments.ts`, same pattern), react-testing-library.
- Change:
  - **`findings.ts`:**
    - `export interface DiffFindingsApi { byPath: Map<string, FindingRecord[]>; show: boolean; onAction: (findingId: string, action: FindingActionKind) => void }`.
    - `findingKey(f) = lineKey("RIGHT", f.start_line)`, reusing `lineKey` from `./comments`.
    - `partitionFindings(findings, renderedKeys) → { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] }`, the same shape as `partitionThreads`.
    - `topSeverity(findings): Severity | null`. It iterates the wire order `["CRITICAL", "WARNING", "SUGGESTION"]` and is typed from the wire `Severity` (`client/INSIGHTS.md:38-42`).
    - `DV/index.ts` also exports `type DiffFindingsApi`.
  - **`constants.ts`:** `SEVERITY_LINE_LABEL: Record<Severity(wire), "blocker" | "warning" | "suggestion">`, mapping CRITICAL→blocker, WARNING→warning, SUGGESTION→suggestion.
  - **`FileCard`:**
    - New prop `findings?: DiffFindingsApi`. Compute `fileFindings = findings?.byPath.get(file.path) ?? []`.
    - Extract the `renderedKeys` computation once and reuse it for both threads and findings. It is built from the existing `lines`.
    - Header dot, before the path, when `fileFindings.length > 0`:
      - an 8px circle in `SEV[topSeverity].c`;
      - `title` and `aria-label` text such as "2 findings";
      - shown whatever `show` is, like the comment count.
    - Translators: use a second `useTranslations("prReview")` for the new strings. The existing strings keep using `shell`.
    - For each row, pass `findings={findings?.show ? matched.get(k) : undefined}`, with `k` from `keysForLine(ln)`. Only `RIGHT:` keys can match.
    - After the lines, when `show && unanchored.length > 0`, render a block that reuses `cs.outdatedWrap` / `cs.outdatedTitle`, with the title `t("smartDiff.unanchoredFindings", { count })` and one `FindingCard` per unanchored finding.
  - **`CodeLine`:**
    - New props `findings?: FindingRecord[]` and `onFindingAction?`.
    - When `findings` is non-empty:
      - add `borderLeft: 3px solid SEV[top].c` to the row, with no `borderColor` on the same element (`client/INSIGHTS.md:87-91`);
      - add a right-aligned label `t(\`smartDiff.${SEVERITY_LINE_LABEL[top]}\`)` in `SEV[top].c`.
    - Under the row, wrapped in `cs.thread` for alignment, render one `<FindingCard key={f.id} f={f} defaultExpanded onAction={(a) => onFindingAction?.(f.id, a)} />` per finding.
    - Import FindingCard from `../../../FindingCard`.
    - FindingCard needs no change: collapsing to one line is its own header toggle.
  - **Test** (NextIntlClientProvider with `{ shell, prReview }`). Setup: a patch that adds line 11; one CRITICAL finding at line 11 and one at line 999.
    - With `show: true`: the dot has its title, the anchored finding's title is visible, the "blocker" label is shown, and the unanchored heading and the second finding's title are shown.
    - With `show: false`: neither finding title renders, but the dot is still there.
- Verify: `cd client && pnpm exec vitest run FileCard FindingCard && pnpm typecheck`.
- Done when: green, and the existing FindingCard tests are still green.

#### Step 8 — DiffViewer + DiffTab wiring
- Files: modify `DV/DiffViewer/DiffViewer.tsx` and `PR/_components/DiffTab/DiffTab.tsx`; create `PR/_components/DiffTab/useDiffFindings.ts`.
- Skills: react-best-practices (at most 5–7 props; no derived state in `useState`; use an effect only to sync with an external system), frontend-ui-architecture (a hook with one consumer is colocated with it).
- Change:
  - **`DiffViewer`:** props `{ files; commenting?; findings?: DiffFindingsApi; groups?: SmartDiff["groups"] }`.
    - Smart mode (`groups` given), for each group:
      1. `groupFiles = files.filter(f => paths.has(f.path))`; skip the group if this is empty.
      2. Render `<SmartDiffGroup role fileCount={groupFiles.length} filesWithFindings={…}>`, where `filesWithFindings = groupFiles.filter(f => (findings?.byPath.get(f.path)?.length ?? 0) > 0).length`.
      3. Inside it, render the FileCards keyed by `f.path`.

      After the groups, render any leftover files that are in no group.
    - Original mode (no `groups`): keep the current flat list and pass `findings` to each FileCard.
  - **`useDiffFindings(prId)`** returns `{ byPath, hasReviews, onAction }`:
    - `byPath`: `usePrReviews(prId)` → `latestFindingsPerAgent`.
    - `onAction`: from `useFindingAction()`; `onAction = (findingId, action) => mutate({ findingId, action, prId })`.
    - Refresh after runs: `usePrActiveRuns(prId)`, plus a `useRef` holding the previous "running" flag. A `useEffect` on `running` invalidates `reviewKeys.list(prId)` when it changes from true to false. This syncs with server run state, and the approved plan requires it.
    - `hasReviews = reviews?.some(r => r.kind === "review")`.
  - **`DiffTab`:**
    - Data: `useSmartDiff(prId)`.
    - State: `const [order, setOrder] = useState<"smart" | "original">("smart")` and `const [visible, setVisible] = useState({ github: false, findings: true })`.
    - `commenting.showComments = visible.github`. After a successful `onSubmit`, set `github: true`.
    - Visibility toggle button:
      - shown when `commentCount > 0 || findingsTotal > 0`;
      - label and icon depend on `anyVisible = visible.github || visible.findings`;
      - click: `setVisible({ github: !anyVisible, findings: !anyVisible })`;
      - count: `commentCount + findingsTotal`.
    - Order toggle: two `Button kind="ghost" size="sm" active={order === …}` buttons, labelled `t("smartDiff.smartOrder")` and `t("smartDiff.originalOrder")`.
    - When `!hasReviews`, show a muted `t("smartDiff.noReviewYet")` caption in the SectionLabel `right` slot.
    - Pass `groups={order === "smart" ? smartDiff?.groups : undefined}`. While the query is loading or has failed, the view falls back to original order, so `e2e/05-pr-diff` keeps working.
- Verify: `cd client && pnpm typecheck && pnpm test && pnpm arch`.
- Done when: all green, with no new arch violation and `DiffTab.tsx` under 200 lines.

#### Step 9 — Full verification
- Server: `cd server && pnpm typecheck && pnpm test && pnpm arch`.
- Client: `cd client && pnpm typecheck && pnpm test && pnpm arch`.
- Contracts: `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing.
- Regression: `cd e2e && npm run e2e:hermetic`. Flow `05-pr-diff` must still find `src/config.ts`.
- Done when: all green. The caller does the live Browser-pane check and the video (see Verification above).

### Test plan
- New tests: `server/test/smart-diff-classify.test.ts`, `server/test/smart-diff-build.test.ts`, `PR/_lib/findings.test.ts`, `DV/SmartDiffGroup/SmartDiffGroup.test.tsx`, `DV/FileCard/FileCard.test.tsx`.
- Changed test: `server/test/reviews.it.test.ts` (new smart-diff assertion).
- Docker: needed only for `reviews.it.test.ts`, which skips itself otherwise. Report whether it ran.
- e2e: no new flow is needed, because the existing `05-pr-diff` covers this tab. It is required as a regression run, because DiffViewer, FileCard and CodeLine change. Use npm.

### Risks & open questions
- Accepted and dismissed findings still render (muted, as FindingCard already does) and count toward the dots and `● N`. Hiding them is a product decision.
- `position: sticky; top: 0` on group headers: the offset under the app shell's own sticky header is unverified. It may need a `top` offset during the live check.
- `pr_files` is refreshed by `GET /pulls/:id` (`pulls/routes.ts:232`). A smart-diff fetched before that refresh can miss new files; deviation 3 (leftover files render after the groups) keeps them visible.
- `(^|/)(dist|build)/` also catches a real source folder named `build/`. This is an accepted heuristic, pinned by the `smart-diff/build.ts → core` test row (it is a file, not a folder).

### Not verified
- The "prototype" referenced for the order toggle: no prototype file was found in the repo (searched for `boilerplate` outside `node_modules`). The Button `active` prop does exist (`client/src/vendor/ui/primitives/tokens.ts`, `ButtonProps.active`).
- Whether vitest path filters work with the `(shell)` and `[repoId]` path segments. The verify commands avoid this by filtering on file-name substrings only.
