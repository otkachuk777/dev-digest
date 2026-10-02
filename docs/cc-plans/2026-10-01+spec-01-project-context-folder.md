# Plan: Project Context Folder — attach repo markdown docs to agents and skills (SPEC-01)

## Context
Users want the team's specs/docs/insights markdown (in the repo's default-branch clone) to reach review agents. They browse docs on a new Project Context page, attach them per repo to an agent or a skill (ordered), see token cost, and every review run injects them as untrusted text into the existing `## Project context` prompt slot; the run trace shows what was injected.

User decisions (round 1, already in the spec at `f0d3d7b`):
- Missing doc → Live Log line of a NEW kind `warn` (contract change, both vendor copies, distinct UI style — AC-33, AC-48).
- Walk skips `.git` + the repo-intel `EXCLUDED_DIRS` (reuse the list, don't duplicate — AC-1).
- Duplicate paths in a PUT → 422 `validation_error` (house convention).
- Refresh waits at most 60 s for the resync, then re-lists anyway, no new error copy (EC-17).
- Exact lowercase `.md` only (EC-16).
- B1/B2/B3 decisions below.

Earlier implementations of this feature exist on other branches (`origin/full-functionality` 741417b "SPEC-09", course branches 8426e6d). Per `client/INSIGHTS.md:18` they are graded/reference work: **do not `git show`/copy them**; implement from this plan.

## Requirements
- Source: `specs/SPEC-01-project-context-folder.md` (Status: approved, commit `f0d3d7b`)
- Items: AC-1…AC-48, EC-1…EC-17, NFR-1…NFR-7 (referenced by ID, not rewritten)

## Requirements review
- Status: approved. `spec-lint` reports one false "duplicate SPEC-01" error from the worktree copy `.claude/worktrees/multiagent-workflow-analysis-eb3fae` — caller confirmed it is being fixed separately; ignored.
- Gaps (resolved by the plan, no new behavior):
  - AC-8 "time since the clone's last sync": no column stores it. `repos.last_polled_at` is also bumped by PR polling (`server/src/modules/polling/routes.ts:62`), so it is not a sync time. `repo_index_state.updated_at` is written on every successful resync (`server/src/modules/repo-intel/pipeline/incremental.ts` step (2) "touch updated_at") → `synced_at = repo_index_state.updated_at`, `null` when no row.
  - AC-11 "no clone yet": the plan defines it as "the clone directory `container.git.clonePathFor(repo)` does not exist" (not `repos.clone_path IS NULL`) — the run reads from the same directory (AC-40), and the e2e fixture can provide a clone dir without a real `git clone`.
  - AC-9 completion signal: the existing pattern is polling `GET /repos/:id/index-state` until `updatedAt` advances (`client/src/lib/api/repo-intel.ts:16-27`), capped at 60 s (EC-17).
  - AC-41 also needs the doc resolution to happen **before** the provider is resolved in `runOneAgent`, otherwise a keyless/early failure has nothing to persist. The plan resolves docs first (also enables the hermetic e2e, see Step E1).
  - AC-42 token badge: computed client-side with `estimateTokens` like the Skills block (`TraceBody.tsx` skills `PromptBlock`); per-doc numbers (AC-44) come from `context_docs[].tokens` (server tokenizer).
- Conflicts:
  - AC-39 "label reduced to `[\w.:/-]`" vs `wrapUntrusted` (`reviewer-core/src/prompt.ts:45-54`), which *replaces* runs of other characters with `_` and caps at 80 chars. Plan keeps `wrapUntrusted` as is (the `### <path>` heading inside the block carries the full path). Recommendation for spec-creator: reword AC-39 to "replaced by `_` and capped at 80 characters".
  - NFR-6 lists namespaces `context|agents|skills|runs`; the sidebar label comes from `client/src/vendor/ui/nav.ts` (hard-coded English like every NAV item) and the command palette from `shell.nav.context` (already exists in `messages/en/shell.json`). No new copy is added outside the 4 namespaces; noted only.
- Recommendations:
  - Reuse the agent `SkillsTab` reorder pattern (`reorderAttached`, move up/down `IconBtn`, optimistic whole-set mutation — `client/src/app/(shell)/agents/[id]/_components/AgentEditor/_components/SkillsTab/`) for both Context tabs instead of a dnd library.
  - Reuse `PromptBlock`/`PromptModalBody` (search + Copy modal already exist) for AC-43 — only the label and badge change.
  - `AgentsRepository.setSkills` has the non-atomic delete+insert that B2 avoids; not touched here (out of scope).

## Scope
- Modules: server, reviewer-core, client, e2e (+ `scripts/e2e.sh`, `.github/workflows/e2e-web.yml` fixture lines). mcp unchanged.
- Out of scope: everything under spec Non-goals; fixing `setSkills` atomicity; vendor/shared drift outside `platform.ts`/`trace.ts` (both are byte-identical today); architecture & security review → separate agents.

## Execution mode
- Mode: parallel (3 groups + e2e). Group 0 runs and merges first; Groups A and B then run in parallel in their own worktrees; Group E runs after A and B are merged. Each fresh worktree installs deps first (`cd server && pnpm install`, `cd client && pnpm install`, `cd reviewer-core && npm ci`, `cd e2e && npm ci` — only the modules the group touches). Main session merges and commits with explicit paths (root `INSIGHTS.md:20`).

| Group | Chunk | Steps | Owned files | Depends on | Merge order |
|---|---|---|---|---|---|
| 0 | 0a | 0.1, 0.2 | both `vendor/shared/contracts/{platform,trace}.ts` + both `vendor/shared/index.ts` (comment), `server/src/platform/run-logger.ts`, `client/src/lib/api/context.ts`, `server/test/contracts.test.ts`, `server/src/db/schema/context.ts`, `server/src/db/schema.ts`, new migration + `meta/*` (generated) | — | 1 |
| 0 | 0b | 0.3, 0.4 | `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts`, `reviewer-core/src/index.ts`, `reviewer-core/test/prompt.test.ts`, `reviewer-core/test/run.test.ts`, `server/src/platform/config.ts`, `server/test/config.test.ts`, `client/messages/en/{context,agents,skills,runs}.json` | 0a | 1 |
| A | A-1 | A1, A2 | `server/src/adapters/tokenizer/index.ts`, `server/src/modules/context/{docs-fs,helpers,constants,token-cache}.ts`, `server/test/tokenizer.test.ts`, `server/test/context-helpers.test.ts`, `server/test/context-fs.test.ts` | Group 0 | 2 |
| A | A-2 | A3, A4 | `server/src/modules/context/{repository,service,routes,index}.ts`, `server/src/modules/index.ts`, `server/test/context.it.test.ts` | A-1 | 2 |
| A | A-3 | A5 | `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/prompt-log.ts`, `server/test/prompt-log.test.ts`, `server/test/context-run.it.test.ts` | A-2 | 2 |
| B | B-1 | B1, B2 | `client/src/vendor/ui/LiveLogStream.tsx` (+ new `LiveLogStream.test.tsx`), `client/src/lib/api/reviews.ts`, `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/primitives/Markdown.tsx` (+ test), `client/src/app/(shell)/repos/[repoId]/context/**` | Group 0 | 2 |
| B | B-2 | B3 | `client/src/components/context/**`, `client/src/vendor/ui/kit/Drawer.tsx` | B-1 | 2 |
| B | B-3 | B4, B5 | `client/src/app/(shell)/agents/[id]/_components/AgentEditor/{AgentEditor.tsx,constants.ts}`, `client/src/app/(shell)/skills/_components/SkillsView/_components/SkillEditor/{SkillEditor.tsx,constants.ts}`, `client/src/app/(shell)/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/**` | B-2 | 2 |
| E | E | E1 | `e2e/flows/08-project-context.flow.json`, `e2e/flows-docs/08-project-context.md`, `scripts/e2e.sh`, `.github/workflows/e2e-web.yml` | A, B merged | 3 |

## Test mode
inline

## Decisions
- B1 glob matching → hand-rolled path-segment matcher, no dependency. `CONTEXT_DOCS_GLOB` env (default `**/{specs,docs,insights}/**/*.md`) is parsed at boot with one regex of the shape `**/{a,b,…}/**/*.md` (or a single root without braces); roots must be a non-empty subset of `specs|docs|insights`, otherwise config load throws. Doc type = first *directory* segment that is a configured root. Node `path.matchesGlob` fails AC-1 on `.devdigest/specs/` and warns on Node 22.16; picomatch adds a dep for flexibility the closed `type` enum can't use. (brainstorm B1, medium-high)
- B2 attachment storage → two tables `agent_context_docs` / `skill_context_docs`, one row per (owner, repo), `paths jsonb NOT NULL CHECK (jsonb_typeof(paths)='array')`, PK (owner_id, repo_id), FKs to owner and `repos.id` `ON DELETE CASCADE`, index on `repo_id`. A write is a single upsert → EC-6 last-write-wins and EC-7 with no transaction/lock; duplicates are rejected by the body schema. User confirmed: no per-doc settings. (brainstorm B2, medium; user approved)
- B3 token counting → process-wide `Map` cache keyed `absPath|mtimeMs|size` → tokens, the repo's entries replaced by the current walk's keys on every listing (no growth); `Tokenizer.truncate(text, maxTokens)` in the tokenizer adapter (encode → slice → decode, drop trailing U+FFFD, guard loop `while count(cut) > max`), falling back to a char slice of `max*4` when the encoder is broken. NFR-3 applies to warm listings only (spec updated). (brainstorm B3, medium; user approved)
- Budget + merge live in the server as pure functions (reviewer-core has no tokenizer and must stay I/O-free — `onion-architecture/SKILL.md` §Step 2 "reviewer-core needs a capability"); reviewer-core only renders `{path, text}[]`.

## Insights applied
- `server/INSIGHTS.md:14` scope parent AND child → every context read/write checks agent/skill **and** repo against the workspace in SQL; "used by" counts and the run read join the owner with a `workspace_id` filter; inherited skills come from the already-scoped `linkedSkills` (AC-17, AC-19).
- `server/INSIGHTS.md:91` two trace builders → resolved docs are hoisted above the `try` in `runOneAgent` and passed to both the inline trace and `traceFromBuffer` (AC-41).
- `server/INSIGHTS.md:71` terminal status last → trace (with `context_docs`) saved before `completeAgentRun` on every path (already the order; keep it).
- `server/INSIGHTS.md:104` cross-module via `index.ts` → context imports `EXCLUDED_DIRS`/`MAX_FILE_SIZE` from `../repo-intel/index.js`; reviews imports context only from `../context/index.js`; context's `helpers.ts` stays free of `db/*`.
- `server/INSIGHTS.md:132` migration journal → migration only via `pnpm db:generate`, never hand-edit `meta/_journal.json`.
- `server/INSIGHTS.md:65` no DB side effects in `buildApp` → no cache warm-up or job registration at boot.
- `server/INSIGHTS.md:146` vendor drift → `platform.ts` and `trace.ts` are byte-identical in both copies today (`diff` verified); edit both identically and re-`diff`.
- `reviewer-core/INSIGHTS.md:14` delimiter label is a trust boundary → the doc path goes only through `wrapUntrusted`'s whitelisted label; never into the tag raw.
- `client/INSIGHTS.md:10` runtime Zod imports from `@devdigest/shared` work → `client/src/lib/api/context.ts` parses responses with the schemas.
- `client/INSIGHTS.md:46` no `user-event` → component tests use `fireEvent`.
- `client/INSIGHTS.md:91` braces in `beforeEach` that configure mocks.
- `client/INSIGHTS.md:58,64` never run `pnpm build` / `scripts/e2e.sh` while a `next dev` is up.
- Root `INSIGHTS.md:48` npm in `reviewer-core/` and `e2e/`, pnpm in `server/`/`client/`.
- Root `INSIGHTS.md:36` one fresh implementer per chunk of 2–3 steps.

## Constraints
- Do not touch: `server/src/db/migrations/meta/_journal.json` except via `pnpm db:generate` (`CLAUDE.md` "Do not touch"); lock files; both `vendor/shared` copies change together (`CLAUDE.md` "Do not touch").
- `pnpm arch` green in server and client; baseline never regenerated (`onion-architecture/SKILL.md` §Overview, `frontend-ui-architecture/SKILL.md` §Overview).
- `js-tiktoken` only under `src/adapters/**` (`server/.dependency-cruiser.cjs:76-93` `sdk-only-in-adapters`).
- Module A reaches module B only via B's `index.ts` (`server/.dependency-cruiser.cjs:97-117`).
- New module registered in `server/src/modules/index.ts` (`onion-architecture/SKILL.md` §Step 2).
- Wire fields snake_case; PascalCase Zod export + `z.infer` type (`CLAUDE.md` §Naming).
- Request validation failures → 422 `validation_error` (`server/src/app.ts:97-105`); `AppError(code, msg, 400)` for `invalid_path`/`unknown_path` (`server/src/platform/errors.ts:7-17`); `NotFoundError` = 404 `not_found`; 404 `context_doc_not_found` = `new AppError('context_doc_not_found', …, 404)`.
- Tests: server/reviewer-core in `<module>/test/`; client co-located `<Name>.test.tsx`; Postgres tests `*.it.test.ts` with `dockerAvailable()` guard (`server/test/skills.it.test.ts:10-16` pattern).
- Styles inline `CSSProperties` in `styles.ts`; feature folders `_components/<PascalCase>/` with `index.ts` (`CLAUDE.md` §Naming).

## Skills for implementer
| Files (glob) | Skills | Key rules (source) |
|---|---|---|
| `server/src/modules/context/**`, `server/src/modules/reviews/**` | onion-architecture | service orchestrates, repository speaks SQL, routes only parse → `getContext` → service; workspace predicate in SQL `where`, not JS; cross-module via `index.ts` (`onion-architecture/SKILL.md` §Step 1, §Step 2, §Red flags) |
| `server/src/modules/context/routes.ts` | fastify-best-practices | Zod schemas for params/query/body via the type provider; thin handlers (`fastify-best-practices/rules/routes.md` §Query String Parameters, §Request Body; `rules/error-handling.md` §Custom Error Classes) |
| `server/src/modules/context/repository.ts`, `server/src/db/schema/context.ts` | drizzle-orm-patterns, postgresql-table-design | FK via arrow fn, index FK columns by hand, `ON DELETE CASCADE`, jsonb CHECK `jsonb_typeof` (`drizzle-orm-patterns/SKILL.md` §Constraints and Warnings; `postgresql-table-design/SKILL.md` §Core Rules, §Constraints, §JSONB Guidance) |
| `*/src/vendor/shared/contracts/**`, `server/src/platform/config.ts` | zod | `z.enum` for fixed values, export schema + `z.infer` type, refine with path for duplicates, validate at the boundary only (`zod/SKILL.md` §1, §3, §7, §2 `parse-avoid-double-validation`) |
| all non-test server/client code | security | path traversal (`path.join` with user input), deny cross-tenant access, XSS in rendered markdown, prompt-injection labelling (`security/SKILL.md` §A01, §A05 Cross-Site Scripting, §Framework Security Quirks → JavaScript/Node.js, §Agentic AI Security) |
| `reviewer-core/src/**` | onion-architecture | reviewer-core is domain: no I/O, no server import (`onion-architecture/SKILL.md` §Step 1 table "Domain", §Red flags last-but-two row) |
| `client/src/**/*.{ts,tsx}` | frontend-ui-architecture, react-best-practices | shared Context tab used by two unrelated features → `src/components/context/` (promotion rule); data access in `lib/api/context.ts`; derive don't store; a11y for icon buttons; stable keys = path (`frontend-ui-architecture/SKILL.md` §Step 2, §Step 1 "Data access"; `react-best-practices/SKILL.md` §Derive, Don't Store, §Accessibility, §Key Prop Patterns, §Data Fetching) |
| `client/src/app/**` | next-best-practices | route page is a thin client page like `conventions/page.tsx`; `'use client'` on interactive leaves (`next-best-practices/SKILL.md` §RSC Boundaries, §Directives) |
| `client/**/*.test.{ts,tsx}` | react-testing-library | query by role/label first, test user-visible scenarios (`react-testing-library/SKILL.md` §Query Priority, §Test Scenarios by Component Type) |

