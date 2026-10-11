# Plan: SPEC-04 Eval Pipeline (server + client)

## Context
L06 homework "Eval pipeline". Build a regression harness for review agents: turn an accepted or dismissed finding into an eval case, run an agent over its frozen case set as an async suite run, score it in code (zero LLM), and show history, Compare and Promote, the Evals tab and the Eval Dashboard. Branch `L06-HW` (from main `f9de960`).

User decisions (round 1, "all recommended"):
- `pnpm verify:l06` FAILS when Docker is missing. It does not skip.
- OQ-1 → 8 inline fixture cases (5 `must_find` + 3 `must_not_flag`) in the new `server/src/db/seed-evals.ts`, with `source_finding_id = null`, idempotent by (agent, name).
- New schema: `eval_cases` with an `agent_id` FK (cascade), plus the new `eval_runs` (suite run, `config` jsonb, metrics) and `eval_case_results` (`case_id` SET NULL, `case_name` kept). Migrations are appended via `pnpm db:generate`.
- Execution mode: parallel. Test mode: inline.
- OQ-2 → Promote leaves skills unchanged (AC-69).
- Own code. `upstream/full-functionality` may be read as a hint, never copied. ci-export (L07) is out of scope.

## Requirements
- Source: `specs/SPEC-04-eval-pipeline.md` (Status: approved; `spec-lint.sh` → OK)
- Items: AC-1…AC-83, EC-1…EC-22, NFR-1…NFR-11. They are referenced by ID here, not rewritten.

## Requirements review
- Status: approved.
- **Gaps** (each is handled by the plan; none is blocking):
  - "200 KB" (AC-14, AC-27, NFR-4) is not defined in bytes. The plan uses `MAX_DIFF_BYTES = 200 * 1024`, measured with `Buffer.byteLength(diff, 'utf8')` on the server and `new TextEncoder().encode(diff).length` on the client.
  - The agent eval detail URL is not named. The plan uses `/eval/[agentId]` (AC-17, AC-72, AC-73 link there).
  - The skill `source` is not in the snapshot contract (`EvalRunDetail.config.skills = {skill_id,name,version,body}`). Non-`manual` skills must still be delimiter-wrapped as untrusted at run time (`server/src/modules/reviews/helpers.ts:132` `skillPromptBlocks`). So the DB `config` jsonb also stores `source`. Zod strips it from the wire.
  - AC-38 "the frozen PR title and description as the PR description" → `prDescription = title + "\n\n" + body` (trimmed; omitted when both are empty), `task = 'Review this pull request.'`. There is no intent, repoMap, callers, specs or memory.
  - The precision unit (AC-55) is the finding. A kept finding that matches two `must_find` items of its case counts as one TP, and the same rule applies to FP. EC-14 is pinned in a unit test.
  - A single-case run while another single-case run of the same agent is in flight: the spec only blocks on a running suite (AC-42). The plan adds no extra lock.
- **Conflicts:**
  - AC-27 needs 400 `invalid_eval_case` naming the field. The app's global handler turns any Zod `schema.body` failure into 422 `validation_error` (`server/src/app.ts:99-107`). → Eval case routes do NOT put `EvalCaseInput` in `schema.body`. The service `safeParse`s it and throws `AppError('invalid_eval_case', msg, 400, { field })`.
  - NFR-8 requires focus trap and return in modals. The shared `Modal` has neither (`client/src/vendor/ui/kit/Modal.tsx`), while `Drawer` already does (`client/src/vendor/ui/kit/Drawer.tsx:21-43`). → Add the same behaviour to `Modal` (this affects every modal: regression risk, see Risks).
  - AC-9 needs a toast with a link. `lib/toast.tsx` toasts are text-only (`client/src/lib/toast.tsx:9-20`). → Add an optional `{ label, href }` action.
  - NFR-7 says all new copy goes in the `eval` namespace, but `AgentEditor` labels tabs from the `agents` namespace (`AgentEditor.tsx:20`). → The Evals tab entry carries `ns: "eval"` and its label comes from `eval.json`.
  - The existing `eval.json` (starter copy, no consumers: `grep 'useTranslations("eval")' client/src` → none) and the reserved contracts (`knowledge.ts:131-166`, `eval-ci.ts:20-89`, consumed only by `server/test/contracts.test.ts:14,163`) are both replaced.
- **Recommendations:**
  - Reuse `parseUnifiedDiff` (`server/src/adapters/git/diff-parser.ts:14`) for every diff validation and run.
  - Reuse `reviewPullRequest` (`reviewer-core/src/review/run.ts:140`), which already returns kept findings, `dropped` and `costUsd`.
  - Reuse `skillPromptBlocks` (export it via `reviews/index.ts`) and `AgentsService.update` for Promote, which already bumps the version and snapshots `agent_versions` (`server/src/modules/agents/repository.ts:128-160`).
  - Reuse `MetricCard`, `Sparkline`, `LineChart` and `BarRow` from `@devdigest/ui` and `ConfirmModal`. Adds no new dependency.