Unmapped skills: none. (`typescript-expert` not needed — no type-level work.)

## Steps

### Step 0.1 — Contracts, run-log kind, client data access
- Covers: AC-3, AC-11, AC-12 (shape), AC-23, AC-24, AC-26, AC-33 (kind), AC-38, AC-48 (kind), NFR-7
- Files: modify `server/src/vendor/shared/contracts/platform.ts` AND `client/src/vendor/shared/contracts/platform.ts` (identical edit); modify both `contracts/trace.ts`; both `vendor/shared/index.ts` (doc comment `SpecFile` → new names); modify `server/src/platform/run-logger.ts`; rewrite `client/src/lib/api/context.ts`; modify `server/test/contracts.test.ts`.
- Skills: zod — `schema-use-enums`, `type-export-schemas-and-types`, `refine-add-path` (`zod/SKILL.md` §1, §3, §7); onion — contracts are domain (`onion-architecture/SKILL.md` §Step 1).
- Change:
  - `platform.ts` "Project Context" block: delete `SpecFile` and `IndexStatus` (only consumer is `client/src/lib/api/context.ts`, rewritten here). Add, exactly per the spec contract tables:
    - `ContextDocType = z.enum(['specs','docs','insights'])`
    - `ContextDoc = {path, type, size, tokens, used_by_agents, used_by_skills}` (ints `.int().nonnegative()`)
    - `ContextListing = {status: z.enum(['ok','no_clone']), glob, synced_at: z.string().nullable(), total_tokens, docs: ContextDoc[]}`
    - `ContextDocFile = {path, type, tokens, used_by_agents, used_by_skills, content}`
    - `ContextAttachmentRow = {path, type: ContextDocType.nullable(), tokens, status: z.enum(['present','not_found'])}`; `ContextInheritedRow = ContextAttachmentRow.extend({skill_id: uuid, skill_name})`
    - `AgentContext = {repo_id, budget_tokens, attached, inherited, total_tokens, truncated_paths}`; `SkillContext = AgentContext.omit({inherited: true})`
    - `SetContextAttachmentsInput = {repo_id: uuid, paths: z.array(z.string().min(1)).max(500)}` with `.superRefine` rejecting duplicate paths (issue path `['paths', i]`) → the route's validation error → 422 `validation_error`.
    - `ContextQuery = {repo_id: uuid}` and `ContextFileQuery = {path: z.string().min(1)}`.
  - `trace.ts`: `RunEventKind = z.enum(['info','tool','result','error','warn'])`. Add `ContextDocTrace = {path, tokens, origin: z.enum(['agent','skill']), origin_name, status: z.enum(['read','truncated','missing'])}` and `RunTrace.context_docs: z.array(ContextDocTrace).optional()`. `specs_read` unchanged.
  - `run-logger.ts`: add `warn: 'warn'` to the `LEVEL` map (`run-logger.ts:29-34`) and a `warn(msg, data?)` method mirroring `info` (`:64`).
  - `client/src/lib/api/context.ts`: one module per resource (`frontend-ui-architecture/SKILL.md` §Step 1 "Data access"): export `contextKeys` (`list(repoId)`, `file(repoId, path)`, `agent(agentId, repoId)`, `skill(skillId, repoId)`), `useContextDocs(repoId)` → `GET /repos/:id/context` parsed by `ContextListing`; `useContextDoc(repoId, path)`; `useAgentContext(agentId, repoId)`, `useSkillContext(skillId, repoId)`; `useSetAgentContext()` / `useSetSkillContext()` → `PUT` with optimistic update + rollback + invalidate (copy the shape of `useSetAgentSkills`, `client/src/lib/api/agents.ts:94-115`; on settle also invalidate `contextKeys.list(repoId)` so "Used by" refreshes). Remove `useReindexContext`.
  - `server/test/contracts.test.ts`: a pre-feature trace object (no `context_docs`, `specs_read: []`) still parses (NFR-7); `SetContextAttachmentsInput` rejects duplicates; `RunEventKind` accepts `warn`.