## Scope
- Modules: `server`, `client`. `reviewer-core` is consumed unchanged.
- Out of scope:
  - ci-export / L07, MCP tool, e2e flow (the spec's Non-goals).
  - NFR-2 and NFR-11 are manual checks done by the user (Test plan). They need no code.
  - Reconciling the pre-existing `eval-ci.ts` / `productionize.ts` drift between the shared copies (`server/INSIGHTS.md` Open Questions). Only the eval symbols are touched.
  - Architecture and security review are separate agents.

## Execution mode
- Mode: **parallel**. Group 0 (contracts) runs and merges first. Then Group S (server) and Group C (client) run at the same time in their own worktrees.
- Merge order: G0 → S → C. The groups own disjoint files, so S and C can merge in either order.
- Each worktree's first chunk runs `pnpm install` in its module(s). A fresh worktree has no `node_modules`.
- Per root `INSIGHTS.md:127`, the main session cuts `.claude/worktrees/spec-04-{server,client}` from the merged G0 commit with `git worktree add -b feat/spec-04-<group> <path> <sha>`. It passes the absolute path to each implementer and commits each chunk with explicit paths. Never use `isolation: "worktree"`.

| Group | Chunk | Steps | Owned files | Depends on | Merge order |
|---|---|---|---|---|---|
| 0 | G0 | 1 | `server/src/vendor/shared/contracts/{eval,knowledge,eval-ci}.ts`, `server/src/vendor/shared/index.ts`, the same 4 files under `client/src/vendor/shared/`, `server/test/contracts.test.ts`, `server/test/eval-contracts.test.ts` | — | 1 |
| S | S1 | 2, 3 | `server/src/db/schema/eval.ts`, `server/src/db/rows.ts`, `server/src/db/migrations/**` (generated), `server/src/modules/eval/{constants,helpers,scoring}.ts`, `server/test/eval-scoring.test.ts`, `server/test/eval-frozen-input.test.ts` | G0 | 2 |
| S | S2 | 4 | `server/src/modules/eval/{repository,service,routes}.ts`, `server/src/modules/index.ts`, `server/test/eval.it.test.ts` (create) | S1 | 2 |
| S | S3 | 5, 6 | `server/src/modules/eval/executor.ts`, `server/src/modules/eval/{service,repository,routes}.ts` (extend), `server/src/modules/agents/index.ts` (new), `server/src/modules/reviews/index.ts`, `server/src/server.ts`, `server/test/eval-executor.test.ts`, `server/test/eval.it.test.ts` (extend) | S2 | 2 |
| S | S4 | 7 | `server/src/db/seed-evals.ts`, `server/src/db/seed.ts`, `server/package.json`, `server/test/eval.it.test.ts` (extend) | S3 | 2 |
| C | C1 | 8, 9 | `client/src/lib/api/eval.ts`, `client/src/lib/eval.ts` (+ `eval.test.ts`), `client/src/lib/toast.tsx`, `client/src/vendor/ui/kit/Modal.tsx`, `client/src/vendor/ui/nav.ts` (+ `nav.test.ts`), `client/.dependency-cruiser.cjs`, `client/messages/en/eval.json`, `FindingCard/**` | G0 | 3 |
| C | C2 | 10, 11 | `agents/[id]/_components/AgentEditor/{AgentEditor.tsx,constants.ts,AgentEditor.test.tsx}`, `AgentEditorView/{AgentEditorView.tsx,AgentEditorView.test.tsx}`, `AgentEditor/_components/{EvalsTab,EvalCaseModal}/**`, `eval.json` (append) | C1 | 3 |
| C | C3 | 12, 13 | `client/src/app/(shell)/eval/page.tsx`, `eval/_components/EvalDashboardView/**`, `eval/[agentId]/page.tsx`, `eval/[agentId]/_components/{EvalAgentDetailView,RunHistoryTable,RegressionBanner}/**`, `eval.json` (append) | C2 | 3 |
| C | C4 | 14 | `eval/[agentId]/_components/CompareModal/**`, `EvalAgentDetailView.tsx` (wire Compare), `eval.json` (append) | C3 | 3 |

(All `agents/...`, `eval/...` and `FindingCard/**` paths are under `client/src/app/(shell)/`; FindingCard is at `repos/[repoId]/pulls/[number]/_components/FindingCard/`.)

Deviation from the default "messages in Group 0": the server never reads `messages/en/eval.json`, so only Group C owns it. Its chunks edit it one after another.

## Test mode
inline

## Decisions
The `brainstorm` agents could not be started in this run. The `agent-type-guard` hook demands `run_in_background: false`, and the Agent tool in this harness does not pass that parameter (two attempts were denied). The planner settled the forks from code evidence, recorded below. The caller may re-run brainstorms on B1 and B2 before approval.

- **B1 Suite-run execution and in-flight guard** → fire-and-forget in-process, like reviews (`void executor.runSuite(...).catch(log)`; `server/src/modules/reviews/service.ts:148`). The guard is a Postgres **partial unique index** `eval_runs(agent_id) WHERE status = 'running'`: the insert fails with `23505` → 409 `eval_run_in_progress`. The guard is atomic and race-free, with no in-memory state to lose.
  - Not JobRunner: its per-job default timeout is 120 s with 2 retries (`server/src/platform/jobs.ts:40-41`), but a suite can last up to 50 × 120 s, and a retry would re-run paid cases.
  - A single-case run only checks for a running suite (a select) and takes no lock (the spec asks for nothing more).
  - The reaper `EvalService.reapInterrupted()` is called from `server/src/server.ts` next to the review reaper, never in `buildApp` (`server/INSIGHTS.md:216-220`).
  - Confidence: planner, medium-high.
- **B2 Storage layout / last_result** → `eval_cases.last_result jsonb NULL` holds the newest `EvalCaseResult`. Suite runs also write one `eval_case_results` row per case (`run_id` NOT NULL, FK cascade). Single-case runs write only `last_result` (AC-30: "add nothing to the agent's suite-run history").
  - An edit that changes diff, meta or expectation sets `last_result = null` (AC-34). A rename does not.
  - This avoids a circular FK (cases ↔ results) and a per-row subquery on the case list (NFR-2).
  - Confidence: planner, medium-high.
- **B3 Migration mechanics** → two generated migrations, so `drizzle-kit generate` never asks its interactive "renamed or created?" prompt:
  - (a) remove `evalCases` and `evalRuns` from the schema → `pnpm db:generate --name drop_reserved_eval` (DROP TABLEs only);
  - (b) add the new three tables → `pnpm db:generate --name eval_pipeline` (CREATEs only).
  - The drop also clears old-shape rows. 9 refs (`reference/full-build`, `demo/security-review-fixture`, `fix/review-inline-line-422`, `full-functionality`, … on origin and upstream) contain code that writes `evalCases`/`evalRuns`, so a shared local DB may hold such rows (root `INSIGHTS.md:32` correction).
  - Confidence: high.
- **B4 Prompt word diff (AC-65)** → an in-house word-level LCS in the Compare modal's `helpers.ts` (prompts are a few thousand words; O(n·m) is fine). No new dependency. Confidence: high.
- OQ-2 → Promote sets provider, model, system_prompt and strategy only (AC-69). This is the spec default and the user confirmed it.

## Insights applied
- `server/INSIGHTS.md:216-220` (reaper in `server.ts`, not `buildApp`) → Step 6 adds the eval reaper in `server.ts`.
- `server/INSIGHTS.md:222-226` (terminal status LAST) → the executor writes every case result plus the metrics, and only then the status (AC-41).
- `server/INSIGHTS.md:192-196` (`timeoutMs` does not bound the call) → per case, `Promise.race` with a 120 s timer, plus a `checkCancelled` that throws after the deadline so map-reduce stops further chunks.
- `server/INSIGHTS.md:279-283` (cross-module via `index.ts`) → new `agents/index.ts` (AgentsService), and `reviews/index.ts` re-exports `skillPromptBlocks`.
- `server/INSIGHTS.md:165-177` (scope BOTH sides of a link) → finding, review agent and case are all resolved inside the caller's workspace (NFR-9).
- `server/INSIGHTS.md:285-289` (an openrouter default hits the real API in it-tests) → `eval.it.test.ts` injects `MockLLMProvider` for `openai`, `anthropic` and `openrouter`, plus an empty `secrets` override for AC-44 (the machine has real keys in `~/.devdigest/secrets.json`).
- `server/INSIGHTS.md:331-337` and root `INSIGHTS.md:32` (journal append-only; existing-row premise across branches) → B3.
- `server/INSIGHTS.md:323-327` (surrogate-safe cut before jsonb) → LLM finding titles stored in `findings[]` are cut with `cut()` from brief helpers only if capped. No cap is planned, so nothing is sliced.
- `server/INSIGHTS.md:345-355` (shared copies drift) → G0 diffs both copies first. The new `contracts/eval.ts` is byte-identical, and a test pins that (NFR-10).
- `client/INSIGHTS.md:399-403` (tabs allow-listed twice) → Step 10 edits `TABS` and `VALID_TABS`, and tests `AgentEditorView` with `?tab=evals`.
- `client/INSIGHTS.md:464-468` (mutation `onError` after unmount) → run-start and from-finding mutations put their toast in the hook definition (AC-49).
- `client/INSIGHTS.md:407-411` (no `user-event`) → tests use `fireEvent`.
- `client/INSIGHTS.md:452-456` (braces in `beforeEach` with mocks).
- `client/INSIGHTS.md:431-435` (`<Button active>` only for tertiary) → the range selector and modal type selector use `kind="tertiary"`.
- root `INSIGHTS.md:36-40` (chunks of 2–3 steps, fresh implementer each) → chunk table.

## Constraints
- Migrations are append-only via `pnpm db:generate`, and `meta/_journal.json` is never hand-edited (`CLAUDE.md` Do not touch; `server/CLAUDE.md`).
- Both `vendor/shared` copies change together (`CLAUDE.md` Do not touch).
- Lock files only via the package manager. No dependency is added.
- `pnpm arch` stays green in server AND client. The baselines only shrink (`server/.dependency-cruiser.cjs`, `client/.dependency-cruiser.cjs`).
- The client route rule names the top-level routes. A new `eval` route must be added to both regex lists, or it falls outside the rule (`client/.dependency-cruiser.cjs:35-57`).
- Server domain-pure: `modules/eval/{helpers,constants}.ts` must not import `src/adapters`, `src/db` or the container (`server/.dependency-cruiser.cjs:59-74`). `parseUnifiedDiff` is therefore called in `service.ts`/`executor.ts`, and the pure helpers take a parsed `UnifiedDiff`.
- Routes are thin: no adapters or db in `routes.ts` (`server/.dependency-cruiser.cjs:43-57`).
- Wire fields are snake_case, and every shape is a PascalCase Zod export with its `z.infer` type (`CLAUDE.md` Naming).
- i18n: the `eval` namespace = `client/messages/en/eval.json`, ICU plurals (NFR-7).
- Tests: server in `server/test/`; client co-located `<Name>.test.tsx`; `*.it.test.ts` needs Docker (`CLAUDE.md` Naming).

## Skills for implementer
| Files (glob) | Skills | Key rules (source) |
|---|---|---|
| `*/src/vendor/shared/contracts/eval.ts` | zod | export schema + `z.infer` type; `z.enum` for fixed strings; `.nullable()` vs `.optional()` per contract table; `safeParse` for user input and `issue.path` for the field name (`zod/SKILL.md` §Quick Reference 1, 2, 4, 5) |
| `server/src/modules/eval/**` | onion-architecture | ring by file role; only `repository.ts` imports drizzle; another module only via `index.ts` or `container.*`; each table has one owning module (eval owns `eval_*`; reads of findings/reviews/pr_files are read-only joins in its own repo; agent writes go through `AgentsService`); every list query bounded in SQL; no LLM inside a tx; a loop of paid calls persists each item right after its call (`onion-architecture/SKILL.md` §Step 1, §Step 2, §Transactions, §Red flags) |
| `server/src/modules/eval/routes.ts`, `server/src/server.ts` | fastify-best-practices | plugin per module, `schema.params` with `IdParams`, `reply.status(201/202/204)`, errors via `AppError` (`fastify-best-practices/SKILL.md` §How to use → `rules/routes.md`, `rules/error-handling.md`, `rules/testing.md`) |
| `server/src/db/schema/eval.ts`, migrations, `server/src/modules/eval/repository.ts`, `server/src/db/seed-evals.ts` | drizzle-orm-patterns, postgresql-table-design | FK via arrow fns; index FK columns manually; NOT NULL where required; `timestamptz`; `double precision` for metrics; `jsonb` with `CHECK (jsonb_typeof(...))`; unique `(agent_id, name)`; partial unique for the in-flight guard; `onConflictDoNothing` for idempotent seed (`drizzle-orm-patterns/SKILL.md` §Constraints and Warnings; `postgresql-table-design/SKILL.md` §Core Rules, §Constraints, §Indexing, §JSONB Guidance) |
| any non-test `.ts/.tsx` | security | A01: every id is resolved in the caller's workspace, 404 otherwise; A05 XSS: LLM titles, names, prompts and diffs rendered as plain text (no `Markdown`, no `dangerouslySetInnerHTML`); Agentic: frozen diff and PR meta reach the model only through reviewer-core's untrusted blocks (`security/SKILL.md` §A01, §A05 Cross-Site Scripting, §Agentic AI Security) |
| `client/src/**/*.{ts,tsx}` | frontend-ui-architecture, react-best-practices | place code by consumers: Evals tab and case modal live under `AgentEditor/_components/`; dashboard and detail under `app/(shell)/eval/**/_components/`; helpers shared by both routes go in `lib/eval.ts`; data access in one module `lib/api/eval.ts` with an exported key factory; derive, don't store; URL state (`?tab`, `?range`) in search params; a11y: aria-label on icon buttons, focus trap (`frontend-ui-architecture/SKILL.md` §Step 1, §Step 2, §Red flags; `react-best-practices/SKILL.md` §Derive, Don't Store, §State Hygiene, §Data Fetching, §Accessibility) |
| `client/src/app/**` | next-best-practices | thin `page.tsx` rendering a `"use client"` view; `useSearchParams` inside the client view, as in `AgentEditorView` (`next-best-practices/SKILL.md` §RSC Boundaries, §Directives) |
| `client/**/*.test.{ts,tsx}` | react-testing-library | query by role or label first; `findBy` for async; mock `@/lib/api/eval` hooks the way `AgentEditorView.test.tsx` does (`react-testing-library/SKILL.md` §Query Priority, §Async Testing) |