- Verify: `diff server/src/vendor/shared/contracts/platform.ts client/src/vendor/shared/contracts/platform.ts && diff server/src/vendor/shared/contracts/trace.ts client/src/vendor/shared/contracts/trace.ts` → no output; `cd server && pnpm test -- contracts` → green; `cd server && pnpm typecheck`; `cd client && pnpm typecheck` → green.
- Done when: both copies identical; old trace fixture parses; both modules typecheck.

### Step 0.2 — Attachment tables + migration
- Covers: AC-16, AC-31, AC-36, EC-6, EC-7, EC-8
- Files: modify `server/src/db/schema/context.ts`, `server/src/db/schema.ts` (export + add to the `schema` object, `schema.ts:29-50`); generated `server/src/db/migrations/00NN_*.sql` + `meta/*`.
- Skills: postgresql-table-design — index FK columns manually, `ON DELETE CASCADE`, jsonb CHECK (`postgresql-table-design/SKILL.md` §Core Rules, §Constraints, §JSONB Guidance); drizzle-orm-patterns — references via arrow functions (`drizzle-orm-patterns/SKILL.md` §Constraints and Warnings).
- Change: in `schema/context.ts` add `agentContextDocs` (`agent_context_docs`: `agent_id` uuid FK→`agents.id` cascade, `repo_id` uuid FK→`repos.id` cascade, `paths jsonb NOT NULL $type<string[]>()`, `updated_at timestamptz default now()`, PK(agent_id, repo_id), index `agent_context_docs_repo_idx` on repo_id, `check('agent_context_docs_paths_array', sql\`jsonb_typeof(${t.paths}) = 'array'\`)` — precedent `schema/reviews.ts:63`) and `skillContextDocs` mirroring it with `skill_id`→`skills.id`. Import `agents` from `./agents` and `skills` from `./skills`. Then `cd server && pnpm db:generate` (never hand-edit the journal) and `pnpm db:migrate` against the dev DB.
- Verify: `cd server && pnpm db:generate` produces exactly one new SQL file with 2 CREATE TABLE + FKs + CHECKs + indexes; `git diff server/src/db/migrations/meta/_journal.json` shows one appended entry only; `pnpm typecheck` green.
- Done when: migration appended, schema exported, typecheck green.

### Step 0.3 — reviewer-core: per-doc project-context blocks
- Covers: AC-34, AC-35, AC-39, EC-12, NFR-1 (rendering part)
- Files: modify `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts`, `reviewer-core/src/index.ts`; tests `reviewer-core/test/prompt.test.ts`, `reviewer-core/test/run.test.ts`.
- Skills: onion — reviewer-core is pure domain, no I/O, no tokenizer (`onion-architecture/SKILL.md` §Step 1 Domain row, §Step 2 "reviewer-core needs a capability"); security — prompt-injection labelling (`security/SKILL.md` §Agentic AI Security).
- Change:
  - `export interface ProjectContextDoc { path: string; text: string }`. `PromptParts.specs` and `ReviewInput.specs` (`run.ts:61`) become `ProjectContextDoc[]`.
  - `export function renderProjectContext(docs: ProjectContextDoc[]): string | undefined` → `undefined` for empty; else `docs.map(d => wrapUntrusted(d.path, d.text ? \`### ${d.path}\n${d.text}\` : \`### ${d.path}\`)).join('\n\n')`. `assemblePrompt` uses it for `specsBlock` (replace `prompt.ts:156-159`); `sections` entry `parts` = the per-doc wrapped strings. Export from `src/index.ts` (the server's failure-path trace uses it).
  - The section header `## Project context` and its position are unchanged; absent docs → section absent (AC-35, already true).
  - Tests (red first): label is the sanitized path and content starts with `### <path>` (AC-39); a path with `"` / newline cannot escape the tag; a `</untrusted>` inside a doc is neutralised; empty text → heading only (EC-12); no docs → no `## Project context` (AC-35); map-reduce: every chunk call's user message contains the same project-context section (AC-34, in `run.test.ts` with the mock provider forcing `strategy: 'map-reduce'` and 2 files). Update the existing `specs: ['spec one']` case (`prompt.test.ts:163`).
- Verify: `cd reviewer-core && npm test && npm run typecheck` → green; `cd server && pnpm typecheck` → green (server never passed `specs` before).
- Done when: new tests pass and were seen red first.

### Step 0.4 — Config glob + i18n messages
- Covers: AC-1 (config), AC-10 (glob shown), NFR-6
- Files: modify `server/src/platform/config.ts`, `server/test/config.test.ts`; modify `client/messages/en/context.json`, `agents.json`, `skills.json`, `runs.json`.
- Skills: zod — `compose-preprocess`/`refine-transform-coerce`, validate env at the boundary (`zod/SKILL.md` §6, §7, §2).
- Change:
  - `EnvSchema`: `CONTEXT_DOCS_GLOB: z.string().optional()`. In `loadConfig` parse it (default `**/{specs,docs,insights}/**/*.md`) with `/^\*\*\/(?:\{([a-z]+(?:,[a-z]+)*)\}|([a-z]+))\/\*\*\/\*\.md$/`; roots ⊆ `specs|docs|insights`, non-empty, else throw (boot fails). `AppConfig.contextDocs: { glob: string; roots: ('specs'|'docs'|'insights')[] }`. Test: default, single root, invalid shape throws, unknown root throws.
  - Messages (ICU plurals where NFR-6 says): `context.json` — replace the unused keys with: `title`, `search` placeholder, `refresh`, `refreshing`, `groups.{specs,docs,insights}`, `footer` ("Indexed: {files, plural, one {# file} other {# files}} · {tokens} tokens total · last {when}"), `tokens` ("{count} tokens"), `usedBy` ("Used by {agents, plural, one {# agent} other {# agents}} · {skills, plural, one {# skill} other {# skills}}"), `empty.{title,body}` (body names `{glob}`), `noClone`, `selectRepo`, `noMatches`, `docNotFound` ("Document not found — refresh the list"), `loadError`, `preview.{title,attached,close}`, `tab.{noDocs,openProjectContext,attachedCount ("{count} of {total} attached" plural),totalTokens ("≈ {count} tokens"),overBudget ("Over the {budget}-token budget — the run will truncate: {paths}"),notFound ("not found in {repo}"),detach,preview,moveUp,moveDown,via ("via {skill}"),filterPlaceholder,saveError}`, `type.{specs,docs,insights}`. `agents.json` `editor.tabs.context` = "Context". `skills.json` `detail.tabs.context` = "Context", `context.{title ("Project context to use"),note ("Any agent using this skill inherits these documents")}`. `runs.json` `trace.prompt.specs` = "Project context — attached specs (untrusted)", `trace.config.truncated` = "truncated", `trace.config.missing` = "missing", `trace.config.docTokens` = "{count} tokens".
- Verify: `cd server && pnpm test -- config` → green; `cd client && pnpm typecheck && pnpm test` → green (existing tests using `trace.prompt.specs` keep passing or are updated in Step B5).
- Done when: config tests green; all keys used by Group B exist.

### Step A1 — Tokenizer `truncate`
- Covers: AC-32 (cut), EC-13, NFR-1
- Files: modify `server/src/adapters/tokenizer/index.ts`; new `server/test/tokenizer.test.ts`.
- Skills: onion — SDK stays in the adapter, interface extended (`onion-architecture/SKILL.md` §Step 2 "New external system").
- Change: `Tokenizer` gains `truncate(text: string, maxTokens: number): string`. `TiktokenTokenizer.truncate`: `max <= 0 → ''`; `ids = enc.encode(text)`; if `ids.length <= max` return text; `cut = enc.decode(ids.slice(0, max)).replace(/�+$/, '')`; while `count(cut) > max` drop the last char; broken encoder → `text.slice(0, max * 4)`. Inline `{count}` test doubles elsewhere are not typechecked (`server/tsconfig.json` covers `src/**` only) — check `ContainerOverrides.tokenizer` users under `src/` still compile.
- Verify: `cd server && pnpm test -- tokenizer` → `count(truncate(x, n)) <= n` for ASCII, multibyte (emoji/Cyrillic) and a 50k-token input; `truncate(short, big) === short`.
- Done when: tests green, seen red first.

### Step A2 — Doc discovery, safe read, pure rules
- Covers: AC-1, AC-2, AC-12 (unit), AC-13, AC-24, AC-29, AC-32, EC-4, EC-9, EC-12, EC-13, EC-16, NFR-1
- Files: new `server/src/modules/context/constants.ts`, `helpers.ts`, `docs-fs.ts`, `token-cache.ts`; tests `server/test/context-helpers.test.ts`, `server/test/context-fs.test.ts`.
- Skills: onion — pure rules in `helpers.ts`/`constants.ts` (no `db/*`, no adapters), FS I/O in `docs-fs.ts` (`onion-architecture/SKILL.md` §Step 1 "Classifying a piece of code"); security — traversal & symlinks (`security/SKILL.md` §Framework Security Quirks → JavaScript/Node.js).
- Change:
  - `constants.ts`: `CONTEXT_BUDGET_TOKENS = 8000`, `TRUNCATED_MARKER = '[truncated]'`, `UNSAFE_PATH_CHARS = /[\x00-\x1f\x7f"`<>]/`.
  - `helpers.ts` (pure):
    - `docTypeFor(path, roots)` → first directory segment (not the file name) in `roots`, else `null` (EC-9: `docs/specs/x.md` → docs; `docs.md` → null).
    - `isDocPath(path, roots)` → ends with exactly `.md` (EC-16), no `UNSAFE_PATH_CHARS` (AC-2), `docTypeFor` non-null.
    - `checkRequestedPath(path)` → `'invalid'` if absolute (`/`, `\`, `^[A-Za-z]:`), any `..` segment, backslash, or NUL; else `'ok'` (AC-12).
    - `mergeAttachments(agent: {name, paths}, skills: {id, name, paths}[])` → ordered `{path, origin: 'agent'|'skill', originName, skillId?}[]`, first occurrence wins (AC-28 order, AC-29, EC-4).
    - `planBudget(docs: {path, tokens}[], budget)` → per doc `{path, keepTokens, status: 'read'|'truncated'}`: cumulative ≤ budget → read; the doc that crosses keeps `budget - used` → truncated; every later doc keeps 0 → truncated (AC-32, EC-13). Used by both the editor (`truncated_paths`, AC-24) and the run.
  - `docs-fs.ts`:
    - `walkDocs(root, roots)` → copy of the `walkDir` shape (`server/src/modules/repo-intel/pipeline/walk.ts:73-122`): `readdir(withFileTypes)`, skip symlinks, prune `.git` + `EXCLUDED_DIRS` (import `EXCLUDED_DIRS`, `MAX_FILE_SIZE` from `../repo-intel/index.js` — do not duplicate), keep `isDocPath`, `lstat` size ≤ `MAX_FILE_SIZE`, posix relative path; returns `{path, abs, size, mtimeMs}[]` sorted by path (AC-1, AC-2).
    - `readDocSafely(root, relPath)` → `realRoot = realpath(root)`; `lstat` every component from `realRoot` down — any symlink → throw; `realpath(file)` must start with `realRoot + sep`; size ≤ `MAX_FILE_SIZE`; then `readFile(utf8)` (AC-13). Never use `GitClient.readFile` (no containment check).
  - `token-cache.ts`: `countDocTokens(tokenizer, doc: {abs, size, mtimeMs}, read: () => Promise<string>)` with a module `Map<string, number>` keyed `${abs}|${mtimeMs}|${size}`; `pruneRepo(rootPrefix, liveKeys)` drops that repo's stale keys. Comment `// ponytail: process-wide cache, bounded by the live walk; per-container if several workspaces share a process`.