Unmapped skills: none.

## Steps

### Step 1 — Eval contracts in both shared copies (Group 0, chunk G0)
- Covers: NFR-10; the contract tables of the spec (§Contracts)
- Files:
  - create `server/src/vendor/shared/contracts/eval.ts` and `client/src/vendor/shared/contracts/eval.ts` (byte-identical);
  - modify both `contracts/knowledge.ts` (delete the `// ---- Eval ----` block: `EvalPerTrace`, `EvalRun`, `EvalOwnerKind`, `EvalCase`, lines 131-166);
  - modify both `contracts/eval-ci.ts` (delete `EvalCaseInput`, `EvalRunRecord`, `EvalRunResult`, `EvalTrendPoint`, `EvalDashboard`, lines 16-89; drop `EvalRun`/`EvalOwnerKind` from the line-3 import in each copy, keeping the rest of each copy's line as it is);
  - modify both `index.ts` (add `export * from './contracts/eval.js';` and fix the docblock);
  - modify `server/test/contracts.test.ts` (remove the `EvalRun` import and its parse in the `Conformance / Onboarding / EvalRun / MemoryItem` case);
  - create `server/test/eval-contracts.test.ts`.
- Skills: zod — export schema + type, enums (`zod/SKILL.md` §Quick Reference 1, 3); onion-architecture — reuse existing contracts before writing new ones (`onion-architecture/SKILL.md` §Step 2 "Before you write a new schema").
- Change: first run `diff server/src/vendor/shared/contracts/<f> client/src/vendor/shared/contracts/<f>` for `knowledge.ts` and `eval-ci.ts`. Then define in `eval.ts`:
  - `EvalExpectationType` = `z.enum(['must_find','must_not_flag'])`.
  - `EvalExpectationItem` (file 1–500 chars, `start_line` int ≥ 1, `end_line` int ≥ 1, `severity`/`category`/`title` optional strings; the end ≥ start rule is checked in the server validator so it can name the field).
  - `EvalPrMeta` `{ title: string ≤ 300, body: string ≤ 10000 }`.
  - `EvalCaseResultStatus`; `EvalResultFinding` `{file,start_line,end_line,severity,category,title}`.
  - `EvalCaseResult`, `EvalCase`, and `EvalCaseInput` (`expectation_type` optional; name `.min(1).max(80)`; `expected` `.min(1).max(20)`; `input_diff` string).
  - `EvalRunStatus`; `EvalRunRecord` (all fields of the spec table).
  - `EvalSkillSnapshot` `{skill_id,name,version,body}`; `EvalRunConfig` `{provider: Provider, model, system_prompt, strategy: ReviewStrategy, skills}`; `EvalRunDetail = EvalRunRecord.extend({ config, results })`.
  - `EvalRange` = `z.enum(['7d','30d','90d','all'])`.
  - `EvalCaseFromFindingResult` `{ case, created }`.
  - `EvalSkipReason`; `EvalRunAllResult` `{ started: EvalRunRecord[], skipped: {agent_id, agent_name, reason}[] }`.
  - `EvalDashboardAgent`; `EvalDashboard` `{ agents, recent_runs: (EvalRunRecord & {agent_name})[] }`.
  - Import `Provider` and `ReviewStrategy` from `./knowledge.js` (check they exist there in both copies).
  - `eval-contracts.test.ts`:
    - asserts `readFileSync` of the two `eval.ts` copies is equal (NFR-10);
    - parses an EC-14-shaped `EvalRunDetail` fixture;
    - rejects `expectation_type: 'other'` and `recall: 1.5`.
- Verify: `cd server && pnpm typecheck && pnpm test -- eval-contracts contracts`; `cd client && pnpm typecheck` → green.
- Done when: both copies are identical, no `EvalOwnerKind`/`EvalPerTrace` symbol remains (`grep -rnE "EvalOwnerKind|EvalPerTrace" server/src client/src` → empty), and both typechecks are green.

### Step 2 — Schema + migrations (Group S, chunk S1)
- Covers: AC-33, AC-50 (storage), NFR-5 (count query), B1 guard, B2
- Files: modify `server/src/db/schema/eval.ts`, `server/src/db/rows.ts`; generated `server/src/db/migrations/0017_drop_reserved_eval.sql`, `0018_eval_pipeline.sql` + `meta/*` (generated only).
- Skills: postgresql-table-design §Constraints, §Indexing, §JSONB Guidance; drizzle-orm-patterns §Constraints and Warnings.
- Change:
  - (a) Delete `evalCases`/`evalRuns` from `schema/eval.ts` and from `schema.ts` re-exports (lines 44, 83-84). Run `pnpm db:generate --name drop_reserved_eval` and check the SQL is DROP-only.
  - (b) Add the tables below to `schema/eval.ts`, re-export them from `schema.ts`, then run `pnpm db:generate --name eval_pipeline` and check the SQL is CREATE-only, with no prompt answered.
    - `evalCases`:
      - `id` uuid pk; `workspaceId` FK cascade; `agentId` FK → agents cascade; `name` text NN;
      - `expectationType` text enum NN; `expected` jsonb NN; `inputDiff` text NN; `inputMeta` jsonb NN;
      - `sourceFindingId` uuid NULL (no FK: EC-5); `sourceDecision` text enum NULL;
      - `lastResult` jsonb NULL; `createdAt`, `updatedAt` timestamptz;
      - `uniqueIndex(agentId, name)`; `uniqueIndex(agentId, sourceFindingId)` (NULLs distinct on purpose: hand-made cases have null); `index(workspaceId)`.
    - `evalRuns`:
      - `id`; `workspaceId` FK cascade; `agentId` FK cascade; `agentVersion` int NN;
      - `status` text enum NN default 'running'; `error` text;
      - `startedAt` timestamptz NN default now; `finishedAt`;
      - `config` jsonb NN (`EvalRunConfig` + `source` per skill);
      - `casesDone`, `total`, `passed`, `errored` int NN default 0;
      - `recall`, `precision`, `citationAccuracy`, `costUsd` double precision NULL; `durationMs` int NULL;
      - `llmCalls`, `tokensIn`, `tokensOut` int NN default 0 (for the NFR-6 log line);
      - `index(agentId, startedAt desc)`; `index(workspaceId, status, startedAt desc)`;
      - `uniqueIndex('eval_runs_one_running_per_agent').on(agentId).where(sql\`status = 'running'\`)`.
    - `evalCaseResults`:
      - `id`; `runId` FK → evalRuns cascade NN; `caseId` uuid FK → evalCases SET NULL NULL; `caseName` text NN;
      - `result` jsonb NN (the `EvalCaseResult`); `status` text NN (for the AC-79 "started failing" lookups);
      - `index(runId)`; `index(caseId)`.
  - Add `EvalCaseRow`, `EvalRunRow` and `EvalCaseResultRow` to `rows.ts`.
- Verify: `cd server && pnpm typecheck && pnpm db:migrate` (on the local DB) and `git diff --stat server/src/db/migrations/meta/_journal.json` → only 2 appended entries.
- Done when: 2 new migration files, the journal only grew, and `pnpm typecheck` is green.

### Step 3 — Pure domain: scoring, slug, diff fragment, validation (Group S, chunk S1)
- Covers: AC-7, AC-10 (rule), AC-14 (rule), AC-27 (rules), AC-51…AC-60, EC-14, EC-15, EC-16, NFR-1 (scoring has no LLM), NFR-4
- Files: create `server/src/modules/eval/constants.ts`, `helpers.ts`, `scoring.ts`, `server/test/eval-scoring.test.ts`, `server/test/eval-frozen-input.test.ts`.
- Skills: onion-architecture — domain ring, no imports of adapters/db/container (`onion-architecture/SKILL.md` §Step 1 table "Domain"); zod — `safeParse` + `issue.path` (`zod/SKILL.md` §Quick Reference 2, 4).
- Change:
  - `constants.ts`: `MAX_DIFF_BYTES = 200*1024`, `MAX_CASES_PER_AGENT = 50`, `CASE_TIMEOUT_MS = 120_000`, `RUN_LIST_LIMIT = 100`, `RECENT_RUNS = 6`, `TREND_POINTS = 10`, `RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, all: null }`.
  - `scoring.ts` (pure, no imports beyond types):
    - `matches(finding, item)` (AC-51);
    - `scoreCase(type, items, kept, droppedCount)` → `{ status, expectedCount, matchedCount, tp, fp, kept, dropped }` (AC-52, AC-53, AC-20 "m");
    - `scoreRun(caseScores)` → `{ recall, precision, citationAccuracy, passed, total, errored, costUsd }` with errored cases excluded (AC-54…AC-59). A null denominator gives null. Cost is null if any non-errored case has null cost.
  - `helpers.ts`:
    - `caseNameFor(decision, title, existingNames)` (AC-7; slug: lower-case, `/[^a-z0-9]+/g → '-'`, trim `-`, `.slice(0,34)`, then trim a trailing `-` again only if the spec's order allows; follow the AC literally: replace → trim → cut);
    - `fileDiffFragment(path, patch)` (`diff --git a/p b/p`, `--- a/p`, `+++ b/p`, patch; mirrors `reviews/diff-loader.ts:35-44`);
    - `rangeHasNewLine(diff: UnifiedDiff, file, start, end)` (AC-10);
    - `validateCaseInput(input, diff: UnifiedDiff | null)` → `{ field, message } | null` (AC-27 rules in the spec order; byte size via a `byteLength` argument so helpers stay pure);
    - `rangeStart(range, now)` (Date | null);
    - row→DTO `toCaseDto`, `toRunRecordDto`, `toRunDetailDto` (row types via `import type`).
  - Tests:
    - `eval-scoring.test.ts`: EC-14 worked example exactly (A pass 1/1, B fail 1; recall 1, precision 0.5, citation 0.75, passed 1/2); EC-15; EC-16; one finding matching two items counts once; inclusive range edges (`end == start`); cost null rule (AC-59).
    - `eval-frozen-input.test.ts`: `fileDiffFragment` headers (AC-6 shape); slug cases including a `-2` suffix and the 34-char cut (AC-7); `rangeHasNewLine` true/false (AC-10, EC-3); each AC-27 rule names its field; the 200 KB boundary (AC-14, NFR-4).
- Verify: `cd server && pnpm test -- eval-scoring eval-frozen-input` → green; `pnpm arch` → green.
- Done when: every AC-51…AC-59 case above passes, and `scoring.ts` has no import except `import type`.

### Step 4 — Repository, case service and case routes (Group S, chunk S2)
- Covers: AC-4, AC-5, AC-6, AC-8, AC-10, AC-11, AC-12, AC-13, AC-14, AC-27, AC-28, AC-33, AC-34, AC-35 (server: type ignored on update), EC-1, EC-4, EC-5, EC-6, EC-7, NFR-4, NFR-5, NFR-9
- Files: create `server/src/modules/eval/repository.ts`, `service.ts`, `routes.ts`; modify `server/src/modules/index.ts` (register `eval`); create `server/test/eval.it.test.ts`.
- Skills: onion-architecture (§Step 2 "Every table has one owning module", "Every list query is bounded"; §Red flags "workspaceId in the SQL where"); fastify-best-practices (`rules/routes.md`, `rules/error-handling.md`, `rules/testing.md`); drizzle-orm-patterns (§Constraints and Warnings); security §A01.
- Change:
  - `EvalRepository(db)` (scoped `where workspace_id = $ws` in every query):
    - `findingForCase(ws, findingId)`: read-only join of findings → reviews (`agentId`) → pull_requests (title, body, workspaceId) → the `pr_files.patch` for `finding.file`;
    - `listCases(ws, agentId)` ordered by name, `.limit(MAX_CASES_PER_AGENT)`; `countCases`; `getCase`; `caseBySourceFinding(agentId, findingId)`; `insertCase` (returns null on unique violation of `(agent_id, source_finding_id)` → re-read for EC-1, and maps `(agent_id, name)` to `duplicate_case_name`); `updateCase`; `deleteCase`; `setLastResult`.
  - `EvalService`:
    - `createFromFinding(ws, findingId)`, in this order: 404 `not_found` (AC-12); 409 `finding_undecided` (AC-13); review agent → `container.agentsRepo.getById(ws, agentId)`, missing → 409 `agent_missing` (AC-11); existing case by source finding → `{created:false}` (AC-8, EC-4); no patch, or `rangeHasNewLine` false → 409 `finding_not_in_diff` (AC-10); `byteLength > MAX` → 422 `case_input_too_large` (AC-14); `count ≥ 50` → 409 `case_limit_reached` (EC-7); name via `caseNameFor` (AC-7); the type comes from `accepted_at`/`dismissed_at` (AC-4, AC-5); the item copies file, lines, severity, category and title; `input_meta` = PR title and body cut to 300 / 10 000.
    - `createCase`/`updateCase(ws, …, body: unknown)`: `EvalCaseInput.safeParse` → 400 `invalid_eval_case` `{field}`; `parseUnifiedDiff(input_diff)` then `validateCaseInput`; duplicate name → 409 `duplicate_case_name` (AC-28); update keeps the stored `expectation_type` (AC-35), and sets `last_result = null` when diff, meta or expected changed (AC-34).
    - `deleteCase` (AC-33: past `eval_case_results` keep `case_name`; the FK sets `case_id` null).
  - Routes (thin, `getContext` → service; `IdParams` on every `:id`; NO `schema.body` on case create/update, see Requirements review):
    - `POST /findings/:id/eval-case` (201 / 200);
    - `GET /agents/:id/eval-cases`; `POST /agents/:id/eval-cases` (201); `PUT /eval-cases/:id`; `DELETE /eval-cases/:id` (204).
  - `eval.it.test.ts` header:
    - `hasDocker`;
    - `if (!hasDocker && process.env.EVAL_REQUIRE_DOCKER) throw new Error('verify:l06 requires Docker')`;
    - `startPg` + `seed`;
    - `buildApp` with `overrides: { git, github, llm: { openai, anthropic, openrouter: MockLLMProvider } }`.
  - It cases:
    - AC-4/5 (create from an accepted and a dismissed finding inserted into the seeded review);
    - AC-6 (delete the PR's `pr_files` and the PR after creation → case input unchanged; EC-5);
    - AC-8/EC-1 (two parallel POSTs → one case);
    - AC-10, AC-11, AC-12 (incl. a finding of a second workspace inserted directly → 404, NFR-9), AC-13, AC-14 (2-file 210 KB patch);
    - AC-27 (one per rule → 400 + field);
    - AC-28 + EC-6;
    - EC-7 (50 cases → 409);
    - AC-33, AC-34.
- Verify: `cd server && pnpm test -- eval.it` (Docker) → green; `pnpm arch` → green.
- Done when: all listed it cases pass, and every route answers 404 for an id from another workspace.

### Step 5 — Executor: snapshot, run one case, suite run, single-case run (Group S, chunk S3)
- Covers: AC-30, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42, AC-43, AC-44, AC-46, AC-50, EC-8, EC-9, EC-10, EC-11, EC-13 (server), NFR-1, NFR-3, NFR-6
- Files: create `server/src/modules/eval/executor.ts`, `server/src/modules/agents/index.ts` (export `AgentsService`); modify `server/src/modules/reviews/index.ts` (add `skillPromptBlocks`), `eval/service.ts`, `eval/repository.ts`, `eval/routes.ts`, `server/src/server.ts`; create `server/test/eval-executor.test.ts`; extend `eval.it.test.ts`.
- Skills: onion-architecture §Transactions ("a loop of external side effects: persist each item right after its call"), §Step 2 (cross-module via `index.ts`); fastify-best-practices `rules/routes.md` (202); security §Agentic AI Security.
- Change:
  - `executor.ts`:
    - `buildSnapshot(agent, links)` → config with only links where `link.enabled && skill.enabled` (AC-37), `{skill_id,name,version,body,source}`.
    - `runCase({ snapshot, evalCase, llm, review = reviewPullRequest, timeoutMs = CASE_TIMEOUT_MS, now })`:
      - calls `review({ systemPrompt, model, strategy, skills: skillPromptBlocks(snapshot skills as links), diff: parseUnifiedDiff(case.input_diff), prDescription, task, llm, checkCancelled })` and passes NOTHING else (AC-38);
      - races a 120 s timer → error `"timed out after 120 s"` (AC-40, NFR-3);
      - any throw → `status:'error'` with `error: message`;
      - on success it scores with `scoreCase` (AC-39) and returns an `EvalCaseResult` plus `{tokensIn,tokensOut,llmCalls: outcome.chunks.length}`.
    - `runSuite(runId, snapshot, cases, llm, repo, log)`:
      - for each case: `runCase` → insert an `eval_case_results` row + `setLastResult` + increment `cases_done` (one small write per case, no wrapping tx);
      - after the loop: `scoreRun` → write the metrics, then status `done`, or `failed` with "all cases errored" (AC-41, EC-10) in the SAME final update, with the status column written last (no other later write);
      - logs one line per NFR-6 with all fields;
      - an unexpected throw outside a case → `failed` with its message.
  - Service:
    - `startRun(ws, agentId)`: agent 404 → `count = 0` → 409 `no_eval_cases` (AC-43) → `container.llm(agent.provider)`, where a `ConfigError` matching `API_KEY` (`classifyLlmError`, `platform/llm-errors.ts:14`) → 400 `no_api_key` (AC-44, zero calls) → snapshot (agent row + `container.agentsRepo.linkedSkills`) → insert the run with `status running`, `total = cases`, where a `23505` on `eval_runs_one_running_per_agent` → 409 `eval_run_in_progress` (AC-42) → `void executor.runSuite(...)` → return the record (202, AC-36).
    - `runOneCase(ws, caseId)`: case 404 → a running suite for the agent → 409 (AC-42, EC-8) → key check → snapshot of the current agent (not stored) → `runCase` → `setLastResult` → return the result (AC-30).
    - `reapInterrupted()` → `UPDATE eval_runs SET status='failed', error='interrupted by server restart', finished_at=now() WHERE status='running'` (AC-46).
  - `server.ts`: call `new EvalService(app.container).reapInterrupted()` next to the review reaper (`server/src/server.ts:16-21`).
  - Routes: `POST /agents/:id/eval-runs` (202); `POST /eval-cases/:id/run`.
  - AC-50: covered by the FK cascades; the it-test deletes an agent and counts rows.
  - `eval-executor.test.ts` (unit, spy `review`):
    - AC-38: the spy receives exactly the allowed keys (no `intent`, `repoMap`, `callers`, `specs` or `memory`), and the skills are only the snapshot's;
    - AC-40: a review that rejects → error and the next case still runs; a never-resolving review with `vi.useFakeTimers()` → error "timed out" after 120 s;
    - NFR-3: the spy is called once per case;
    - AC-41 ordering: a fake repo records the call order, and the status write comes after every result write;
    - NFR-1: `scoreRun`/`scoreCase` run with no LLM (the spy count is unchanged by scoring);
    - NFR-6: the logger spy receives one line with every field.
  - It extensions:
    - AC-36 (202 before any case finishes: `MockLLMProvider` behind a gate promise);
    - AC-37/EC-9 (edit the agent and a skill body mid-run → the stored config is unchanged and the cases used it);
    - AC-39;
    - AC-41 (poll until done; the metrics match EC-14 when the mock returns those findings);
    - AC-42 (second start → 409; single-case during the suite → 409);
    - AC-43; AC-44 (an `overrides.secrets` returning undefined → 400, and the mock's `calls.length` stays 0);
    - AC-46 (insert a running row → `reapInterrupted` → failed + reason);
    - AC-30 (single-case run → `last_result` set, the run list is unchanged);
    - AC-50.
- Verify: `cd server && pnpm test -- eval-executor eval.it` → green; `pnpm arch` → green.
- Done when: the tests above pass, and `routes-smoke.test.ts` stays green (no DB access in `buildApp`).

### Step 6 — Read endpoints, run-all, promote (Group S, chunk S3)
- Covers: AC-47, AC-61 (server), AC-69 (server), AC-70, AC-72/73 (data), EC-12, EC-19, NFR-2 (query shape), NFR-9
- Files: modify `eval/service.ts`, `eval/repository.ts`, `eval/routes.ts`; extend `eval.it.test.ts`.
- Skills: onion-architecture §Step 2 ("Every list query is bounded, in SQL", agents writes via the owner); security §A01; drizzle-orm-patterns §Best Practices 8.
- Change:
  - `GET /agents/:id/eval-runs?range=` → querystring `z.object({ range: EvalRange.default('30d') })`. An unknown value → 400 `invalid_range`: this route also needs the code; parse in the service with `safeParse` and throw an `AppError`. Newest first, `.limit(100)`, filtered by `started_at >= rangeStart` (AC-61).
  - `GET /eval-runs/:id` → `EvalRunDetail` (config without `source`, results ordered by case name).
  - `POST /eval/run-all` → for every workspace agent: skip disabled → `disabled`, no cases → `no_eval_cases`, no key → `no_api_key`, a 23505 on insert → `eval_run_in_progress`; otherwise start. Returns 202 `{started, skipped}` (AC-47, EC-12).
  - `POST /eval-runs/:id/promote`: run 404 (scoped) → status ≠ done → 409 `run_not_done` → snapshot provider, model, system_prompt and strategy equal to the agent's current values → 409 `already_current` (AC-70, EC-19) → `new AgentsService(container).update(ws, agentId, { provider, model, system_prompt, strategy })` (bumps the version; skills untouched, AC-69 / OQ-2) → returns `Agent`.
  - `GET /eval/dashboard`:
    - agents with `case_count` (one grouped count query);
    - latest done run per agent and the last 10 done recalls (one window-function query: `row_number() over (partition by agent_id order by started_at desc) <= 10` over `status='done'`);
    - the 6 newest done workspace runs joined with the agent name. That is three queries in total: no N+1, keeping NFR-2.
  - It cases:
    - range filter (insert runs at now−10d and −40d; 7d/30d/all counts) + `invalid_range`;
    - run detail 404 cross-workspace;
    - run-all with a disabled agent, an empty agent, a busy agent and a ready one;
    - promote: happy path (version +1, skills unchanged), `already_current`, `run_not_done`;
    - dashboard shape (`recall_trend` ≤ 10, `recent_runs` ≤ 6, done only).
- Verify: `cd server && pnpm test -- eval.it && pnpm arch && pnpm typecheck` → green.
- Done when: every endpoint in the spec §Contracts exists and responds with its contract, and the it cases pass.

### Step 7 — Seed cases + `verify:l06` (Group S, chunk S4)
- Covers: AC-82, AC-83, EC-22, OQ-1
- Files: create `server/src/db/seed-evals.ts`; modify `server/src/db/seed.ts` (call `seedEvals(db, workspaceId)` after the agents are seeded), `server/package.json`; extend `eval.it.test.ts`.
- Skills: drizzle-orm-patterns §Constraints and Warnings (`onConflictDoNothing`); onion-architecture §Step 2.
- Change:
  - OQ-1 resolution: the seeded PRs do not suffice. #483 is a refund service plus its tests and #484 scopes a list query; neither has 5 security hunks. The #482 findings have no stored patch to freeze (`server/src/db/seed.ts:149-230`). So write 8 self-contained fixtures for the "Security Reviewer" agent, each a small valid unified diff (with `diff --git`/`---`/`+++` headers) in a domain no skill example uses (`server/INSIGHTS.md:198-202`), e.g. an `inventory-service`:
    - must_find ×5: hard-coded API secret; SQL built by string concatenation; SSRF fetch of a user-supplied URL; `child_process.exec` with request input; JWT verified with `algorithms: ['none']`/`ignoreExpiration`;
    - must_not_flag ×3: secret read from `process.env`; parameterized query; obviously fake key in a test fixture.
  - Each item's lines must fall in the hunk's new-side lines. Validate each fixture with `validateCaseInput` in the it-test.
  - Insert with `onConflictDoNothing()` on `(agent_id, name)` (EC-22). `source_finding_id` and `source_decision` are null.
  - `package.json`: `"verify:l06": "EVAL_REQUIRE_DOCKER=1 vitest run test/eval-scoring.test.ts test/eval-frozen-input.test.ts test/eval-executor.test.ts test/eval-contracts.test.ts test/eval.it.test.ts"`.
  - It: seed twice → the Security Reviewer has exactly 8 cases, ≥5 `must_find`, ≥3 `must_not_flag`; every fixture passes `validateCaseInput`.
- Verify: `cd server && pnpm verify:l06; echo $?` → 0 with Docker up. With Docker stopped, it must be non-zero (manual AC-83 check).
- Done when: AC-82 it passes and `pnpm verify:l06` exits 0.

### Step 8 — Client data layer, shared helpers, toast link, Modal a11y, nav (Group C, chunk C1)
- Covers: AC-49, AC-71, NFR-7 (namespace), NFR-8 (modal focus), plus the helpers AC-16, AC-20, AC-57, AC-58, AC-59 display formats
- Files:
  - create `client/src/lib/api/eval.ts`, `client/src/lib/eval.ts`, `client/src/lib/eval.test.ts`;
  - modify `client/src/lib/toast.tsx`, `client/src/vendor/ui/kit/Modal.tsx`, `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/nav.test.ts`, `client/.dependency-cruiser.cjs` (add `eval` to both route regex lists at lines 52-56);
  - rewrite `client/messages/en/eval.json` (drop the unused starter keys; add `common`, `finding`, `toast` and `errors` groups).
- Skills: frontend-ui-architecture §Step 1 "Data access" (one module per resource, exported keys) and "Domain rule" (`lib/eval.ts`, no React); react-best-practices §Accessibility (focus trap, Escape); `client/INSIGHTS.md:464-468`.
- Change:
  - `lib/api/eval.ts`:
    - `evalKeys`;
    - `useEvalCases(agentId)`, `useCreateEvalCase`, `useUpdateEvalCase`, `useDeleteEvalCase`, `useRunEvalCase`, `useCaseFromFinding`;
    - `useStartEvalRun(agentId)`, `useRunAllEvals`, `useEvalRuns(agentId, range)` with `refetchInterval: (q) => q.state.data?.some(r => r.status === 'running') ? 2000 : false` (AC-45), `useEvalRun(id)`, `usePromoteRun`, `useEvalDashboard`;
    - every response parsed with the contract schema;
    - run-start/run-all/from-finding mutations get `onError` in the hook definition with `meta: { silentError: true }`, mapping error codes to `eval.errors.*` copy (EC-2, AC-11, AC-14, EC-7 toasts) and falling back to the server message (AC-49);
    - success handlers invalidate `evalKeys` + `agentKeys` (promote).
  - `lib/eval.ts` (pure): `pct(v)` → "—" for null; `deltaPt(a,b)` → `{ dir, n } | null` (rounded points, null if either value is null); `fmtCost`; `passLabel(run)` ("{passed}/{total}" + errored); `resultLine(result)` (AC-20 parts); `latestDone(runs)`/`previousDone(runs)`.
  - `toast.tsx`: `success(message, action?: { label: string; href: string })` renders a `next/link` inside an `aria-live="polite"` container.
  - `Modal.tsx`: mirror `Drawer.tsx:21-43`: focus the dialog on mount, give focus back to the opener on unmount, Escape → `onClose`, Tab/Shift+Tab wrap within the dialog, and the close button gets an `aria-label`.
  - `nav.ts`: add `{ key: "eval", label: "Eval Dashboard", icon: <an existing IconName, e.g. "BarChart3" if present in icons.tsx>, href: "/eval" }` to SKILLS LAB. The label is already translated (`messages/en/shell.json` nav.eval) and `activeKeyFor` already maps `/eval` (`components/app-shell/helpers.ts:35`).
- Verify: `cd client && pnpm test -- lib/eval nav Modal && pnpm typecheck && pnpm arch` → green.
- Done when: the helper tests pass (null → "—", ▲/▼ rounding, errored suffix, cost "$0.00"/"—"), the nav test shows the Eval Dashboard entry under SKILLS LAB (AC-71), and a Modal test proves focus moves in, Escape closes it and focus returns.

### Step 9 — FindingCard "Turn into eval case" (Group C, chunk C1)
- Covers: AC-1, AC-2, AC-3, AC-9, EC-1 (client: the button is disabled while pending), EC-2 (toast copy)
- Files: create `FindingCard/EvalCaseButton.tsx` (+ `EvalCaseButton.test.tsx`); modify `FindingCard/FindingCard.tsx` (render it in `s.actions`).
- Skills: frontend-ui-architecture §Step 3 (split by responsibility: the button owns its mutation); react-testing-library §Query Priority.
- Change:
  - Enabled iff `accepted_at || dismissed_at`, with the tooltip copy of AC-1/2/3 (`title` + `aria-describedby`).
  - Click → `useCaseFromFinding().mutate(f.id)`, disabled while pending.
  - On success: `toast.success(created ? "Eval case created" : "Eval case already exists", { label: "Open in Evals tab", href: \`/agents/${case.agent_id}?tab=evals\` })`.
  - Copy comes from `useTranslations("eval")`.
- Verify: `cd client && pnpm test -- EvalCaseButton FindingCard` → green.
- Done when: the tests pin the three tooltip and enabled states and both toast texts with the link href (`useCaseFromFinding` mocked).

### Step 10 — Evals tab in the agent editor (Group C, chunk C2)
- Covers: AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-33 (client confirm), AC-45, EC-13, NFR-8 (row icons and labels)
- Files: modify `AgentEditor/constants.ts` (TABS + `{ key: "evals", ns: "eval", labelKey: "tab.label" }` after context), `AgentEditor/AgentEditor.tsx`, `AgentEditor/AgentEditor.test.tsx`, `AgentEditorView/AgentEditorView.tsx` (`VALID_TABS` + "evals"), `AgentEditorView/AgentEditorView.test.tsx`; create `AgentEditor/_components/EvalsTab/{EvalsTab.tsx,EvalCaseRow.tsx,EvalMetricStrip.tsx,styles.ts,index.ts,EvalsTab.test.tsx}`; append to `eval.json`.
- Skills: frontend-ui-architecture §Step 2 (single consumer → colocated, like `ConfigTab`); react-best-practices §Derive, Don't Store, §Accessibility; `client/INSIGHTS.md:399-403`.
- Change:
  - Design reference: `docs/designs/extracted/agent-evals-tab.jsx` (`EvalsTab`, `EvalMetricStrip`, `EvalCaseRow`).
  - Tiles come from `useEvalRuns(agentId,'all')`: the latest and previous done runs, `pct`/`deltaPt`, "Traces passed x/y", "No eval runs yet" (AC-16).
  - "View full dashboard →" goes to `/eval/${agentId}` (AC-17). The fixed note implements AC-18.
  - Header badges: passing / ran is computed from `last_result` (AC-19).
  - Rows (AC-20): the status icon has `aria-label` pass/fail/error/never run; the chip comes from the first item; Run calls `useRunEvalCase`; Edit opens the modal (Step 11); Delete opens `ConfirmModal` with the AC-33 text. Icon buttons carry `aria-label`.
  - The empty state implements AC-21.
  - "Run all evals" calls `useStartEvalRun`. It is disabled with the tooltip "Add an eval case first" when there are no cases (EC-13), and shows "Running… {done}/{total} cases" while a run is running (AC-45).
  - Render all LLM and user text as plain text.
- Verify: `cd client && pnpm test -- EvalsTab AgentEditor AgentEditorView` → green.
- Done when: `AgentEditorView` with `?tab=evals` renders the Evals tab (regression for the INSIGHTS entry), and the tests cover AC-16 (incl. null "—"), AC-19, AC-20 for each status and both types, AC-21, AC-45 and EC-13.

### Step 11 — Eval case modal (Group C, chunk C2)
- Covers: AC-22, AC-23, AC-24, AC-25, AC-26, AC-27 (client field errors + a client mirror of the rules for instant feedback), AC-28 (inline), AC-29, AC-31, AC-32, AC-35, NFR-8 (focus via Modal)
- Files: create `AgentEditor/_components/EvalCaseModal/{EvalCaseModal.tsx,helpers.ts,styles.ts,index.ts,EvalCaseModal.test.tsx,helpers.test.ts}`; modify `EvalsTab.tsx` (open the modal); append to `eval.json`.
- Skills: react-best-practices §State Hygiene (`useReducer` for form state), §Accessibility (`aria-invalid` + `aria-describedby` for field errors); zod `safeParse` of `EvalExpectationItem.array()` for the JSON editor (`zod/SKILL.md` §Quick Reference 2).
- Change:
  - Design reference: `docs/designs/extracted/eval-case-editor.jsx` and `finding-eval-seed.jsx`.
  - `helpers.ts`: `filesInDiff(text)`, `fileSection(text, path)` (AC-24), `firstNewLine(text)` and `appendSkeleton(json, text)` (AC-26), `isJsonArray(text)` (AC-25), `seededBanner(case)` (AC-23).
  - Type selector: tertiary buttons, read-only for existing cases (AC-35).
  - "Run on save" defaults to on and runs `useRunEvalCase` after a successful save (AC-29).
  - Run case is disabled with "Save the case first" while the form is dirty (AC-32).
  - The last-result line implements AC-31.
  - A server 400 `invalid_eval_case` `details.field` is shown under that field. 409 `duplicate_case_name` shows the AC-28 text under Name.
  - Plain-text rendering everywhere (`<pre>` for diff sections).
- Verify: `cd client && pnpm test -- EvalCaseModal` → green.
- Done when: the tests cover every AC listed above (mocked hooks), including the skeleton line numbers on a 2-file diff.

### Step 12 — Eval Dashboard overview `/eval` (Group C, chunk C3)
- Covers: AC-48, AC-72, AC-73, AC-74, EC-12 (toast), NFR-1 (no LLM: reads only)
- Files: create `client/src/app/(shell)/eval/page.tsx`, `eval/_components/EvalDashboardView/{EvalDashboardView.tsx,AgentRow.tsx,RecentRunsTable.tsx,styles.ts,index.ts,EvalDashboardView.test.tsx}`; append to `eval.json`.
- Skills: next-best-practices §RSC Boundaries (a thin page renders the client view); frontend-ui-architecture §Step 2.
- Change:
  - Design reference: `docs/designs/extracted/eval-dashboard.jsx` `AgentEvalOverview`.
  - Data comes from `useEvalDashboard`. Rows have a model chip, "Last run v{N} · {date} · {passed}/{total} pass", `Sparkline` of `recall_trend`, percentages and a chevron, and the whole row is a link to `/eval/{id}` (AC-72).
  - The recent table uses `BarRow`-style bars (AC-73). The empty state implements AC-74.
  - "Run all agents" → `useRunAllEvals`, then a success toast "Started {n} eval run(s) · skipped {m}" (ICU plural, AC-48).
  - `ShellCrumb`: "Skills Lab › Eval Dashboard".
- Verify: `cd client && pnpm test -- EvalDashboardView` → green.
- Done when: the tests cover AC-72, AC-73, AC-74 and AC-48 with mocked hooks.

### Step 13 — Agent eval detail page `/eval/[agentId]` (Group C, chunk C3)
- Covers: AC-61, AC-62, AC-63, AC-75, AC-76, AC-77, AC-78, AC-79, AC-80, AC-81, EC-20, EC-21, NFR-8 (labelled checkboxes)
- Files: create `client/src/app/(shell)/eval/[agentId]/page.tsx`, `eval/[agentId]/_components/EvalAgentDetailView/{EvalAgentDetailView.tsx,helpers.ts,styles.ts,index.ts,EvalAgentDetailView.test.tsx,helpers.test.ts}`, `RunHistoryTable/{RunHistoryTable.tsx,styles.ts,index.ts,RunHistoryTable.test.tsx}`, `RegressionBanner/{RegressionBanner.tsx,helpers.ts,index.ts,RegressionBanner.test.tsx}`; append to `eval.json`.
- Skills: react-best-practices §State Hygiene (range in the URL); security "Untrusted inputs" `range` → fall back to `30d` (`EvalRange.safeParse`); react-testing-library §Query Priority.
- Change:
  - Design reference: `eval-dashboard.jsx` `ScreenEval`.
  - The range comes from `?range`, and an invalid value falls back to `30d` (AC-76). Changing it calls `router.replace`.
  - `useEvalRuns(agentId, range)` and `useAgent(agentId)`. A 404 shows "Agent not found" plus a link to `/eval` (AC-81).
  - Header, breadcrumb, agent dropdown and "Run eval" implement AC-75.
  - Tiles via `MetricCard` if its delta rendering can show "▲ Npt"; otherwise a local tile built from `lib/eval` (AC-77).
  - `LineChart` series recall, precision and citation over done runs in time order (AC-78), with the empty state of AC-80.
  - `RunHistoryTable` (AC-61, AC-62, AC-63):
    - columns per AC-61;
    - a `failed` row shows the reason text and no checkbox;
    - checkboxes labelled "Select run v{N} {date}";
    - selection keeps the 2 newest clicks;
    - Compare is enabled only with exactly 2 done runs selected, with the hint otherwise.
  - `RegressionBanner/helpers.ts` `bannerSentences(latest, prev, latestDetail, prevDetail)`:
    - rounded deltas give "{Metric} dropped {n}pt on v{B} vs v{A}." and "{Metric} up {n}pt.";
    - "Started failing: …" lists case names whose prev result was pass and latest is fail (from both run details: two `useEvalRun` calls, only when ≥2 done runs exist);
    - the banner shows only if at least one metric dropped by ≥1pt (AC-79).
  - Test EC-21 verbatim and EC-20 (single run: no delta, no banner).
- Verify: `cd client && pnpm test -- EvalAgentDetailView RunHistoryTable RegressionBanner` → green.
- Done when: the tests cover the listed ACs, and an invalid `?range=xx` renders as 30 days.

### Step 14 — Compare modal + Promote (Group C, chunk C4)
- Covers: AC-64, AC-65, AC-66, AC-67, AC-68, AC-69 (client), EC-17, EC-18, EC-19 (client), NFR-1, NFR-8 (strike-through + colour)
- Files: create `eval/[agentId]/_components/CompareModal/{CompareModal.tsx,helpers.ts,styles.ts,index.ts,CompareModal.test.tsx,helpers.test.ts}`; modify `EvalAgentDetailView.tsx` (open it); append to `eval.json`.
- Skills: security §A05 Cross-Site Scripting (prompt diff as text spans, never HTML); react-best-practices §Derive, Don't Store.
- Change:
  - Design reference: `eval-dashboard.jsx` `RunCompare`.
  - `helpers.ts`:
    - `wordDiff(a, b)`: LCS over `split(/(\s+)/)` tokens → `{ op: 'same'|'add'|'del', text }[]` (B4);
    - `configDiffLines(cfgA, cfgB)` → AC-66 strings (Model, Provider, Strategy, skills added, removed or changed by `skill_id` + version/body);
    - `caseSetNote(resultsA, resultsB)` → common count + only-A/only-B by `case_id ?? case_name` (AC-67, EC-18);
    - `isCurrent(runConfig, agent)` (AC-68).
  - Both runs come from `useEvalRun`. A is the older run by `started_at`.
  - Tiles (old → new + ▲/▼, null → "—"), with the cost delta as "$x.xx" (AC-64).
  - The diff legend and the "No system prompt change" state implement AC-65. Deletions use `<del>` (strike-through) plus the removed background.
  - "Promote v{B}" is disabled with the AC-68 tooltip. Otherwise `ConfirmModal` shows the AC-69 text → `usePromoteRun` → toast "Promoted v{B} as v{new}".
- Verify: `cd client && pnpm test -- CompareModal && pnpm typecheck && pnpm arch && pnpm test` → green.
- Done when:
  - `helpers.test` pins the word diff (add, del and identical cases), EC-17 ("No system prompt change" + "Skill changed: x v1 → v2"), EC-18, and each AC-66 line;
  - the component test covers the AC-64 title and subtitle, AC-68 disabled, and the AC-69 confirm text and toast.

## Test plan
- New and changed tests. Owner: the **implementer** for all of them (inline: test first, seen red, then code).
  - **Server unit:**
    - `eval-contracts.test.ts` (NFR-10; Step 1);
    - `eval-scoring.test.ts` (AC-51…AC-60, EC-14, EC-15, EC-16, NFR-1; Step 3);
    - `eval-frozen-input.test.ts` (AC-6 shape, AC-7, AC-10 rule, AC-14, AC-27 rules, NFR-4; Step 3);
    - `eval-executor.test.ts` (AC-38, AC-40, AC-41 ordering, NFR-1, NFR-3, NFR-6; Step 5);
    - `contracts.test.ts` updated (Step 1).
  - **Server it** — `eval.it.test.ts`:
    - AC-4, AC-5, AC-6, AC-8, AC-10, AC-11, AC-12, AC-13, AC-14, AC-27, AC-28, AC-30, AC-33, AC-34;
    - AC-36, AC-37, AC-39, AC-41, AC-42, AC-43, AC-44, AC-46, AC-47, AC-50;
    - AC-61 (server range), AC-69, AC-70, AC-82;
    - EC-1, EC-5, EC-6, EC-7, EC-8, EC-9, EC-10, EC-12, EC-19, EC-22;
    - NFR-4, NFR-5, NFR-9;
    - Steps 4–7.
  - **Client unit:**
    - `lib/eval.test.ts`, `nav.test.ts`, Modal focus test (Step 8);
    - `EvalCaseButton.test.tsx` (Step 9);
    - `EvalsTab.test.tsx` + `AgentEditorView.test.tsx` `?tab=evals` (Step 10);
    - `EvalCaseModal.test.tsx` + `helpers.test.ts` (Step 11);
    - `EvalDashboardView.test.tsx` (Step 12);
    - `EvalAgentDetailView`, `RunHistoryTable`, `RegressionBanner` tests (Step 13);
    - `CompareModal` tests (Step 14).
  - Layers follow each `[verify:]` tag. AC-27 and AC-69 have both `it` and `unit` → both layers are covered. NFR-1 `unit, it` → the executor unit test plus AC-44 it (zero calls). NFR-8 `unit, manual` → labels and focus in unit tests, plus the manual keyboard walk.
- **Manual:**
  - AC-83: `cd server && pnpm verify:l06; echo $?` → 0 with Docker up, non-zero with Docker stopped.
  - NFR-2: seed 20 agents × 50 cases × 100 runs locally (an ad-hoc script in the scratchpad, not committed) and time `GET /agents/:id/eval-cases`, `/agents/:id/eval-runs?range=all`, `/eval-runs/:id` and `/eval/dashboard` with `curl -w '%{time_total}'` ×20 → p95 < 0.5 s.
  - NFR-8: a keyboard-only walk through the Evals tab, case modal, dashboard and Compare.
  - NFR-11: two suite runs of the seeded Security Reviewer with different prompts, plus one deliberately broken prompt with lower precision → Compare screenshot + screencast.
- Commands per module (pnpm in both): `cd server && pnpm typecheck && pnpm test && pnpm arch && pnpm verify:l06`; `cd client && pnpm typecheck && pnpm test && pnpm arch`. reviewer-core is unchanged, so no command is needed.
- Docker needed: yes (server it + `verify:l06`).
- e2e (`npm run e2e:hermetic`): **not required**. The spec excludes an e2e flow for evals (Non-goals). The client changes to `Modal`, `toast` and `nav` are covered by unit tests. Run the existing e2e suite once at the end as a regression check only if the user wants it (it shares `client/.next`; stop `next dev` first, `client/INSIGHTS.md:425-429`).

## Risks & open questions
- **Brainstorms did not run** (harness: the `agent-type-guard` hook vs the Agent tool parameters). B1–B4 are planner decisions with stated evidence. Re-run them before approval if you want a second opinion; B1 and B2 change the schema.
- **A per-case timeout does not cancel the HTTP call.** `Promise.race` returns after 120 s, but the provider request keeps running and may still bill. `checkCancelled` only stops further map-reduce chunks. Accepted for L06. Upgrade path: an `AbortSignal` in reviewer-core's `LLMProvider`, which is out of scope since reviewer-core stays unchanged.
- **Demo model.** Seeded agents use `deepseek/deepseek-v4-flash` (`server/src/db/seed.ts:22`), which INSIGHTS reports as slow or invalid on first try (`server/INSIGHTS.md:210-214,240-244`). For NFR-11, switch the Security Reviewer to `google/gemini-2.5-flash-lite` (or similar) in the editor before recording. Do not change the seed default (that is a product choice).
- **`Modal` focus-trap change affects every modal** in the app (ConfirmModal, conventions modal, …). Step 8 adds a test. Click through two existing modals in the browser after C1.
- **drizzle-kit interactive prompts.** If `pnpm db:generate` still prompts (e.g. it sees a table name reused across the two steps), stop and report it rather than answering blindly. The implementer has no TTY.
- **Single API instance assumption** (`server/src/server.ts:15`): the eval reaper fails every running run on boot, just like the review reaper.
- **Pre-existing drift** of `eval-ci.ts` line 3 and `productionize.ts` between the copies remains (only the eval blocks change). The `pr-self-review` guards treat any drift as blocking (`server/INSIGHTS.md:351-355`), so expect that guard to flag the old drift. It is out of scope for SPEC-04.
- AC-79's "Started failing" needs both run details. The detail page fetches the two newest done runs' details (2 extra GETs). That is acceptable, and there is no extra endpoint.

## Not verified
- That `pnpm db:generate` produces prompt-free DROP-only and then CREATE-only migrations for the B3 split. I did not run it (read-only). The Step 2 Done-when checks it.
- That `MetricCard`'s delta rendering can show "▲ Npt" exactly (read only lines 1-40 of `client/src/vendor/ui/charts/MetricCard.tsx`). Step 13 falls back to a local tile.
- Exact `IconName` values available for the nav item (`client/src/vendor/ui/icons.tsx` not read).
- That `Provider` and `ReviewStrategy` are exported from `knowledge.ts` in BOTH shared copies. Seen in the server copy (`Agent` uses them, `knowledge.ts:325-331`); the client copy was not opened.
- `isConfigChange` in `agents/repository.ts` (not read). Assumed to treat provider, model, system_prompt and strategy as config changes, per its comment at line 136. The Step 6 promote it-test checks it (version +1).

## Cross-model review (agy, 2026-10-08) — APPROVE WITH CHANGES

B1–B3, group split, scoring and `verify:l06` approved. Amendments the implementer must apply:

1. **Step 14 word diff (major):** early-exit when prompts are identical; strip common prefix/suffix tokens before the DP; two-row rolling DP (no full N×M matrix) so a 2k-word prompt cannot freeze the UI.
2. **Step 8 single-case run (minor):** `client/src/lib/api` sets no fetch timeout today (verified: no `timeout`/`AbortSignal` in `client/src/lib/api`), so browser fetch waits; just confirm no proxy layer cuts the 125 s `POST /eval-cases/:id/run` and do not add a shorter timeout.
3. **Steps 5–6 guard order (minor):** check "run already in progress" before the API-key check, so a running agent with a missing key gets 409 `eval_run_in_progress`, and run-all reports skip reason `running`, not `no_api_key`.
4. **Steps 4/11 field errors (minor):** item-level expectation errors (`expected.0.start_line`, line not in hunk) must render under the Expected output editor — server returns `field: 'expected'` or client matches `field.startsWith('expected')`.

## Review log
| Round | Id | Reviewer | Severity | Class | Status | Commit |
|---|---|---|---|---|---|---|
| 1 | — | architecture | — | — | pass, no findings | — |
| 1 | — | security | — | — | pass, no findings | — |
| 1 | F1 | code-reviewer | major | fix | fixed: invalidate eval/agent queries on running→terminal; dashboard polls while a run is running | review-1 |
| 1 | F2 | code-reviewer | minor | fix (user) | fixed: runAll catches per agent → skipped `provider_error` (new EvalSkipReason value, both vendor copies) | review-1 |
| 1 | F3 | code-reviewer | minor | defer | follow-up: same-title concurrent create-from-finding → 409 duplicate_case_name | — |
| 1 | F4 | code-reviewer | minor | defer | follow-up: stale last_result written after an edit during a run | — |
| 1 | F5 | code-reviewer | minor | fix (user) | fixed: finishRun retried 3× with backoff; stale `running` row (> STALE_RUN_MS) reaped on start | review-1 |

Gate (pre-review) fixes, commits `10f2c45`, `ab8200e`, `06c3f23`: AC-38 PR title in prDescription, NFR-6 log metrics, case deleted mid-run kept by name, EC-13 detail Run eval disabled, NFR-7 copy, AC-49 copy, row-button labels with case name, highlighted diff view with Edit diff toggle, flask icon, Promote isCurrent (strategy default + fresh agent).
| 2 | F1 | doc-writer (reopened) | major | fix (user: contract change) | fixed: dashboard agent row gets `running: boolean` (server query on running runs); client polls on it — `latest` is done-only so the round-1 condition never fired. Spec AC-72 + EvalDashboard contract amended | review-2 |
| 2 | N1 | code-reviewer | minor | defer | follow-up: agent/range switch while running fires one extra invalidation | — |

Spec amendments after G3 (user-approved): `provider_error` skip reason (AC-47, EC-12, run-all contract); dashboard `running` flag (AC-72, EvalDashboard contract).