- Tests (red first): helpers — EC-9, EC-16 (`README.MD`, `x.Md` excluded), AC-2 chars, AC-12 inputs, merge/dedupe EC-4, budget EC-13 (one doc > 8000 → truncated with keep 8000), later-docs heading-only, exact boundary. fs (tmp dir): `.devdigest/specs/a.md` listed (AC-1), `node_modules/x/docs/a.md` and `.git/docs/a.md` pruned, >400 KB skipped, symlinked file and symlinked dir skipped (AC-2), `readDocSafely` refuses a symlinked component and a path escaping via a symlinked root (AC-13).
- Verify: `cd server && pnpm test -- context-helpers context-fs` → green; `pnpm arch` → green.
- Done when: all listed cases pass, arch green.

### Step A3 — Listing and file endpoints
- Covers: AC-1, AC-3, AC-11, AC-12, AC-13, AC-25, EC-1, EC-8, EC-10, NFR-2, NFR-3 (warm cache)
- Files: new `server/src/modules/context/repository.ts`, `service.ts`, `routes.ts`, `index.ts`; modify `server/src/modules/index.ts`; new `server/test/context.it.test.ts`.
- Skills: onion — routes thin, service orchestrates, repository owns SQL with workspace predicate (`onion-architecture/SKILL.md` §Step 1, §Step 2, §Red flags); fastify — query/params schemas via Zod provider (`fastify-best-practices/rules/routes.md` §Query String Parameters); drizzle (`drizzle-orm-patterns/SKILL.md` §Best Practices).
- Change:
  - `repository.ts` (`ContextRepository`): `repoInWorkspace(ws, repoId)` (read-only select on `repos`); `syncedAt(repoId)` (read-only select `repo_index_state.updated_at`); `usedByCounts(ws, repoId)` → `Map<path, {agents, skills}>` via `jsonb_array_elements_text(paths)` joined to `agents`/`skills` with `workspace_id = ws`, `count(distinct owner)`, one query per table.
  - `service.ts` (`ContextService(container)`): `listDocs(ws, repoId)` → 404 if repo outside workspace; `root = container.git.clonePathFor({owner, name})`; root missing → `{status: 'no_clone', glob, synced_at, total_tokens: 0, docs: []}` (AC-11); else walk → tokens via cache (`container.tokenizer`, AC-25) → prune → counts → `ContextListing` sorted by path, `total_tokens = Σ tokens` (AC-3). `getDoc(ws, repoId, path)` → `checkRequestedPath` invalid → `AppError('invalid_path', …, 400)`; not in current walk → `AppError('context_doc_not_found', …, 404)`; else `readDocSafely` → `ContextDocFile` (AC-12, AC-13). Also export an internal `snapshot(ws, repo)` returning the walk + token map for Steps A4/A5 (one walk per request).
  - `routes.ts`: `GET /repos/:id/context` (params `IdParams`), `GET /repos/:id/context/file` (query `ContextFileQuery`). Each: `getContext` → service → return. Register `context` in `modules/index.ts`.
  - `index.ts`: export `ContextService` and the types the reviews module needs — nothing from `repository.ts`/`routes.ts`.
- Tests (it, Docker, red first): use `buildApp` with `overrides.git` = a `MockGitClient` subclass whose `clonePathFor` returns a tmp dir (pattern `server/test/skills.it.test.ts:33-41`) and `overrides.tokenizer` left real. Cases: listing returns docs incl. `.devdigest/specs/a.md` with type/size/tokens (AC-1, AC-3); tokens equal `TiktokenTokenizer.count(content)` (AC-25); no clone dir → `no_clone`, `docs: []` (AC-11); edit a file + bump mtime → next listing shows new tokens (EC-10); repo of another workspace → 404; file endpoint: `../x`, `/etc/passwd` → 400 `invalid_path`, unlisted path → 404 `context_doc_not_found`, symlinked doc → 404 (AC-12, AC-13). "used by" counts after inserting rows, and after deleting the agent the count drops (EC-8).
- Verify: `cd server && pnpm test -- context.it` (Docker up) → green, 0 skipped; `pnpm typecheck && pnpm arch` → green.
- Done when: it-tests pass with Docker; arch green.

### Step A4 — Agent and skill attachment endpoints
- Covers: AC-16, AC-17, AC-18, AC-19, AC-20 (data), AC-23, AC-24, AC-26, AC-31, AC-36, EC-4, EC-5, EC-6, EC-7, EC-11, NFR-2
- Files: modify `server/src/modules/context/{repository,service,routes}.ts`; extend `server/test/context.it.test.ts`.
- Skills: security — scope parent AND child (`security/SKILL.md` §A01); onion — workspace predicate in SQL, no `snapshotVersion` path (`onion-architecture/SKILL.md` §Red flags); postgresql-table-design §Upsert-Friendly Design.
- Change:
  - `repository.ts`: `agentInWorkspace(ws, id)`, `skillInWorkspace(ws, id)` (or `container.agentsRepo.getById` / `container.skillsRepo.byId`); `agentPaths(ws, agentId, repoId)` / `skillPaths(ws, skillId, repoId)` (join owner with `workspace_id = ws`); `skillPathsFor(ws, skillIds, repoId)`; `setAgentPaths(agentId, repoId, paths)` / `setSkillPaths(...)` = single `insert … onConflictDoUpdate({target: [ownerId, repoId], set: {paths, updatedAt}})`.
  - `service.ts`: `getAgentContext(ws, agentId, repoId)`: agent and repo in workspace else 404 (AC-17); `links = container.agentsRepo.linkedSkills(ws, agentId)` filtered `l.enabled && l.skill.enabled` in link order (AC-19, EC-5); `mergeAttachments` → split into `attached` (origin agent) / `inherited` (first skill, `skill_id`, `skill_name`); each row's `type/tokens/status` from the snapshot (`not_found`, `type: null`, `tokens: 0` when the path is no longer listed — AC-26, EC-11); `total_tokens` = Σ present tokens once per path (AC-23); `truncated_paths` from `planBudget` over present docs in merged order (AC-24). `setAgentContext(ws, agentId, body)`: 404 checks first; `stored = agentPaths(...)`; any path not in the listing **and** not in `stored` → `AppError('unknown_path', …, 400)` with nothing stored (AC-18); then upsert and return `getAgentContext` (AC-16; other repos' rows untouched by construction). Skill variants are the same without `inherited` (AC-31). Never touch `agents.version`/`skills.version` or `snapshotVersion` (AC-36). `budget_tokens = CONTEXT_BUDGET_TOKENS`.
  - `routes.ts`: `GET /agents/:id/context` (query `ContextQuery`), `PUT /agents/:id/context` (body `SetContextAttachmentsInput`), same for `/skills/:id/context`.
- Tests (it, red first): attach then GET returns order; second repo set unchanged (AC-16, AC-31); agent/skill/repo of another workspace → 404 and nothing stored (AC-17); new unlisted path → 400 `unknown_path`, nothing stored (AC-18); already stored path that disappeared from the listing is accepted and shown `not_found` (AC-26, EC-11); duplicate paths → 422 `validation_error` (contract); inherited only from enabled links of in-workspace skills — a foreign skill row linked by raw insert is not inherited (AC-19, EC-5); path attached to both agent and skill counted once (EC-4, AC-23); over-budget fixture yields `truncated_paths` (AC-24); agent/skill `version` unchanged after PUTs (AC-36); two concurrent PUTs (`Promise.all`) → final state equals one of the two sets, no 500 (EC-6, EC-7); the mock LLM provider records 0 calls across listing/editor requests (NFR-2).
- Verify: `cd server && pnpm test -- context.it` → green, 0 skipped; `pnpm typecheck && pnpm arch` → green.
- Done when: all cases pass.

### Step A5 — Inject docs into review runs + trace + prompt log
- Covers: AC-28, AC-29, AC-32, AC-33, AC-34 (server side), AC-35, AC-37, AC-38, AC-40, AC-41, EC-5, EC-10, EC-11, EC-13, EC-14, NFR-1, NFR-2, NFR-4
- Files: modify `server/src/modules/context/{service,index}.ts` (add `resolveForRun`), `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/prompt-log.ts`; tests `server/test/prompt-log.test.ts`, new `server/test/context-run.it.test.ts`.
- Skills: onion — reviews calls context only via `../context/index.js`; application ring orchestrates (`onion-architecture/SKILL.md` §Step 2 "Another module's data or behavior"); security — untrusted doc text never logged (`security/SKILL.md` §A09 Logging and Alerting).
- Change:
  - `ContextService.resolveForRun(ws, agent, repo, log: {warn(msg)})` → `{ docs: ProjectContextDoc[]; trace: ContextDocTrace[]; specsRead: string[]; summary: {docs, tokens, truncated, missing} }`:
    - merged list from the agent's paths for `repo.id` plus enabled linked skills' paths for `repo.id` in link order (AC-28, AC-37 — only `repo.id` rows are read; EC-5).
    - for each path: `readDocSafely(clonePathFor(repo), path)` and stat at read time (AC-40, EC-14); on any error → `log.warn(\`Project context: skipped missing or unreadable doc ${path}\`)`, trace entry `status: 'missing', tokens: 0` (AC-33, EC-11). Tokens via the token cache.
    - `planBudget` over the readable docs; `read` → text = content; `truncated` with keep > 0 → `tokenizer.truncate(content, keep) + '\n' + TRUNCATED_MARKER`; keep 0 → `TRUNCATED_MARKER` only (AC-32, NFR-1). Trace `tokens` = kept content tokens (= listing count when read, AC-25).
    - `specsRead` = injected paths in prompt order (read + truncated, not missing) (AC-38).
    - No LLM calls (NFR-2).
  - `run-executor.ts` `runOneAgent`: declare `let context: RunContext = EMPTY` above the `try` (next to `skills`, `run-executor.ts:191`) and, as the first step inside the `try` (before `Resolving … provider`, `:197`), `context = await new ContextService(this.container).resolveForRun(workspaceId, agent, repo, runLog)`; if `docs.length` log `runLog.info(\`project context: ${n} doc(s), ~${tokens} token(s)\`)`. Pass `...(context.docs.length ? { specs: context.docs } : {})` to `reviewPullRequest` (AC-35). Inline trace (`:323-345`): `specs_read: context.specsRead`, `context_docs: context.trace` (omit when the agent has no attachments). `traceFromBuffer` gains a `context` param: `prompt_assembly.specs = renderProjectContext(context.docs) ?? null`, `specs_read`, `context_docs` — passed on the per-run failure path (`:373-376`); `failAll` (pre-work failure, docs never resolved) keeps `[]` (AC-41). Order stays: trace saved, then terminal status (`server/INSIGHTS.md:71`).
  - `prompt-log.ts`: `PromptLogInput.projectContext?: {docs, tokens, truncated, missing}` copied to `PromptLogRecord.project_context` (counts only, never text — NFR-4); pass `context.summary` from `onPromptAssembled`.
  - `context/index.ts`: export `ContextService`, `RunContext` type, `EMPTY_RUN_CONTEXT`.
- Tests (red first):
  - `prompt-log.test.ts`: record carries `project_context` counts and no doc text (NFR-4).
  - `context-run.it.test.ts` (Docker; harness of `server/test/reviews.it.test.ts`, mock LLM for every provider incl. `openrouter` per `server/INSIGHTS.md:110`, git override with tmp clone dir): agent doc then skill doc in link order, dedupe keeps agent origin (AC-28, AC-29); doc attached only for another repo not injected (AC-37); a missing doc → trace `missing`, a `warn` log line naming the path, run `done` (AC-33); big doc → `truncated`, later doc heading + `[truncated]`, Σ injected doc tokens ≤ 8000 (AC-32, NFR-1); trace `specs_read` + `context_docs` (AC-38); mock LLM received the `## Project context` section in every call when `strategy: 'map-reduce'` over 2 files (AC-34); no attachments → no section and no `context_docs` (AC-35); LLM provider that throws → failed run trace still has `specs_read`/`context_docs`/`prompt_assembly.specs` (AC-41); content changed on disk between two runs → second run injects the new text (AC-40, EC-10); LLM call count equals the no-docs baseline (NFR-2).
- Verify: `cd server && pnpm test` (Docker up) → green, 0 unexpected skips; `pnpm typecheck && pnpm arch` → green.
- Done when: all cases pass; chunk-level full server suite green.

### Step B1 — Live Log `warn` style and SSE listener
- Covers: AC-48, AC-33 (visible)
- Files: modify `client/src/vendor/ui/LiveLogStream.tsx`, new `client/src/vendor/ui/LiveLogStream.test.tsx`; modify `client/src/lib/api/reviews.ts`.
- Skills: react-best-practices §Accessibility (contrast); react-testing-library §Query Priority.
- Change: `LogLine.k` adds `"warn"`; `LOG_COLOR.warn` gets a distinct treatment — text `var(--warn)` on a `var(--warn-bg)` row background with a `warn` tag (the `tool` kind already uses `var(--warn)` text only, `LiveLogStream.tsx:13-18`). Add `"warn"` to the SSE listener list (`client/src/lib/api/reviews.ts:234`) or warn events never reach the stream. Test: render one line of each kind; the `warn` line's computed style/markup differs from each of the other four.
- Verify: `cd client && pnpm test -- LiveLogStream` → green.
- Done when: test green, seen red first.

### Step B2 — Project Context page + NAV + safe markdown preview
- Covers: AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-14, EC-1, EC-2, EC-17, NFR-5 (page), NFR-6
- Files: modify `client/src/vendor/ui/nav.ts` (WORKSPACE item `{ key: "context", label: "Project Context", icon: <existing icon e.g. "FileText">, href: "/repos/:repoId/context" }`); modify `client/src/vendor/ui/primitives/Markdown.tsx` (+ extend `Markdown.test.tsx`); new `client/src/app/(shell)/repos/[repoId]/context/page.tsx` and `_components/ProjectContextView/{ProjectContextView.tsx,helpers.ts,styles.ts,index.ts,ProjectContextView.test.tsx}` (sub-components inside it as needed).
- Skills: next-best-practices §RSC Boundaries, §Directives (copy `conventions/page.tsx` shape); frontend-ui-architecture §Step 2 (route-local view); react-best-practices §Derive, Don't Store, §Data Fetching, §Conditional Rendering; security §A05 Cross-Site Scripting.
- Change:
  - `Markdown` gains optional prop `noRemoteImages?: boolean`; when set, `components.img` renders the alt text (or a plain link to `src` when there is no alt), never an `<img>` (AC-7). Default behavior elsewhere unchanged. react-markdown already drops raw HTML and unsafe URLs (`Markdown.tsx:21-24`).
  - `page.tsx`: `useParams` → `useRepoNotFound` → `<ProjectContextView repoId />`. No `repoId` selected → "Select a repository" (EC-2).
  - `ProjectContextView`: `useContextDocs(repoId)`; filter state (case-insensitive substring on path — AC-5); docs grouped by `type` with path + tokens (AC-4); selecting a doc loads `useContextDoc` and shows `<Markdown noRemoteImages>` + path, type badge, tokens, `usedBy` (AC-6, AC-7); footer `context.footer` with `relativeTime(synced_at)` from `client/src/lib/date.ts` (AC-8); `status === 'no_clone'` → `context.noClone` + Refresh (EC-1, AC-11); empty listing → empty state naming `glob` (AC-10); doc 404 → `context.docNotFound`.
  - Refresh (AC-9, EC-17): `useResyncRepoIntel(repoId).mutate()`, remember `before = indexState.updatedAt`, poll `useRepoIntelStatus(repoId, polling)`; stop when `updatedAt !== before` or 60 s elapsed (`helpers.ts` `REFRESH_TIMEOUT_MS = 60_000`, pure `resyncFinished(before, now, startedAt, nowMs)`), then `invalidateQueries(contextKeys.list(repoId))`. No new error copy.
- Tests (red first, `fireEvent`): grouped list with tokens (AC-4); filter (AC-5); select → preview + "Used by 1 agent · 2 skills" (AC-6); markdown image renders alt text, no `<img>` / no request (AC-7, Markdown.test); footer text (AC-8); Refresh calls resync and re-lists after `updatedAt` advances, and after 60 s with fake timers (AC-9, EC-17); empty state shows the glob (AC-10); `no_clone` message (EC-1); NAV contains "Project Context" with `/repos/<id>/context` (AC-14 — test `resolveHref`/Sidebar render).
- Verify: `cd client && pnpm test -- ProjectContextView Markdown LiveLogStream && pnpm typecheck && pnpm arch` → green.
- Done when: tests green; page renders in the browser at `/repos/<id>/context` (manual click-through per `client/INSIGHTS.md:24`).

### Step B3 — Shared Context tab + preview drawer
- Covers: AC-15, AC-20, AC-21, AC-22, AC-23, AC-24, AC-26, AC-27, EC-2, EC-3, EC-4, EC-6, EC-7, EC-15, NFR-5, NFR-6
- Files: new `client/src/components/context/ContextTab/{ContextTab.tsx,helpers.ts,styles.ts,index.ts,ContextTab.test.tsx}`, `client/src/components/context/DocPreviewDrawer/{DocPreviewDrawer.tsx,styles.ts,index.ts,DocPreviewDrawer.test.tsx}`; modify `client/src/vendor/ui/kit/Drawer.tsx`.
- Skills: frontend-ui-architecture §Step 2 (two unrelated consumers → `src/components/context/`, like `src/components/skills/`), §Step 3 (split list vs drawer); react-best-practices §Derive, Don't Store, §Key Prop Patterns (key = path), §Accessibility; react-testing-library §Query Priority.
- Change:
  - `ContextTab` props: `{ owner: { kind: 'agent' | 'skill'; id: string }; repoId: string | null; header?: ReactNode }`. Reads `useContextDocs(repoId)` + `useAgentContext`/`useSkillContext`; writes via the matching `useSet…Context` (whole ordered set — EC-6/EC-7 handled server-side; optimistic cache = no local draft, same as `SkillsTab`).
  - Rows: attached (stored order, draggable, move up/down `IconBtn`s with `aria-label` from `tab.moveUp/moveDown`) → inherited (read-only, "via <skill>", agent only) → other listed docs. Each row: `Checkbox` with accessible name containing the path, file name, folder, type badge, tokens, Preview button (AC-15, AC-20). Not-found attached rows show `tab.notFound` + Detach (AC-26).
  - `helpers.ts` (pure): `buildContextRows(listing, context)`, `reorderPaths(paths, from, to)`, `movePath(paths, path, dir)` — copy the semantics of `reorderAttached` (`SkillsTab/helpers.ts:70-81`).
  - Header: `tab.attachedCount` ("N of M attached"), `tab.totalTokens` from server `total_tokens` (AC-23); over-budget warning listing `truncated_paths` (AC-24); filter field — no matches → `context.noMatches`, counts unchanged (EC-3); no repo → `context.selectRepo` (EC-2); listing empty → `tab.noDocs` + link to `/repos/<id>/context` (EC-15). Mutation error → inline `tab.saveError`, cache rolls back.
  - `DocPreviewDrawer`: `Drawer` with path, type badge, used-by, tokens, Attached toggle bound to the same set mutation, `<Markdown noRemoteImages>` (AC-27).
  - `Drawer.tsx` focus (NFR-5): dialog gets `tabIndex={-1}` + `aria-labelledby` the title; on mount focus the dialog, on unmount restore focus to `document.activeElement` captured at mount; Escape calls `onClose`. Benefits all drawers; no visual change.
- Tests (red first, `fireEvent`): list with checkbox named by path, type badge, tokens, Preview (AC-15); attached order then inherited "via X" (AC-20); drag from row A onto row C sends reordered `paths` (AC-21); move-down button sends new order (AC-22); counts and "≈ T tokens" (AC-23); over-budget names truncated docs (AC-24); not-found row + Detach sends set without it (AC-26); Preview opens drawer with toggle and markdown; focus moves into the drawer and returns to Preview on close (AC-27, NFR-5); filter no-match message, counts unchanged (EC-3); same path in agent and skill shown once (EC-4).
- Verify: `cd client && pnpm test -- ContextTab DocPreviewDrawer && pnpm typecheck && pnpm arch` → green.
- Done when: tests green.

### Step B4 — Context tab in agent and skill editors
- Covers: AC-15, AC-30, EC-2
- Files: modify `client/src/app/(shell)/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx}` (+ `AgentEditor.test.tsx`), `client/src/app/(shell)/skills/_components/SkillsView/_components/SkillEditor/{constants.ts,SkillEditor.tsx}` (+ `SkillEditor.test.tsx`).
- Skills: frontend-ui-architecture §Step 2 (compose shared component in the feature); next-best-practices §Directives.
- Change: add `{ key: "context", labelKey: "editor.tabs.context", icon: "FileText" }` to agent `TABS` and `{ key: "context", labelKey: "detail.tabs.context", icon: "FileText" }` to skill `TABS`; render `<ContextTab key={id} owner={{kind, id}} repoId={useActiveRepo() id} />`. Skill tab passes a header with `skills.context.title` and `skills.context.note` (AC-30).
- Tests: tab appears and renders the Context tab body; skill tab shows the title + note (AC-30).
- Verify: `cd client && pnpm test -- AgentEditor SkillEditor` → green.
- Done when: both editors show the tab.

### Step B5 — Run trace: project-context entry and Specs read
- Covers: AC-42, AC-43, AC-44, AC-45, NFR-7, AC-38 (visible)
- Files: modify `client/src/app/(shell)/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `TraceBody.test.tsx` (update `client/src/app/(shell)/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx` fixture only if it breaks).
- Skills: react-best-practices §Conditional Rendering, §Key Prop Patterns; react-testing-library §Query Priority.
- Change: specs `PromptBlock` gets `tokens={estimateTokens(specs)}` (label comes from the updated `trace.prompt.specs`, AC-42); its existing fullscreen modal provides search + Copy (AC-43 — keep `PromptBlock`/`PromptModalBody` unchanged). "Specs read" row: if `trace.context_docs?.length` render each `{path, tokens, status}` with `trace.config.docTokens` and a `truncated`/`missing` marker (AC-44); else fall back to `specs_read` strings as today (AC-45, NFR-7).
- Tests (red first): label "Project context — attached specs (untrusted)" + token badge (AC-42); open fullscreen → search field + Copy present with full text (AC-43); per-doc rows with markers (AC-44); trace without `context_docs` renders `specs_read` and an old trace (`specs_read: []`) renders "none" without error (AC-45, NFR-7).
- Verify: `cd client && pnpm test && pnpm typecheck && pnpm arch` → green (chunk-level full suite).
- Done when: all client tests green.

### Step E1 — e2e flow: attach → run → trace
- Covers: AC-46
- Files: new `e2e/flows/08-project-context.flow.json`, `e2e/flows-docs/08-project-context.md`; modify `scripts/e2e.sh`, `.github/workflows/e2e-web.yml`.
- Skills: none mapped (JSON flow + shell); follow `e2e/CLAUDE.md` naming and existing flows (`e2e/flows/04-pr-findings.flow.json`).
- Change:
  - Fixture: both `scripts/e2e.sh` and `e2e-web.yml` export `DEVDIGEST_CLONE_DIR` to a fresh temp dir before the API starts and write `$DEVDIGEST_CLONE_DIR/acme/payments-api/docs/e2e-invariant.md` (short text with a unique marker, e.g. `E2E-INVARIANT-7f3a`). The seeded repo then lists one doc (clone = directory exists, see Requirements review).
  - Flow: open `/` → land on acme/payments-api → Agents → open a seeded agent → Context tab → tick `docs/e2e-invariant.md` → open PR #482 → run that agent → open the run's trace (RunHistory "open trace") → expect "Specs read" shows `docs/e2e-invariant.md` → expand "Project context — attached specs (untrusted)" → expect text `E2E-INVARIANT-7f3a`.
  - First confirm in the hermetic stack that the run reaches doc resolution: the diff falls back to `pr_files` (`server/src/modules/reviews/diff-loader.ts`), docs are resolved before the provider (Step A5), so a run without an LLM key fails AFTER the docs and its trace still carries them (AC-41). If any of that does not hold, stop and report — do not weaken the flow.
- Verify: with no `next dev` running (`client/INSIGHTS.md:64`): `npm run e2e:hermetic` from `e2e/` → all flows green including 08.
- Done when: flow 08 green in the hermetic run.

## Test plan
- New/changed tests (owner: implementer, inline, red first):
  - reviewer-core `test/prompt.test.ts`, `test/run.test.ts` — AC-34, AC-35, AC-39, EC-12 (unit).
  - server unit: `contracts.test.ts` (NFR-7, duplicate paths, `warn`), `config.test.ts` (B1 glob), `tokenizer.test.ts` (AC-32 cut), `context-helpers.test.ts` (AC-2, AC-12, AC-24, AC-29, AC-32, EC-4, EC-9, EC-13, EC-16, NFR-1), `context-fs.test.ts` (AC-1 dot-folders/pruning, AC-2, AC-13), `prompt-log.test.ts` (NFR-4).
  - server it (Docker): `context.it.test.ts` — AC-1, AC-3, AC-11, AC-12, AC-16, AC-17, AC-18, AC-19, AC-25, AC-26, AC-31, AC-36, EC-6, EC-7, EC-8, EC-10, NFR-2; `context-run.it.test.ts` — AC-28, AC-29, AC-32, AC-33, AC-34, AC-35, AC-37, AC-38, AC-40, AC-41, NFR-1, NFR-2.
  - client unit: `LiveLogStream.test.tsx` (AC-48), `Markdown.test.tsx` (AC-7), `ProjectContextView.test.tsx` (AC-4…AC-10, AC-14, EC-1, EC-2, EC-17), `ContextTab.test.tsx` (AC-15, AC-20…AC-24, AC-26, EC-3, EC-4, EC-15, NFR-5 checkbox names + keyboard reorder), `DocPreviewDrawer.test.tsx` (AC-27, NFR-5 focus), `AgentEditor.test.tsx`/`SkillEditor.test.tsx` (AC-30), `TraceBody.test.tsx` (AC-42…AC-45, NFR-7). NFR-6: every new string read via `useTranslations` in the 4 namespaces (code review + tests use the real messages).
  - e2e: `e2e/flows/08-project-context.flow.json` — AC-46.
- Layer deviations from `[verify:]` tags: AC-12 tagged `unit, it` — both covered; AC-34 tagged unit — covered by the reviewer-core unit test, and server it adds an extra check; NFR-2 tagged unit — checked in it-tests through the mock LLM call count (no LLM seam exists in a unit test of the service).
- Manual:
  - AC-47: attach an invariant doc on the default branch, open a PR adding `import … from '../db/…'` under `api/`, run 3 times; ≥1 finding per run names the doc path.
  - NFR-3: 500 synthetic 10 KB docs in a clone dir; call `GET /repos/:id/context` once to warm, then 20× — p95 < 2 s.
  - NFR-5: contrast ≥ 4.5:1 for new text (incl. the `warn` log line) in light and dark themes; keyboard-only reorder and drawer focus in the browser.
- Commands per module: server `pnpm typecheck`, `pnpm test`, `pnpm arch`; client `pnpm typecheck`, `pnpm test`, `pnpm arch`; reviewer-core `npm run typecheck`, `npm test`; e2e `npm run typecheck`, `npm run e2e:hermetic`.
- Docker needed: yes (server `*.it.test.ts`; a run with `skipped > 0` while Docker is up is a failure — `server/INSIGHTS.md:124`). e2e: required — AC-46 is `[verify: e2e]`.

## Risks & open questions
- AC-39 wording vs `wrapUntrusted` (replace with `_`, cap 80) — kept as is; recommend spec-creator rewording.
- `no_clone` defined as "clone directory missing" instead of `repos.clone_path IS NULL` — needed for AC-40 consistency and the e2e fixture; a half-written clone dir (interrupted clone) would list as `ok` with whatever docs exist.
- e2e local run: `scripts/e2e.sh` does not isolate `~/.devdigest/secrets.json`; with a real key present, the run in flow 08 makes a real (paid) LLM call. The flow passes either way; CI has no key.
- Hermetic e2e feasibility (diff fallback + failed-run trace) is reasoned from code, not run — Step E1 checks it first and stops if it does not hold.
- B3 warm cache: the first listing after a server start on a very large repo may exceed 2 s (excluded from NFR-3 by the spec); synchronous `encode` blocks the event loop during that cold listing.
- `Drawer` focus change affects every drawer in the app (pure a11y improvement, no visual change) — check one existing drawer (RunTraceDrawer) in the browser.
- `vendor/shared/index.ts` doc comments mention `SpecFile`; updated in both copies in Step 0.1.

## Not verified
- That js-tiktoken `decode(encode(x).slice(0,n))` re-counts to ≤ n in all cases — guarded by the loop in Step A1 (no source found by brainstorm B3).
- drizzle-kit 0.30 output for a jsonb `CHECK` via `check()` — precedent exists (`server/src/db/schema/reviews.ts:63`) but the generated SQL for this table was not produced (read-only planning).
- That the hermetic stack's run of a seeded agent reaches `runOneAgent` without a key (searched `scripts/e2e.sh`, `diff-loader.ts`, `run-executor.ts`; not executed).
- Exact icon name available for the NAV/tab (`client/src/vendor/ui/icons.tsx` not opened) — implementer picks an existing `IconName` (e.g. `FileText`, used in `TraceBody.tsx`).

## Review log
| Round | Id | Reviewer | Severity | Class | Status | Commit |
|---|---|---|---|---|---|---|
| 1 | C1 | code-reviewer | major | fix | fixed (r1) — tokenizer `encode(text, [], [])`, special tokens no longer flip `broken` | review-1 |
| 1 | C5 | code-reviewer | minor | fix (AC-32 violation) | fixed (r1) — `planBudget` truncates every doc once budget exhausted | review-1 |
| 1 | C2 | code-reviewer | minor | fix (user-visible 400) | fixed (r1) — Detach only on attached not-found rows | review-1 |
| 1 | C3 | code-reviewer | minor | fix (infinite skeleton) | fixed (r1) — ContextTab error state | review-1 |
| 1 | C4 | code-reviewer | minor | defer | follow-up — trace badge uses `estimateTokens`, per-doc rows use server tokenizer | — |
| 1 | C6 | code-reviewer | minor | defer | follow-up — overlapping optimistic mutations can briefly roll back to stale state | — |
| 1 | — | architecture-reviewer | — | — | pass, 0 findings | — |
| 1 | — | security-reviewer | — | — | pass, 0 findings | — |
| 2 | C1, C2, C3, C5 | code-reviewer | — | — | resolved (r2) | review-1 |
| 2 | — | security-reviewer | — | — | pass (delta), 0 findings | — |
| G3 | V1 | browser check | minor | fix | resolved — preview grid `minmax(0,1fr)`, wide blocks scroll inside the preview | review-2 |
| G3 | V2 | browser check | minor | fix | resolved — ContextTab long paths ellipsize; badge/tokens/Preview stay visible | review-2 |
| G3 | V3 | browser check | nit | fix-along | resolved — ICU `{n, number}` for token totals | review-2 |
