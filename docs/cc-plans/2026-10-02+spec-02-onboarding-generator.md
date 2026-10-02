# Plan: Onboarding Generator — five-part repository tour (SPEC-02)

## Context
L05 assignment. Build a per-repository Onboarding Tour with five sections:
- Architecture overview
- Critical paths
- How to run locally
- Guided reading path
- First tasks

How it is built:
- The tour comes from deterministic `repoIntel.*` facts plus **one** structured LLM call.
- If the index is degraded or the call fails, the tour falls back to an honest skeleton.
- Every generation writes one log line with llm_calls, tokens, cost, duration and status.
- The client gets a new page, a sidebar item, copy actions and a restored Mermaid renderer.

User decisions (2026-10-02, via main session):
- Null cost shows "—".
- The sidebar item is added like the other NAV items.
- The client ignores `generating: true`.
- Execution mode is parallel, with per-group worktrees for S and C and a fallback (see Execution mode).
- Test mode is test-first.
- No reviewer-core change.
- No migration.
- The e2e flow uses the keyless skeleton.
- AC-58 is manual.

Commit structure (user-fixed, all on the feature branch `feat/spec-02-onboarding-generator`, which is based on `L05-lab`):
- "Onboarding Generator - plan"
- "Onboarding Generator - code"
- "Onboarding Generator - tests & review"
- "Onboarding Generator - verification"

Chunks are **not** committed individually; in the matrix every task's commit is its stage commit.

## Requirements
- Source: `specs/SPEC-02-onboarding-generator.md` (Status: approved; `spec-lint.sh` → OK).
- Items:
  - AC-1…AC-62
  - EC-1…EC-18
  - NFR-1…NFR-10
- Items are referenced by ID only. Their text is not rewritten here.

## Requirements review
- **Status:** approved.

### Gaps (planner interpretation; pinned so test-writer and implementer agree)
1. **AC-38 candidate commands.**
   - Command candidates are `(command, cwd)` pairs from facts. The `cwd` is the manifest dir, `null` for the repo root.
   - A model command is kept only when its whitespace-normalised `command` **and** its normalised `cwd` match a candidate. `null`, `""`, `"."` and `"./"` all mean root. The kept item takes the candidate's `cwd`.
   - Script forms:
     - npm: `npm run <s>`, plus `npm test` and `npm start`
     - pnpm, yarn, bun: `<pm> run <s>` and `<pm> <s>`
   - Install command: `<pm> install`.
   - `docker compose up -d` is valid followed by any subset of the found services, in any order.
   - `make <target>`.
   - `cp .env.example .env` when that file exists.
   - README commands: lines of the root README fences tagged `sh|bash|shell|zsh|console`. A leading `$ ` is stripped; empty lines and `#` comment lines are skipped.
2. **AC-42 skeleton commands in a monorepo.**
   - One install command in the dir of the root manifest. If there is no root manifest, the first manifest by path is used.
   - Then, for each of `dev`, `start`, `build`, `test`: the first manifest (root first, then by path) that defines it.
   - Then `docker compose up -d` if a compose file exists.
   - Cut to 8.
   - If no package manager is detected: no install command, scripts use `npm run`.
3. **Manifests and package manager.**
   - Manifests are `package.json` files at depth ≤ 3. `repo-intel/constants.ts` `EXCLUDED_DIRS` is skipped during the walk.
   - Package manager by lockfile at the repo root:
     - `pnpm-lock.yaml` → pnpm
     - `yarn.lock` → yarn
     - `bun.lockb` or `bun.lock` → bun
     - `package-lock.json` → npm
     - otherwise `null`
   - Frameworks and libraries are the dependency names of all manifests: `dependencies` ∪ `devDependencies`, sorted and deduped. Non-JS manifests are out of scope. The index is JS/TS only (spec Non-goals).
4. **AC-31 entry points.** From `package.json` `main`, `module`, `bin` (string or object values) and `exports["."]` (when it is a string). Only files that exist are used, root manifest first.
5. **Clone status (AC-22/23).** The clone directory `container.git.clonePathFor(repo)` exists. This is the same rule SPEC-01 uses (`server/src/modules/context/service.ts:68-69`). It is required for the hermetic e2e fixture, where `repos.clone_path` is NULL.
6. **`commit_sha`.**
   - `container.git.currentHead(ref)`. If that fails, the index `lastIndexedSha`. If that is missing, `""`.
   - AC-21 badge shows only when `current_commit_sha` is non-null **and** differs from `tour.commit_sha`.
7. **Failed-but-sent call.** When the request was sent and then failed (timeout, 429, provider error, invalid output): `llm_calls` 1, tokens 0, `cost_usd` null.
8. **Cost.**
   - `cost_usd` is rounded to 6 decimals on the server. The same number is stored and logged.
   - The client prints it verbatim as `$<value>`; null → "—" (user decision 1). This keeps AC-58 "same as the banner" exact.
   - `formatCost` is used only for null. It rounds to 3 significant digits, which would break AC-58.
9. **AC-56 log for 404.** One line with `status: "rejected"` and `reason: "not_found"`. `repo` is null when the repo is not in the workspace.
   - EC-2 (repo deleted mid-run) logs `rejected` / `not_found` with the real `llm_calls`.
   - Reasons for `rejected`: `no_clone`, `generation_in_progress`, `not_found`. For tours: `skeleton_reason` or null.
10. **AC-36 reasons.**
    - Model reasons for unlisted paths are ignored and **not** counted.
    - Unsafe paths (AC-61) are dropped and counted.
    - When the model returns several reasons for the same path, the first one wins.
11. **AC-20 `generating`.** The client ignores it (user decision 3).
12. **Tokens display.** `{tokens, number}` (ICU) → "1,234 tokens".

### Conflicts
- **AC-3 vs `client/src/components/app-shell/helpers.ts:29`.** `pathname.includes("/onboarding")` marks the add-repo route `/onboarding` as `onboarding-tour`. Step C1 fixes this.
- **Existing tour scaffolding vs the spec.** `Onboarding`/`OnboardingSection` (`vendor/shared/contracts/knowledge.ts:28-47`), `server/src/prompts/onboarding.system.md`, and `client/messages/en/onboarding.json` describe different sections. All three are replaced. No consumer exists; the spec Contracts section confirms this.
- **`server/test/contracts.test.ts:136` parses the old `Onboarding` shape.** It is updated in Step 0.1 (pre-existing test, mechanical).
- **`repo-intel/constants.ts` `HOTNESS_WINDOW_DAYS = 180` vs AC-27 (90 days).** Onboarding uses its own constant. The old constant is untouched.
- **Existing `RepoIntelService.getCriticalPaths` / `getTopFilesByRank`** (`service.ts:644-707`) rank by stored `rank` (= pagerank, `pipeline/rank.ts:4-7`) with `BFS_DEPTH = 2`. AC-28/30 need `pagerank × (1 + hotness)`, so onboarding computes its own lists. The existing methods stay (conventions uses `getTopFilesByRank`).
- **Vendor/shared ports:**
  - The onion skill says to add a new port to the server `vendor/shared/adapters.ts` only (`onion-architecture/tools.md` § External SDKs step 1).
  - But `pr-self-review/scripts/guards.sh:32-43` blocks any drift between copies. Both copies are identical today.
  - **Edit both copies** (Step 0.1).
- **NFR-7 vs the UI kit Sidebar.** NFR-7 requires the sidebar copy from `shell`. But the kit Sidebar prints hard-coded `NAV[].label` (`client/src/vendor/ui/shell/Sidebar.tsx:59-66`). See Decision D2 (user decision 2).

### Recommendations (for spec-creator, non-blocking)
- Reword NFR-7 to "page copy from `onboarding`; sidebar label via NAV like the other items, palette label from `shell.nav.onboarding-tour`".
- State the AC-48 null-cost display ("—").
- Add a line for AC-20's client behaviour, or drop `generating` from the contract if it stays unused.

## Scope
- Modules: server, client, e2e.
- Unchanged: `reviewer-core` (Decision D1 — no change needed) and `mcp`.
- Out of scope:
  - every spec Non-goal;
  - the existing `getCriticalPaths`/`getTopFilesByRank` behaviour;
  - `vendor/shared` drift in files other than `contracts/knowledge.ts` and `adapters.ts`;
  - the `sync_to_folder` setting;
  - architecture and security review (separate agents).

## Execution mode
- **Mode: parallel.**
- Order: Group 0 (feature worktree) → test-writer red tests (feature worktree) → **Group S ∥ Group C in their own worktrees** → merge back → Group E (feature worktree).
- **Feature worktree:** `/Users/olehtkachuk/_Projects/GoIT/dev-digest/.claude/worktrees/spec-02-onboarding-generator`. Every path in this plan is relative to it.
- **git:**
  - Use `/opt/homebrew/bin/git`, one git command per Bash call, and pass messages with `-F <scratchpad file>` (root `INSIGHTS.md:114-125`).
  - Commit with explicit paths; never `git add -A` while an agent runs (root `INSIGHTS.md:20-24`).
- **Fresh worktrees have no `node_modules`** (verified: none in this worktree). The first step of every group installs only what it needs:
  - `cd server && pnpm install --frozen-lockfile`
  - `cd client && pnpm install --frozen-lockfile`
  - `cd e2e && npm ci`

Main-session procedure:
1. Run Group 0 (chunk 0). Then run test-writer (test-first) for the server and client unit/it tests. Every new test must be red on missing behaviour, and the typecheck must be green.
2. Make a **temporary WIP commit** on `feat/spec-02-onboarding-generator`. It must include Group 0 files and red tests, explicit paths. A new worktree only sees committed state.
3. Create the group worktrees:
   - `/opt/homebrew/bin/git worktree add -b feat/spec-02-server .claude/worktrees/spec-02-server feat/spec-02-onboarding-generator`
   - same for `-b feat/spec-02-client .claude/worktrees/spec-02-client`
4. Launch S-1 in the server worktree and C-1 in the client worktree at the same time, then S-2 ∥ C-2, then S-3.
   - Each implementer prompt names its worktree as the working dir.
   - After each chunk the main session commits that worktree's changes on its group branch (explicit paths). Implementers never commit.
5. **Fallback.**
   - If an implementer is refused writes in its worktree ("Edit the worktree copy of this file instead" — root `INSIGHTS.md:118`), drop that group's worktree.
   - Re-run its remaining chunks **in the feature worktree**. Paths are disjoint from the other group, so S and C can still run at the same time there.
6. Merge `feat/spec-02-server`, then `feat/spec-02-client`, into the feature branch with `--no-ff`. No conflicts are expected because files are disjoint. Then remove both worktrees and branches.
7. Run Group E (test-writer e2e) in the feature worktree.
8. Before the stage commit:
   - `/opt/homebrew/bin/git reset --soft <"- plan" commit>` to fold the WIP and merge commits.
   - Commit production paths as "Onboarding Generator - code".
   - Commit test files, the e2e flow and flow docs as "Onboarding Generator - tests & review" after review.

| Group | Chunk | Steps | Owned files | Depends on | Merge order |
|---|---|---|---|---|---|
| 0 | 0 | 0.1, 0.2, 0.3 (Skeleton) | **server:** both `*/src/vendor/shared/contracts/knowledge.ts`, both `*/src/vendor/shared/adapters.ts`, `server/src/adapters/mocks.ts`, `server/src/adapters/git/simple-git.ts` (stub only), `server/test/contracts.test.ts`, `server/src/modules/repo-intel/{types,index,service,helpers}.ts` (stubs + `isJunkPath` move), `server/src/modules/onboarding/{routes,service,repository,constants,model,helpers}.ts` (stubs), `server/src/modules/index.ts`, `server/src/platform/container.ts` (stub `llmNoRetry`), `server/src/adapters/llm/{openai,anthropic}.ts` (constructor option, no behaviour) — **client:** `client/package.json` + `client/pnpm-lock.yaml` (via `pnpm add mermaid`), `client/messages/en/onboarding.json`, `client/src/lib/api/onboarding.ts`, `client/src/app/(shell)/repos/[repoId]/onboarding/page.tsx`, `.../onboarding/_components/{OnboardingView,MermaidDiagram}/{X.tsx,index.ts}` (stubs), `.../onboarding/_lib/tour.ts` (stubs) | — | 1 (feature worktree) |
| T | T | test-writer (test-first) | all test files in Test plan except e2e and `contracts.test.ts` | 0 | 1 (feature worktree, WIP commit) |
| S | S-1 | S1, S2 | `server/src/modules/repo-intel/{facts.ts (new),helpers.ts,service.ts,types.ts,index.ts}`, `server/src/adapters/git/simple-git.ts` | T | 2 (worktree `spec-02-server`) |
| S | S-2 | S3, S4 | `server/src/modules/onboarding/{constants,model,helpers}.ts`, `server/src/prompts/onboarding.system.md` | S-1 | 2 |
| S | S-3 | S5, S6 | `server/src/platform/container.ts`, `server/src/adapters/llm/{openai,anthropic}.ts`, `server/src/modules/onboarding/{service,repository,routes}.ts` | S-2 | 2 |
| C | C-1 | C1, C2 | `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts`, `client/src/lib/api/onboarding.ts`, `.../onboarding/page.tsx`, `.../onboarding/_components/{MermaidDiagram,TourSection,StatusBanner}/**` (non-test) | T | 3 (worktree `spec-02-client`) |
| C | C-2 | C3, C4 | `.../onboarding/_components/{OnboardingView,CriticalPaths,HowToRun,ReadingPath,FirstTasks}/**` (non-test), `.../onboarding/_lib/tour.ts` | C-1 | 3 |
| E | E | E1 | `e2e/flows/09-onboarding-tour.flow.json`, `e2e/flows-docs/09-onboarding-tour.md` | S, C merged | 4 (feature worktree) |

Each group has a disjoint set of non-test files. Only test-writer edits test files.

## Test mode
**test-first.**
- test-writer writes the `[verify: unit | it]` tests from the ACs after Step 0.
- The implementer makes them green and never edits them.
- test-writer (e2e) writes the `[verify: e2e]` flow after S and C are merged.
- Chosen because the user prefers it, and because every seam can be derived from the spec's contract tables and the fixed signatures below.

## Test seams
| Seam | Kind | Shape | Pinned by |
|---|---|---|---|
| `GET /repos/:id/onboarding` | route | 200 `OnboardingState` (spec § Contracts); 404 `{error:{code:'not_found'}}` | AC-4, AC-13, AC-20, AC-21, AC-23, EC-3, EC-17, NFR-9 |
| `POST /repos/:id/onboarding/generate` | route | no body; 200 `OnboardingGenerateResult` `{tour, failed_attempt}`; 404 `not_found`; 409 `no_clone`; 409 `generation_in_progress` | AC-15…AC-22, AC-41…AC-49, AC-56, AC-57, EC-1, EC-2, EC-10, EC-11 |
| `knowledge.ts` contracts (both copies) | contract | `OnboardingStatus = enum(full,partial,skeleton)`; `OnboardingSkeletonReason = enum(timeout,rate_limited,provider_error,no_api_key,invalid_output)`; `OnboardingNote = enum(index_partial,index_degraded,graph_unavailable,hotness_unavailable,files_bounded)`; `OnboardingComplexity = enum(Low,Medium,High)`; `Onboarding` = exactly the spec field table, with `.max()` on arrays (6/8/10/5) and strings (body 4000, diagram 3000, reason 300, title 120, command 300); `OnboardingState`; `OnboardingFailedAttempt`; `OnboardingGenerateResult`. Old `OnboardingLink`/`OnboardingSection` removed. | spec § Contracts, NFR-8 |
| `RepoIntel.collectFacts(repoId: string): Promise<RepoFacts>` | function (facade, `repo-intel/types.ts`, implemented in `RepoIntelService`) | `RepoFacts` = `{ commitSha: string; indexStatus: IndexStatus \| 'missing'; filesTotal: number; filesIndexed: number; filesBounded: boolean; stack: { languages: {ext: string; files: number}[] /* files desc, ext asc */; packageManager: 'npm'\|'pnpm'\|'yarn'\|'bun'\|null; frameworks: string[] }; structure: {dir: string; files: number}[] /* dir asc */; routes: string[] /* "METHOD /path", sorted, deduped */; scripts: { manifests: {dir: string \| null; scripts: string[]}[] /* dir asc, root(null) first */; makeTargets: string[]; composeServices: string[]; hasCompose: boolean; envExampleNames: string[]; hasEnvExample: boolean; readmeCommands: string[] }; graph: { files: {path: string; pagerank: number; percentile: number; importedBy: number}[]; edges: {from: string; to: string}[] }; readme: { text: string \| null; links: string[] /* existing repo-relative files, in order */ }; entryPoints: string[]; rootFiles: string[] /* asc */; repoMap: string }`. Never throws; with no clone → empty facts, `indexStatus` from state. | AC-25, AC-26, AC-32, AC-33, AC-34, AC-60, EC-4, EC-5, EC-6, EC-16 |
| `RepoIntel.getHotness(repoId: string, opts?: { timeoutMs?: number; now?: Date }): Promise<{ byPath: Record<string, number>; available: boolean }>` | function (facade) | hotness ∈ [0,1] per indexed path; `available:false` + all 0 on fetch/log failure or timeout (default 15 000 ms) | AC-27, AC-29, EC-12, EC-13, NFR-2 |
| `GitClient.recentCommitPaths(repo: RepoRef, branch: string, opts: { maxCommits: number; sinceDays: number; timeoutMs: number }): Promise<string[][]>` | port (both `adapters.ts`) + `SimpleGitClient` + `MockGitClient` | one array of touched repo-relative paths per commit, newest first; throws on fetch/log failure. `MockGitOptions.commitPaths?: string[][] \| Error` (Error → reject). | AC-27, AC-29 |
| `isJunkPath(path: string): boolean` | function, `repo-intel/helpers.ts`, exported from `repo-intel/index.ts` | moved verbatim from `repo-intel/service.ts:718-738` | AC-28 |
| `onboarding/model.ts` | pure functions | `rankFiles(facts: RepoFacts, hotness: Record<string,number>): RankedFile[]` (`{path,pagerank,hotness,rank,percentile,importedBy}`, rank = pagerank×(1+hotness), sorted rank desc, path asc) · `selectReadingPath(facts, hotness): ReadingPathItem[]` (≤10, wire shape `{path,reason,rank,hotness}` with deterministic reason) · `selectCriticalPaths(facts, hotness): CriticalPathItem[]` (≤6, `{path,reason}` deterministic reason) · `tourNotes(facts: RepoFacts, hotnessAvailable: boolean): OnboardingNote[]` (fixed order: index_partial\|index_degraded, graph_unavailable, hotness_unavailable, files_bounded) · `tourStatus(llmSucceeded: boolean, notes: OnboardingNote[]): OnboardingStatus` · `isCandidateCommand(facts, command: string, cwd: string \| null): string \| null \| false` (returns the canonical cwd, or false) · `skeletonCommands(facts): HowToRunItem[]` · `buildSkeletonSections(facts, hotness): TourSections` where `TourSections = Pick<Onboarding,'architecture'\|'critical_paths'\|'how_to_run'\|'reading_path'\|'first_tasks'>` | AC-28, AC-30, AC-31, AC-33, AC-34, AC-37, AC-42, AC-47, EC-4, EC-12, EC-16 |
| `onboarding/helpers.ts` | pure functions + schema | `TourLlmOutput` (Zod: `{architecture:{body:string; diagram:string\|null}; critical_path_reasons:{path,reason}[]; reading_path_reasons:{path,reason}[]; how_to_run:{command,comment:string\|null,cwd:string\|null}[]; first_tasks:{title,scope_path,complexity:'Low'\|'Medium'\|'High'}[]}`) · `groundOutput(out: TourLlmOutput, skeleton: TourSections, facts: RepoFacts, scopeExists: (path: string) => boolean): { sections: TourSections; dropped: number }` · `buildPrompt(facts: RepoFacts, skeleton: TourSections, system: string, tokenizer: { count(s: string): number; truncate(s: string, n: number): string }): { messages: ChatMessage[]; inputTokens: number }` · `classifyLlmError(err: unknown): OnboardingSkeletonReason` · `isSafeRepoPath(p: string): boolean` | AC-36…AC-41, AC-59, AC-60, AC-61, EC-7, EC-8, EC-9, EC-15, NFR-3, NFR-8 |
| `OnboardingService` (`onboarding/service.ts`) | class | `new OnboardingService(container: Container, log?: Logger, opts?: { timeoutMs?: number; historyTimeoutMs?: number })`; `getState(workspaceId, repoId): Promise<OnboardingState>`; `generate(workspaceId, repoId): Promise<OnboardingGenerateResult>`. `Logger` is structural `{info,warn,error}`. The opts let it-tests shorten the 120 s / 15 s limits. | AC-19, AC-49, NFR-1, NFR-5 |
| `Container.llmNoRetry(id: 'openai'\|'anthropic'\|'openrouter', timeoutMs: number): Promise<LLMProvider>` | function | `overrides.llm[id]` wins; otherwise a NEW (uncached) provider with SDK retries 0, no `withRetry`, SDK timeout = `timeoutMs`; missing key → `ConfigError` (as `llm()`) | AC-35, NFR-4, EC-10 |
| `OpenAIProvider(key, opts?: { maxRetries?: number; timeoutMs?: number })`, `AnthropicProvider(key, opts?: { maxRetries?: number; timeoutMs?: number })` | adapters | `maxRetries: 0` → SDK `maxRetries: 0` and `withRetry` skipped; `timeoutMs` → SDK client `timeout` and the default for `withTimeout` when the request has no `timeoutMs`. Defaults unchanged. SDK reads `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` env, so a localhost stub can count requests. | AC-35, NFR-4 |
| `client/src/lib/api/onboarding.ts` | data hooks | `onboardingKeys.state(repoId)`; `useOnboarding(repoId)` → query of `OnboardingState`; `useGenerateOnboarding(repoId)` → mutation returning `OnboardingGenerateResult`, which on success writes `state.tour` into the query cache | AC-15, AC-18 |
| `OnboardingView({ repoId }: { repoId: string })` | component, `client/src/app/(shell)/repos/[repoId]/onboarding/_components/OnboardingView/OnboardingView.tsx` | Tests mock `@/lib/api/onboarding`, `@/lib/api/repos` (`useRefreshRepo`), `@/lib/repo-context` (`useActiveRepo` → `{activeRepo:{id,name,full_name}}`), `@/components/app-shell` (`ShellCrumb`), `@/lib/toast` (`useToast` → `{toast}`), `mermaid`; wrap in `NextIntlClientProvider` with `onboarding` messages. Uses `navigator.clipboard.writeText`. A generate error with `ApiError.status 404` renders `RepoNotFound`. | AC-4…AC-7, AC-9…AC-16, AC-18, AC-21, AC-23, AC-45, AC-46, AC-48, AC-50…AC-52, AC-54, AC-55, EC-1, EC-2, EC-3, EC-17, EC-18, NFR-6, NFR-7 |
| `MermaidDiagram({ chart }: { chart: string })` | component, `.../onboarding/_components/MermaidDiagram/` | lazy `import("mermaid")`; `initialize({ startOnLoad:false, securityLevel:'strict', htmlLabels:false, flowchart:{ htmlLabels:false } })`; invalid → renders nothing; wrapper `role="img"` `aria-label` = message `onboarding.diagramAlt` passed as prop `label` (signature `{ chart: string; label: string }`) | AC-8, AC-62, EC-9, NFR-6 |
| `.../onboarding/_lib/tour.ts` | pure functions | `githubBlobUrl(repoFullName: string, commitSha: string, path: string): string` (segment-wise `encodeURIComponent`) · `tourToMarkdown(tour: Onboarding, text: { heading: string; headerLine: string; bannerLines: string[]; sectionTitles: string[] /* 5, tour order */ }): string` | AC-53, AC-55, EC-5, EC-14 |
| NAV item | constant | `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "Workflow", href: "/repos/:repoId/onboarding" }` in `NAV[0].items` between `pulls` and `context` | AC-1 |
| `activeKeyFor(pathname)` | function | `/repos/<id>/onboarding…` → `"onboarding-tour"`; `/onboarding` → `""` | AC-2, AC-3 |
| `client/messages/en/onboarding.json` | i18n | keys listed in Step 0.3 (exact strings) | NFR-7, all client copy |

## Decisions
- **D1 Single LLM request (AC-35, NFR-4) without changing reviewer-core.**
  - Today every provider retries:
    - OpenRouter: SDK `maxRetries: 2` (`reviewer-core/src/llm/openrouter.ts:55`) plus a schema-repair loop driven by `req.maxRetries`, default 2 (`:61-114`).
    - OpenAI and Anthropic: `withRetry` plus the SDK default retries (`server/src/adapters/llm/openai.ts:97`).
  - `OpenRouterProvider` already accepts `{ maxRetries, timeoutMs }` in its constructor (`openrouter.ts:33-34,51-56`).
  - So: `Container.llmNoRetry(id, timeoutMs)` builds an uncached provider with SDK retries 0 and an SDK timeout ≥ 120 s (the default 90 s would fire before AC-49's limit). The two server adapters get a `maxRetries` option. The service sends `maxRetries: 0` (repair off) and still bounds the call with `Promise.race` at 120 s (`server/INSIGHTS.md:178-182`).
  - **No spec deviation.** Planner decision; the code settles it, so no brainstorm.
- **D2 Sidebar label and NFR-7** (user decision 2).
  - The NAV item gets the hard-coded label "Onboarding Tour", like every other item and like SPEC-01's "Project Context" (`client/src/vendor/ui/nav.ts:21-37`).
  - The `shell.nav.onboarding-tour` key already exists (`client/messages/en/shell.json`) and stays the i18n source for the command palette (`useShellCommands.ts:24`).
  - NFR-7 is therefore read as: page copy comes from `onboarding`; the sidebar label follows the kit's NAV convention.
- **D3 Storage.** Reuse the `onboarding` table (`server/src/db/schema/context.ts:167-173`: `repo_id` PK with FK `ON DELETE CASCADE`, `json` jsonb, `generated_at`).
  - The whole `Onboarding` wire object goes in `json`.
  - **No migration.**
  - AC-24 is met by the existing cascade. EC-3: a row that fails `Onboarding.safeParse` on read → `tour: null`.
- **D4 Single-run lock (AC-19/20).** An in-memory `Set<repoId>` on the `OnboardingService` instance. Exactly **one** instance is created at plugin-registration scope in `routes.ts` (module body of the plugin function, not per request), so every request of the app shares the lock. The server is one process. The repo is added to the set after the 404/no_clone checks and removed in `finally`.
- **D5 Hotness history (AC-27/29).**
  - New port method `recentCommitPaths`: `git fetch origin <defaultBranch> --depth <200>` (deepens the shallow clone; offline → throws).
  - Then `git log FETCH_HEAD -n 200 --since="90 days ago" --name-only --format=%x00%H`.
  - Run through simple-git with `abort: AbortSignal.timeout(timeoutMs)` (simple-git 3.x supports `abort`). The service also wraps it in `withTimeout(…, 15 000)`.
  - Hotness = count / max, or 0 everywhere when max = 0 (EC-12, no note).
- **D6 Clone and commit rules.** See Requirements review gaps 5–6.
- **D7 Fact parsing is done by hand, with no new dependency.**
  - The compose services parser reads the top-level `services:` block and its 2-space (or first-indent) child keys. `// ponytail:` comment: no YAML lib; anchors and nesting edge cases are not supported; add `yaml` if real repos break it.
  - Makefile targets: `^([A-Za-z0-9][\w.-]*)\s*:(?!=)`, excluding `.PHONY` and the like.
  - `.env.example`: `^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=`. **Only names are kept** (AC-60).

## Insights applied
- `server/INSIGHTS.md:178-182` — `timeoutMs` does not bound `completeStructured` → D1, plus the 120 s `Promise.race` in Step S6.
- `server/INSIGHTS.md:247-251` — the onboarding default model is `openrouter`. Every new it-test overrides `llm: { openrouter, openai, anthropic }` with `MockLLMProvider` and `secrets` with `MockSecretsProvider` (no keys) → NFR-10.
- `server/INSIGHTS.md:241-245` — cross-module imports go through `index.ts`. `onboarding/model.ts` imports `isJunkPath`/`RepoFacts` from `../repo-intel/index.js`. The service reaches settings via `../settings/index.js` and repo-intel via `container.repoIntel`.
- `server/INSIGHTS.md:267-271` — call the tokenizer with untrusted text. The `TiktokenTokenizer` adapter already handles special tokens (`encode(text, [], [])`). Use `container.tokenizer` and never a raw encoder.
- `server/INSIGHTS.md:261-265` — an it-run where `skipped > 0` while Docker is up counts as a failure.
- `client/INSIGHTS.md:117-130` — restore `MermaidDiagram` from `0f44c32^` next to its only consumer, and add `mermaid` with `pnpm add`.
- `client/INSIGHTS.md:52-56` — use `fireEvent`; `userEvent` is not installed.
- `client/INSIGHTS.md:97-101` — use braces in `beforeEach` mock setup.
- `client/INSIGHTS.md:64-74` — never run `pnpm build` or `scripts/e2e.sh` while a dev server is running.
- `e2e/INSIGHTS.md:22-34` — keyless hermetic run: the flow asserts the `no_api_key` skeleton. Use `set viewport 1280 2400`.
- Root `INSIGHTS.md:56-60` — e2e uses npm. Root `INSIGHTS.md:114-125` and `:20-24` — git path, explicit-path commits, worktree fallback.

## Constraints
- Do not touch the migrations dir. **No migration in this plan** (`server/CLAUDE.md` Do not touch; `server/INSIGHTS.md:275-281`).
- Both `vendor/shared` copies change together and must be byte-identical. After Step 0.1, `diff server/src/vendor/shared/contracts/knowledge.ts client/src/vendor/shared/contracts/knowledge.ts` and the same for `adapters.ts` must be empty (root `CLAUDE.md` Do not touch; `guards.sh:32-43`).
- Lock files change only via `pnpm add` / `pnpm install` (root `CLAUDE.md`).
- `pnpm arch` must stay green in server and client. Never run `arch:baseline` (`onion-architecture/SKILL.md` Overview).
- Contracts: snake_case wire fields, PascalCase Zod export plus a same-named `z.infer` type (root `CLAUDE.md` § Naming).
- i18n: namespace = filename `messages/en/onboarding.json` (root `CLAUDE.md` § Naming).
- Client styling: `styles.ts` with inline `CSSProperties`, no Tailwind classes in JSX (`client/CLAUDE.md` § Naming).
- Tests:
  - client tests are co-located;
  - server tests go in `server/test/`;
  - `*.it.test.ts` self-skip via `dockerAvailable()` (root `CLAUDE.md` § Naming).
- Repo code is never executed. Commands are display/copy only (spec § Untrusted inputs). git runs via simple-git's `execFile` path only (`security/SKILL.md` § Command Injection).

## Skills for implementer
| Files (glob) | Skills | Key rules (source) |
|---|---|---|
| `server/src/modules/onboarding/**`, `server/src/modules/repo-intel/**`, `server/src/platform/container.ts`, `server/src/adapters/**` | onion-architecture | New module = `routes.ts`/`service.ts`/`repository.ts`/`helpers.ts`/`model.ts`/`constants.ts`, registered in `modules/index.ts`. Pure rules live in `model.ts`/`helpers.ts` with no db/adapters/container import (`onion-architecture/SKILL.md` § Step 2: place it; `tools.md` § dependency-cruiser). Another module only via `index.ts` or `container.*` (`SKILL.md` § Step 2, 8th bullet). Service logs via a structural `Logger` passed from the route (`tools.md` § Fastify, "Logging from services"). Port + adapter + mock + container getter for the new git capability (`tools.md` § External SDKs). No external I/O inside a tx; there is no tx here (`SKILL.md` § Transactions). |
| `server/src/modules/onboarding/routes.ts`, `server/src/platform/container.ts` | fastify-best-practices | Handler = Zod params → `getContext` → one service call. Errors are `AppError` subclasses serialized by the global handler; no try/catch in routes (`onion-architecture/tools.md` § Fastify, "Handler shape" / "Errors"; `fastify-best-practices/rules/error-handling.md`). |
| `server/src/modules/onboarding/repository.ts` | drizzle-orm-patterns | Workspace scope in the SQL `where` (join `repos.workspace_id`). Repo returns rows/`undefined`/`boolean` and never throws `NotFoundError` (`onion-architecture/tools.md` § Drizzle). Upsert via `onConflictDoUpdate` on PK `repo_id` (`drizzle-orm-patterns/references/common-patterns.md`). |
| `*/src/vendor/shared/contracts/knowledge.ts` | zod | `schema-use-enums`, `object-optional-vs-nullable` (nullable, not optional, for spec "\| null" fields), `type-export-schemas-and-types` (`zod/SKILL.md` Quick Reference §1, §3, §5). Parse at the edge only: `Onboarding.safeParse` on DB read (EC-3) and `TourLlmOutput` via the provider (`onion-architecture/tools.md` § Zod). |
| every non-test `.ts/.tsx` | security | Prompt injection: repo text only inside `wrapUntrusted` blocks with constant labels; LLM output untrusted, grounded; no `dangerouslySetInnerHTML` except mermaid's sanitized SVG under `securityLevel:'strict'`; links `rel="noopener noreferrer"` + `target="_blank"`, URL built only from contract fields with encoded segments; never log prompt/file content/secrets (`security/SKILL.md` § A05 XSS, § Agentic AI Security, § A09). |
| `client/src/**/*.{ts,tsx}` | frontend-ui-architecture, react-best-practices | Data access in `lib/api/onboarding.ts` (key factory + hooks, schema-parsed) (`frontend-ui-architecture/SKILL.md` § Step 1, "Data access"). Mermaid adapter next to its only consumer (§ Step 1, "Adapter"). Pure markdown/URL logic in `onboarding/_lib/tour.ts`, no React. Derive, don't store; `useEffect` only for the elapsed-seconds timer and mermaid rendering; components ≤200 lines; a11y: `aria-live="polite"`, icon-button labels (`react-best-practices/SKILL.md` § Derive, Don't Store; § Hooks; § Accessibility). |
| `client/src/app/**` | next-best-practices | `"use client"` on page and view, like `conventions/page.tsx`; `useParams` in the page (`next-best-practices/SKILL.md` § RSC Boundaries, § Suspense Boundaries). |
| `client/**/*.test.{ts,tsx}` (test-writer) | react-testing-library | Role queries first; flow tests; `vi.useFakeTimers` for "Copied" 2 s and the elapsed counter (`react-testing-library/SKILL.md` § Query Priority, § Mocking Strategies → Timers). Use `fireEvent`, not `userEvent` (`client/INSIGHTS.md:52`). |

Unmapped skills: none.

## Steps

### Step 0.1 — Contracts, git port, mocks (Group 0, Skeleton)
- **Covers:** contract seams for AC-4, AC-17, AC-41…AC-44, AC-47, AC-57, NFR-8; port for AC-27/AC-29.
- **Files.** Modify:
  - `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts` (identical);
  - `server/src/vendor/shared/adapters.ts` and `client/src/vendor/shared/adapters.ts` (identical);
  - `server/src/adapters/mocks.ts`, `server/src/adapters/git/simple-git.ts`;
  - `server/test/contracts.test.ts` (Onboarding case only).
- **Skills:**
  - zod — `schema-use-enums`, `object-optional-vs-nullable` (`zod/SKILL.md` § Quick Reference).
  - onion-architecture — new port (`tools.md` § External SDKs: adapters behind ports).
- **Change:**
  - First run `cd server && pnpm install --frozen-lockfile` and `cd client && pnpm install --frozen-lockfile`.
  - `diff` both copies of each file before editing (they are identical today).
  - In `knowledge.ts`, replace the `// ---- Onboarding ----` block with the contracts in Test seams. Keep the `Provider` import order valid: `Provider` is declared later in the same file, so define the onboarding schemas after it or use `z.string()` for provider. Spec says `provider, model: string`, so use `z.string()`.
  - In `adapters.ts`, add `recentCommitPaths` to `GitClient` with a doc comment.
  - `MockGitClient`: `commitPaths` option.
  - `SimpleGitClient.recentCommitPaths`: `throw new Error('NotImplemented')`.
  - Update the `contracts.test.ts` Onboarding fixture to a minimal valid new-shape tour.
- **Verify:**
  - `cd server && pnpm typecheck && pnpm test -- contracts` → green.
  - `diff server/src/vendor/shared/contracts/knowledge.ts client/src/vendor/shared/contracts/knowledge.ts` → no output; same for `adapters.ts`.
- **Done when:** both copies are identical, typecheck is green in server and client, and `contracts.test.ts` passes.

### Step 0.2 — Server stubs (Group 0, Skeleton)
- **Covers:** seams only, no behaviour.
- **Files:**
  - Create `server/src/modules/onboarding/{routes,service,repository,constants,model,helpers}.ts` and `server/src/modules/repo-intel/helpers.ts`.
  - Modify `server/src/modules/repo-intel/{types,index,service}.ts`, `server/src/modules/index.ts`, `server/src/platform/container.ts`, `server/src/adapters/llm/{openai,anthropic}.ts`.
- **Skills:**
  - onion-architecture — module layout + registration (`SKILL.md` § Step 2: place it).
  - fastify-best-practices — handler shape (`onion-architecture/tools.md` § Fastify).
- **Change:**
  - `repo-intel/types.ts`: add `RepoFacts`, `HotnessResult`, and the two facade methods to `RepoIntel`.
  - `repo-intel/helpers.ts`: move `JUNK_PATH_PATTERNS` + `isJunkPath` from `service.ts:718-738` verbatim (export). `service.ts` imports it. `index.ts` adds `export * from './helpers.js'`.
  - `RepoIntelService.collectFacts`/`getHotness`: `throw new Error('NotImplemented')`.
  - `onboarding/constants.ts`: every constant listed in Step S3 (values are spec numbers).
  - `model.ts`/`helpers.ts`: exported signatures from Test seams; bodies throw `NotImplemented`. `TourLlmOutput` is defined fully (a schema is not behaviour).
  - `OnboardingService` methods throw `NotImplemented`.
  - `repository.ts`: empty class with constructor.
  - `routes.ts`: registers `GET /repos/:id/onboarding` and `POST /repos/:id/onboarding/generate` with `IdParams`; each replies `501 { error: { code: 'not_implemented' } }`.
  - Register `onboarding` in `modules/index.ts`.
  - `Container.llmNoRetry`: throw `NotImplemented`.
  - Adapters: add the `opts?: { maxRetries?: number; timeoutMs?: number }` constructor param (stored, not yet used).
  - The route plugin must not touch the DB at registration (`server/INSIGHTS.md:202-206`, `test/routes-smoke.test.ts`).
- **Verify:** `cd server && pnpm typecheck && pnpm test -- routes-smoke && pnpm arch` → green.
- **Done when:** typecheck/arch are green and both routes answer 501.

### Step 0.3 — Client stubs, messages, mermaid dep (Group 0, Skeleton)
- **Covers:** seams for client ACs; NFR-7 copy source.
- **Files:**
  - Modify `client/package.json` and `client/pnpm-lock.yaml` (only via `cd client && pnpm add mermaid`) and `client/messages/en/onboarding.json` (replace).
  - Create `client/src/lib/api/onboarding.ts`, `client/src/app/(shell)/repos/[repoId]/onboarding/page.tsx`, `.../onboarding/_components/OnboardingView/{OnboardingView.tsx,index.ts}`, `.../onboarding/_components/MermaidDiagram/{MermaidDiagram.tsx,index.ts}`, `.../onboarding/_lib/tour.ts`.
- **Skills:**
  - frontend-ui-architecture — data access module per resource (`SKILL.md` § Step 1, "Data access").
  - next-best-practices — client page like `conventions/page.tsx`.
- **Change:**
  - `pnpm add mermaid` (never hand-edit the lockfile).
  - `lib/api/onboarding.ts` is complete. It mirrors `lib/api/conventions.ts`: `api.get(..., OnboardingState)` and `api.post(..., undefined, OnboardingGenerateResult)`. Data access is not behaviour under test; tests mock it.
  - `page.tsx` is like `conventions/page.tsx` (RepoNotFound + Suspense + `<OnboardingView repoId>`).
  - `OnboardingView` returns `null`. `MermaidDiagram` returns `null`. `tour.ts` functions throw `NotImplemented`.
  - `onboarding.json` gets these exact keys and strings:

```json
{
  "heading": "Onboarding for {repo}",
  "meta": "Generated from index of {total, plural, one {# file} other {# files}} · {indexed, number} indexed · last refreshed {when}",
  "toc": "On this page",
  "sections": { "architecture": "Architecture overview", "critical": "Critical paths", "run": "How to run locally", "reading": "Guided reading path", "tasks": "First tasks" },
  "empty": {
    "title": "Generate onboarding tour",
    "body": "Builds five sections from the repository index: Architecture overview, Critical paths, How to run locally, Guided reading path and First tasks.",
    "cost": "One AI call to {provider}/{model} · up to 12,000 input tokens · up to 2 minutes",
    "cta": "Generate onboarding tour"
  },
  "noClone": { "title": "Repo not cloned yet", "body": "DevDigest needs a local clone of this repository to build the tour.", "cta": "Sync repository" },
  "regenerate": "Regenerate",
  "generating": "Generating… {seconds}s",
  "stale": "Repo changed since this tour",
  "copyMarkdown": "Copy as Markdown",
  "copiedMarkdown": "Tour copied as Markdown",
  "copyFailed": "Couldn't copy — clipboard access was blocked",
  "copyCommand": "Copy command: {command}",
  "copied": "Copied",
  "inCwd": "in {cwd}/",
  "open": "Open",
  "nothing": "Nothing to show for this section",
  "tasksSkeleton": "First tasks need the AI summary — regenerate to try again",
  "complexity": { "Low": "Low complexity", "Medium": "Medium complexity", "High": "High complexity" },
  "banner": {
    "ai": "AI-generated · {calls, plural, one {# LLM call} other {# LLM calls}} · {tokens, number} tokens · {cost}",
    "skeleton": "Skeleton — AI summary unavailable: {reason}"
  },
  "notes": {
    "index_partial": "Index is partial",
    "index_degraded": "Index unavailable",
    "graph_unavailable": "Reading path is approximate — import graph unavailable",
    "hotness_unavailable": "Reading path ranked by structure only",
    "files_bounded": "Only {count, number} source files were indexed"
  },
  "reasons": {
    "timeout": "the AI call took longer than 2 minutes",
    "rate_limited": "the AI provider is rate-limiting requests",
    "provider_error": "the AI provider returned an error",
    "no_api_key": "no API key for {provider} — add one in Settings → API Keys",
    "invalid_output": "the AI answer could not be read"
  },
  "failed": { "notice": "Regeneration failed: {reason}", "showSkeleton": "Show skeleton instead" },
  "inProgress": "A tour is already being generated for this repository",
  "diagramAlt": "Architecture diagram",
  "loadError": { "title": "Couldn’t load the onboarding tour" }
}
```

- **Verify:** `cd client && pnpm typecheck && pnpm test && pnpm arch` → green (existing suite).
- **Done when:** typecheck is green, `mermaid` is in `package.json` and the lockfile, and the messages file is in place.

> **Hand-off:** test-writer (test-first) now writes every unit/it test in the Test plan. Each must fail on `NotImplemented` / 501 / `null`, not on import or type errors. The main session makes the WIP commit and cuts the S/C worktrees.

### Step S1 — Facts collection in the repo-intel facade (Group S, chunk S-1)
- **Covers:** AC-25, AC-26, AC-32, AC-33 (indexStatus input), AC-34 (`filesBounded`), AC-60, EC-4, EC-5, EC-6, EC-16.
- **Files:** create `server/src/modules/repo-intel/facts.ts`; modify `server/src/modules/repo-intel/{helpers,service}.ts`.
- **Skills:**
  - onion-architecture — pure parsers in `helpers.ts` (no fs), I/O in `facts.ts`/`service.ts` (`SKILL.md` § Step 1 classification).
  - security — path traversal: links resolved inside the clone root only (`security/SKILL.md` § Framework Security Quirks → `path.join()`).
- **Change:**
  - `helpers.ts`, pure and deterministic. Every output is sorted per the `RepoFacts` comments.
    - `detectPackageManager`, `parsePackageJson` (scripts, deps, entry points; ignore invalid JSON), `parseMakefileTargets`, `parseComposeServices`.
    - `parseEnvExampleNames`: names only; never return values.
    - `parseReadmeShellCommands`, `parseReadmeLinks`: relative links only; drop `http(s):`, `mailto:`, `#…`; strip `#anchor`/`?query`; normalise `./`.
    - `languagesByExt`, `topLevelStructure`, `hotnessFromCommits`.
  - `facts.ts`:
    - `collectRepoFacts(root, deps)` walks the clone with `readdir(…, { recursive: true, withFileTypes: true })`, excluding `.git` only (that gives `filesTotal`).
    - Structure and languages use the same list.
    - Reads the manifests at depth ≤ 3 (skipping `EXCLUDED_DIRS`), the root `Makefile`, `docker-compose.y(a)ml` / `compose.y(a)ml`, `.env.example` and `README.md` (case-insensitive root file).
    - README links and entry points are kept only if the file exists under the root after `path.resolve` containment check.
  - `service.ts` `collectFacts`:
    - `getRepoBasics` → `git.clonePathFor`. If the clone is missing → empty facts.
    - `tryGetIndexState` (`missing` when null). `filesIndexed = state.filesIndexed`. `filesBounded = Number(state.stats?.bounded) > 0` — this needs `stats` exposed; extend `tryGetIndexState` to return `bounded`, or add a small repository read.
    - Graph:
      - `getRankedPaths(repoId, 100_000)` plus a new repository method `getRankRows(repoId)` → `{path, pagerank, percentile}`;
      - `getEdges`;
      - `importedBy` = in-degree.
    - Routes = the union of all `file_facts.endpoints`. Needs a new repository method `getAllEndpoints(repoId)`.
    - `repoMap = (await getRepoMap(repoId)).text`.
    - `commitSha` per Requirements review gap 6.
  - `RepoIntelRepository` gains `getRankRows`, `getAllEndpoints` and `bounded` exposure. Repository writes are unchanged.
- **Verify:** `cd server && pnpm test -- repo-intel-facts && pnpm typecheck && pnpm arch` → green.
- **Done when:** the red `repo-intel-facts.test.ts` is green, and identical inputs give deep-equal facts (AC-26).

### Step S2 — Hotness (Group S, chunk S-1)
- **Covers:** AC-27, AC-29, EC-12, EC-13, NFR-2 (history cap).
- **Files:** modify `server/src/adapters/git/simple-git.ts` and `server/src/modules/repo-intel/service.ts` (+ `helpers.ts` `hotnessFromCommits` if not done in S1).
- **Skills:**
  - onion-architecture — simple-git only in the adapter (`tools.md` § External SDKs).
  - security — `execFile`-style args, no shell (`security/SKILL.md` § Command Injection).
- **Change:**
  - `SimpleGitClient.recentCommitPaths` per D5. Use `simpleGit({ baseDir, abort: AbortSignal.timeout(opts.timeoutMs) })`. If the installed simple-git typings lack `abort`, fall back to `withTimeout` and say so in the report.
  - Parse the `%x00%H` / name-only output into `string[][]`.
  - `RepoIntelService.getHotness(repoId, opts)`:
    - no clone or no basics → `{ byPath: {}, available: false }`;
    - otherwise call the port with `maxCommits: 200, sinceDays: 90`. Those constants live in `repo-intel/constants.ts` as `HOTNESS_MAX_COMMITS`, `HOTNESS_RECENT_DAYS`, `HOTNESS_TIMEOUT_MS = 15_000`; leave the old `HOTNESS_WINDOW_DAYS` untouched;
    - `withTimeout` at `opts.timeoutMs ?? 15_000`;
    - catch → `available: false`;
    - `byPath` covers only indexed paths (from the rank rows) = count / max, or all 0 when max = 0.
  - Hotness is **never** written back to `file_rank` (spec Non-goal).
- **Verify:** `cd server && pnpm test -- repo-intel-hotness && pnpm typecheck && pnpm arch` → green.
- **Done when:** `repo-intel-hotness.test.ts` is green (normalisation, 200 cap passed to the port, unavailable on reject/timeout, EC-12 all-zero with `available:true`).

### Step S3 — Onboarding domain model: ranking, notes, status, skeleton, candidates (Group S, chunk S-2)
- **Covers:** AC-28, AC-30, AC-31, AC-33, AC-34, AC-37, AC-38 (candidates), AC-42, AC-47, EC-4, EC-12, EC-16.
- **Files:** modify `server/src/modules/onboarding/{constants,model}.ts`.
- **Skills:**
  - onion-architecture — domain ring, pure, no I/O, tested without mocks (`tools.md` § Tests per ring).
- **Change.** First, `constants.ts` must contain:
  - `GENERATION_TIMEOUT_MS = 120_000`, `HISTORY_TIMEOUT_MS = 15_000`
  - `MAX_INPUT_TOKENS = 12_000`, `MAX_OUTPUT_TOKENS = 4_000`
  - `READING_PATH_MAX = 10`, `CRITICAL_ROOTS = 5`, `CHAIN_MAX = 3`, `CRITICAL_MAX = 6`
  - `HOW_TO_RUN_MAX = 8`, `FIRST_TASKS_MAX = 5`
  - `BODY_MAX = 4000`, `DIAGRAM_MAX = 3000`, `REASON_MAX = 300`, `TITLE_MAX = 120`, `COMMAND_MAX = 300`
  - `PROMPT_ROUTES_MAX = 50`, `PROMPT_README_TOKENS = 4000`
  - `GENERATED_PATH_PATTERNS = ['/generated/', '__generated__/', '.generated.', '.gen.', '.min.']`
  - `README_SHELL_LANGS`
  - `UNTRUSTED_LABELS` (constants: `facts`, `reading_path`, `critical_paths`, `routes`, `readme`, `repo_map`).

  Then the model functions:
  - `rankFiles`: rank = pagerank × (1 + hotness); sort rank desc, path asc.
  - `selectReadingPath`:
    - if `graph.edges` is non-empty: ranked files, excluding `isJunkPath` or the generated patterns, top 10;
    - else the fallback order: README links → entry points → root files asc, deduped, each existing, cut to 10 (AC-31). The fallback also applies the exclusion.
    - Reason "Rank percentile {p}" (p = stored percentile; 0 in the fallback). Wire `rank`/`hotness` come from `rankFiles` (0 in the fallback).
  - `selectCriticalPaths`:
    - if edges exist: the top 5 ranked (excluded files skipped) as roots;
    - each chain follows the highest-ranked imported file not already in the chain, up to 3 files;
    - concatenate in chain order, keep distinct, cut to 6.
    - Without edges: the same fallback order cut to 6.
    - Reason "Imported by {n} indexed files" (n = `importedBy`).
  - `tourNotes`:
    - `index_partial` when status is `partial`;
    - `index_degraded` for `degraded`/`failed`/`missing`;
    - `graph_unavailable` when there are 0 edges;
    - `hotness_unavailable` when `!available`;
    - `files_bounded` when `filesBounded`.
  - `tourStatus` per AC-47.
  - `isCandidateCommand` and `skeletonCommands` per Requirements review gaps 1–2.
  - `buildSkeletonSections`:
    - architecture body = Markdown bullets: "- **Stack:** …", "- **Structure:** …", "- **Routes:** {n} HTTP endpoints"; `diagram: null`;
    - lists from the two selectors;
    - `how_to_run` from `skeletonCommands`;
    - `first_tasks: []`.
- **Verify:** `cd server && pnpm test -- onboarding-model && pnpm arch` → green.
- **Done when:** `onboarding-model.test.ts` is green.

### Step S4 — Grounding, prompt budget, error classification, system prompt (Group S, chunk S-2)
- **Covers:** AC-36, AC-37, AC-38, AC-39, AC-40, AC-41 (classification), AC-59, AC-60, AC-61, EC-7, EC-8, EC-9, EC-15, NFR-3, NFR-8.
- **Files:** modify `server/src/modules/onboarding/helpers.ts` and `server/src/prompts/onboarding.system.md` (rewrite).
- **Skills:**
  - security — LLM output is untrusted; grounding against facts; repo text in untrusted blocks (`security/SKILL.md` § Agentic AI Security).
  - onion-architecture — pure helper with injected `tokenizer`/`scopeExists` (`tools.md` § Tests per ring).
- **Change.** `groundOutput`:
  - **Architecture:** body cut to 4000. A diagram > 3000 chars → `null` and `dropped+1`. An empty diagram string → `null`.
  - **Reasons:** for each skeleton critical/reading item, take the first model reason with an exact matching path. Cut it to 300. An unsafe path (`isSafeRepoPath` false: absolute, `..` segment, a char < 0x20 or 0x7f) → `dropped+1`.
  - **Commands:** for each model command:
    - an unsafe `cwd` → drop + count;
    - `command` > 300 → drop + count;
    - `isCandidateCommand` false → drop + count;
    - otherwise keep `{command (normalised), comment (cut 300), cwd: canonical}`.
    - Keep ≤ 8; the excess is counted.
    - Zero kept → the skeleton's `how_to_run` (AC-40).
  - **Tasks:**
    - complexity must be in the enum (schema-guaranteed);
    - `scope_path` must be safe and `scopeExists`, otherwise drop + count;
    - title cut to 120;
    - first 5 kept, the rest counted.
  - `buildPrompt`:
    - system = the rendered `onboarding.system.md`;
    - the user message is the blocks in priority order (EC-7): deterministic file lists (reading + critical paths with reasons), scripts (incl. env var **names** only and candidate commands), stack + structure, routes (first 50), README (truncated to 4000 tokens), repo map;
    - each block goes through `wrapUntrusted(<constant label>, text)` (from `platform/prompt.js`);
    - blocks are added while `count(system + user) ≤ 12 000`; the first block that does not fit is truncated with `tokenizer.truncate`, and later blocks are dropped;
    - returns `inputTokens`.
  - `classifyLlmError`:
    - our `TimeoutError` (`platform/resilience.ts`), or an SDK timeout (`name` includes `Timeout`) → `timeout`;
    - `status === 429` → `rate_limited`;
    - `ConfigError` whose message contains `API_KEY` → `no_api_key`;
    - `ZodError`, or a message matching `/schema validation|no choices|JSON/i` → `invalid_output`;
    - otherwise `provider_error`.
  - Rewrite `onboarding.system.md`:
    - the output fields of `TourLlmOutput`;
    - one reason per **listed** path;
    - commands only from the provided candidates;
    - ≤ 5 tasks with complexity Low/Medium/High and real scope paths;
    - Markdown only, no HTML;
    - mermaid rules (keep the existing ones);
    - the `<untrusted>` security paragraph (keep);
    - English only (spec Non-goals).
- **Verify:** `cd server && pnpm test -- onboarding-grounding onboarding-prompt && pnpm arch` → green.
- **Done when:** both test files are green.

### Step S5 — No-retry LLM providers (Group S, chunk S-3)
- **Covers:** AC-35, NFR-4, EC-10, EC-11.
- **Files:** modify `server/src/platform/container.ts` and `server/src/adapters/llm/{openai,anthropic}.ts`.
- **Skills:**
  - onion-architecture — only the composition root `new`s adapters; secrets are read in the container (`tools.md` § External SDKs step 4).
- **Change:**
  - Adapters: when `opts.maxRetries` is set, pass `maxRetries` to the SDK client (`new OpenAI({ apiKey, maxRetries, timeout: opts.timeoutMs })`, the same for Anthropic) and call `withRetry(fn, { retries: opts.maxRetries })`. Retries 0 → a single attempt. `opts.timeoutMs` also replaces `DEFAULT_TIMEOUT` (60 s, `openai.ts:15`) in `withTimeout` when the request has no `timeoutMs`.
  - `Container.llmNoRetry(id, timeoutMs)`:
    - an injected `overrides.llm[id]` wins;
    - otherwise read the key exactly like `buildLlm`, with the same `ConfigError` messages;
    - openrouter → `new OpenRouterProvider(key, { maxRetries: 0, timeoutMs, estimateCost: priceBook })`;
    - openai/anthropic → `new XProvider(key, { maxRetries: 0, timeoutMs })`;
    - **not cached**, so the shared `llm()` clients keep their retries.
  - Existing callers are unchanged.
- **Verify:** `cd server && pnpm test -- llm-no-retry && pnpm typecheck && pnpm arch` → green.
- **Done when:** `llm-no-retry.test.ts` is green. It uses a localhost HTTP stub answering 429 and invalid JSON, reached via `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` / `OpenRouterProvider` `baseURL`, and proves exactly one request each.

### Step S6 — Onboarding service, repository, routes, log line (Group S, chunk S-3)
- **Covers:** AC-17, AC-19, AC-20, AC-22, AC-24, AC-25 (it), AC-29 (it), AC-32, AC-35 (it), AC-41 (it), AC-43, AC-44, AC-49, AC-56, AC-57, EC-1 (server), EC-2, EC-3, EC-6, EC-10, EC-11, EC-17, NFR-1, NFR-2 (it), NFR-4, NFR-5, NFR-9, NFR-10.
- **Files:** modify `server/src/modules/onboarding/{service,repository,routes}.ts`.
- **Skills:**
  - onion-architecture — service orchestrates; repo scoped by workspace in SQL; no `drizzle-orm` outside the repository (`SKILL.md` § Step 2; `tools.md` § Drizzle).
  - fastify-best-practices — thin routes; `AppError` subclasses (`onion-architecture/tools.md` § Fastify).
  - drizzle-orm-patterns — upsert on PK (`references/common-patterns.md`).
- **Change.**
  - **Repository** (`onboarding` table is owned by this module):
    - `repoInWorkspace(ws, repoId)` → `{owner, name, fullName, defaultBranch}` or `undefined`;
    - `getTour(ws, repoId)` → `{ json, generatedAt }` or `undefined` (join `repos` on workspace);
    - `upsertTour(repoId, json, generatedAt)` → `boolean` (`false` on PG `23503` FK violation, i.e. the repo was deleted).
  - **`getState`:**
    - 404 if not in the workspace;
    - `clone_status` per Requirements review gap 5;
    - `generating = lock.has(repoId)`;
    - `current_commit_sha = state.lastIndexedSha || null` (via `container.repoIntel.getIndexState`);
    - `model = resolveFeatureModel(container, ws, 'onboarding')`;
    - `tour = Onboarding.safeParse(row.json).success ? data : null` (EC-3).
  - **`generate`** (start timer: `deadline = start + timeoutMs`, one deadline for the whole generation, AC-49/NFR-1; every exit goes through one `logGeneration(...)` call in `finally`):
    1. Not in the workspace → `NotFoundError` (log rejected/not_found).
    2. No clone → `AppError('no_clone', …, 409)`.
    3. `lock.has` → `AppError('generation_in_progress', …, 409)`. Then add to the lock; `finally` deletes it.
    4. `facts = repoIntel.collectFacts`, `hot = repoIntel.getHotness(repoId, { timeoutMs: min(historyTimeoutMs, deadline - now) })`, `notes`, `skeleton = buildSkeletonSections`.
    5. `choice = resolveFeatureModel(…,'onboarding')`.
    6. `remaining = deadline - Date.now()`. If `remaining <= 0` → go to the failure path with reason `timeout` and `llmCalls` 0 (no request is sent). Otherwise `try { llm = await container.llmNoRetry(choice.provider, remaining + 5_000); llmCalls = 1; res = await Promise.race([llm.completeStructured({ model, schema: TourLlmOutput, schemaName: 'OnboardingTour', messages, temperature: 0, maxTokens: 4000, maxRetries: 0, timeoutMs: remaining }), timer(remaining) → TimeoutError]) }`. The SDK timeout gets `remaining + 5 s` so our race always fires first. `llmCalls` is set only after the provider resolves; a `ConfigError` keeps it 0 (EC-10).
    7. On success:
       - `groundOutput(..., scopeExists = existsSync-style check under the clone root via `stat` on `join(root, p)` or its parent dir)`;
       - status = `tourStatus(true, notes)`;
       - tokens/cost from the result, `cost_usd` rounded to 6 dp;
       - `upsertTour` (false → `NotFoundError`, EC-2);
       - return `{ tour, failed_attempt: null }`.
    8. On failure:
       - `reason = classifyLlmError`;
       - skeleton tour (status `skeleton`, `skeleton_reason`);
       - if the stored valid tour has status full/partial → return `{ tour: stored, failed_attempt: { reason, skeleton } }` without storing (AC-44);
       - else `upsertTour(skeleton)` → `{ tour: skeleton, failed_attempt: null }` (AC-43).
    9. `duration_ms` = the whole generation.
  - **Log:** `log.info({ repo, repo_id, provider, model, llm_calls, tokens_in, tokens_out, cost_usd, duration_ms, status, reason, dropped_items }, 'onboarding generation')`. Exactly once per request. No prompt, no file content, no keys (NFR-5).
  - **Routes:** `const service = new OnboardingService(app.container, app.log)` is created **once**, in the plugin function body before the `app.get`/`app.post` calls (as in `conventions/routes.ts:19`), never inside a handler (D4). Both handlers → `getContext` → one service call on that shared instance.
- **Verify:** `cd server && pnpm typecheck && pnpm test && pnpm arch` (full suite once per chunk; Docker up; `skipped` must be 0 for the onboarding it-file) → green.
- **Done when:** `onboarding.it.test.ts` and the whole server suite are green and arch is clean.

### Step C1 — NAV, active key, data hooks (Group C, chunk C-1)
- **Covers:** AC-1, AC-2, AC-3, AC-15 (one request), AC-18 (cache update).
- **Files:** modify `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts`, `client/src/lib/api/onboarding.ts` (if test-writer's tests require adjustments to its contract — **no** behaviour change beyond the seams).
- **Skills:**
  - frontend-ui-architecture — NAV lives in the UI kit, consumed by Sidebar (`SKILL.md` § Step 2).
- **Change:**
  - Insert the NAV item from Test seams between `pulls` and `context`. `Workflow` is an existing `IconName` (`client/src/vendor/ui/icons.tsx`).
  - `activeKeyFor`: replace `pathname.includes("/onboarding")` with `/^\/repos\/[^/]+\/onboarding(\/|$)/.test(pathname)`, placed before the `/context` check.
- **Verify:** `cd client && pnpm test -- nav helpers && pnpm typecheck` → green.
- **Done when:** `nav.test.ts` and `app-shell/helpers.test.ts` are green.

### Step C2 — MermaidDiagram adapter + section frame + banner (Group C, chunk C-1)
- **Covers:** AC-6, AC-7, AC-8, AC-48, AC-62, EC-9, NFR-6 (headers `aria-expanded`/`aria-controls`, diagram alt, badge contrast), NFR-7.
- **Files:** create/modify:
  - `.../onboarding/_components/MermaidDiagram/{MermaidDiagram.tsx,index.ts,styles.ts}`
  - `.../onboarding/_components/TourSection/{TourSection.tsx,index.ts,styles.ts}`
  - `.../onboarding/_components/StatusBanner/{StatusBanner.tsx,index.ts,styles.ts}`
- **Skills:**
  - frontend-ui-architecture — adapter next to its consumer (`SKILL.md` § Step 1, "Adapter").
  - react-best-practices — `useEffect` only for the external system (mermaid); accessible buttons (§ Hooks, § Accessibility).
  - security — mermaid `securityLevel:'strict'`, `htmlLabels:false` (`security/SKILL.md` § A05 XSS).
- **Change:**
  - **MermaidDiagram:** restore the body from `git show 0f44c32^:client/src/components/mermaid-diagram/MermaidDiagram.tsx` (`client/INSIGHTS.md:117-130`). Add `htmlLabels: false` and `flowchart: { htmlLabels: false }` to `initialize`. Add the `label` prop with `role="img"` + `aria-label`. Move the inline style into `styles.ts`.
  - **TourSection** (`{ id, title, children }`):
    - the header is a `<button aria-expanded aria-controls={id+"-body"} id={id}>`;
    - Enter/Space come native from `<button>`;
    - expanded on mount;
    - the header element is focusable (`tabIndex={-1}` on the `<section>` or the button itself) for AC-5.
  - **StatusBanner** (`{ tour }`):
    - `full` → `banner.ai`;
    - `partial` → `banner.ai` + one line per note;
    - `skeleton` → `banner.skeleton` (reason text from `reasons.*`; `no_api_key` gets `{provider}`) + note lines;
    - `files_bounded` gets `{count: files_indexed}`;
    - cost param: `cost_usd == null ? "—" : "$" + cost_usd`;
    - contrast ≥ 4.5:1 using kit tokens (`var(--text-primary)` on the elevated bg).
- **Verify:** `cd client && pnpm test -- MermaidDiagram && pnpm typecheck && pnpm arch` → green.
- **Done when:** `MermaidDiagram.test.tsx` is green; banner/section behaviour is covered via OnboardingView tests in C3.

### Step C3 — OnboardingView: states, generation flow, failed attempt (Group C, chunk C-2)
- **Covers:** AC-4, AC-5, AC-9, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-18, AC-21, AC-23, AC-45, AC-46, EC-1, EC-2, EC-3, EC-17, NFR-6, NFR-7.
- **Files:** modify `.../onboarding/_components/OnboardingView/{OnboardingView.tsx,styles.ts,index.ts}`; create `.../_components/{CriticalPaths,ReadingPath,FirstTasks}/{X.tsx,index.ts,styles.ts}`.
- **Skills:**
  - react-best-practices — derive, don't store (the displayed tour = `skeletonOverride ?? lastResult?.tour ?? state.tour`); early returns for states; ≤200 lines per component (§ Derive, Don't Store; § Conditional Rendering).
  - frontend-ui-architecture — one component per folder (`SKILL.md` § Step 3).
- **Change:**
  - **Load states:** loading → `Skeleton`; error 404 → `RepoNotFound` (EC-17); other errors → `ErrorState loadError`.
  - **`clone_status === 'no_clone'`** → EmptyState `noClone` with CTA → `useRefreshRepo().mutate(repoId)` (AC-23).
  - **`tour == null`** → EmptyState `empty.*` with `{provider}/{model}` from `state.model` (AC-13, EC-3).
  - **Tour:**
    - heading `heading` with `activeRepo.name`, else the name part of `tour.repo_full_name`;
    - meta line with `useFormatter().relativeTime(new Date(generated_at))`;
    - `Regenerate` + `Copy as Markdown` buttons; stale badge (Requirements review gap 6);
    - "On this page" list of five buttons. Activation → `scrollIntoView` + `focus()` on the section header (AC-5);
    - `StatusBanner`, then the five `TourSection`s in order.
  - **Section bodies:**
    - Architecture: `<Markdown noRemoteImages>` + `MermaidDiagram` when there is a diagram (AC-7). The kit `Markdown` uses react-markdown without `rehype-raw`, so raw HTML is not rendered.
    - Critical paths: rows of `<code>path</code> — {reason}` + Open button (AC-9).
    - Reading path: an `<ol>` with the path as an `<a>` link and the reason below (AC-11).
    - First tasks: cards with the title, `<code>scope_path</code>` and a `complexity.*` badge (AC-12).
    - An empty list → `nothing`. First tasks in a skeleton → `tasksSkeleton` (AC-14).
  - **Generate/Regenerate:**
    - `mutate()`. While pending: disable both buttons; the active one shows `generating` with seconds from a 1 s `setInterval` (cleaned up); the five section areas show `Skeleton` placeholders (AC-15/16).
    - On success: show `result.tour` without reload (AC-18). If `failed_attempt` exists, show the notice `failed.notice` + `failed.showSkeleton` button above the sections (AC-45). Clicking it sets local state to display `failed_attempt.skeleton`; not stored, so a reload shows `state.tour` (AC-46).
    - On error:
      - 409 `generation_in_progress` → inline message `inProgress`, keep the view (EC-1);
      - 409 `no_clone` → refetch state (shows no-clone);
      - 404 → `RepoNotFound` (EC-2).
    - `generating` from GET is ignored (user decision 3).
- **Verify:** `cd client && pnpm test -- OnboardingView && pnpm typecheck` → green.
- **Done when:** the C3-covered cases of `OnboardingView.test.tsx` are green.

### Step C4 — Copy actions, Markdown export, GitHub links (Group C, chunk C-2)
- **Covers:** AC-10, AC-50, AC-51, AC-52, AC-53, AC-54, AC-55, EC-5, EC-14, EC-18, NFR-6 (copy button names + polite live region).
- **Files:** modify `.../onboarding/_lib/tour.ts`; create `.../_components/HowToRun/{HowToRun.tsx,index.ts,styles.ts}`; modify `CriticalPaths`, `ReadingPath`, `OnboardingView` (wiring).
- **Skills:**
  - frontend-ui-architecture — pure logic in `_lib`, no React (`SKILL.md` § Step 1, "Generic util" / "Domain rule").
  - security — `target="_blank" rel="noopener noreferrer"`, encoded segments (`security/SKILL.md` § React).
- **Change:**
  - **`githubBlobUrl`:** `https://github.com/${owner}/${name}/blob/${sha}/${path.split('/').map(encodeURIComponent).join('/')}` (owner/name from `repo_full_name`, also encoded).
  - **Open buttons and reading links** use it, with `target="_blank" rel="noopener noreferrer"` (Open = `window.open(url, '_blank', 'noopener,noreferrer')`) (AC-55).
  - **`tourToMarkdown`** in AC-53 order:
    - `# Onboarding for <full name>`;
    - the header line, then the banner lines;
    - `## <title>` × 5;
    - the overview body + a ```` ```mermaid ```` fence when there is a diagram;
    - `- \`path\` — reason`;
    - commands grouped by cwd in first-appearance order, one ```` ```sh ```` fence per cwd (preceded by `in <cwd>/` text for non-root);
    - `1. \`path\` — reason`;
    - `- title — \`scope\` (complexity)`.
  - **HowToRun:**
    - an `<ol>` with each command in `<code>`, the comment muted, the `inCwd` label when `cwd`, and a copy `IconBtn` with `aria-label={copyCommand}`;
    - click → `navigator.clipboard.writeText(command)` (exact text) → show `copied` for 2 s;
    - an `aria-live="polite"` region announces "Copied";
    - on failure → toast `copyFailed` (AC-50, AC-54).
  - **"Copy as Markdown" button** (label `copyMarkdown`, AC-51):
    - writes `tourToMarkdown(displayedTour, …)` → toast `copiedMarkdown` (AC-52);
    - on failure → toast `copyFailed` (EC-18).
- **Verify:** `cd client && pnpm typecheck && pnpm test && pnpm arch` (full suite once per chunk) → green.
- **Done when:** `tour.test.ts`, all of `OnboardingView.test.tsx` and the client suite are green.

### Step E1 — e2e flow (Group E, test-writer (e2e), after S and C are merged)
- **Covers:** AC-4 (e2e), AC-13 (e2e), AC-18 (e2e).
- **Files:** create `e2e/flows/09-onboarding-tour.flow.json` and `e2e/flows-docs/09-onboarding-tour.md`.
- **Skills:** none mapped (JSON flow); follow `e2e/CLAUDE.md` and `e2e/INSIGHTS.md:22-34`.
- **Change.** Keyless hermetic run: the seeded `acme/payments-api` has a clone-dir fixture from `scripts/e2e.sh:139-144` and `.github/workflows/e2e-web.yml:114-117`, and no index. The flow:
  1. `set viewport 1280 2400`
  2. open `{BASE}/` → wait url `/pulls`
  3. click text "Onboarding Tour"
  4. wait url `/onboarding`
  5. wait text "Generate onboarding tour"
  6. click the button "Generate onboarding tour"
  7. wait text "Skeleton — AI summary unavailable: no API key for openrouter"
  8. wait each section title: Architecture overview, Critical paths, How to run locally, Guided reading path, First tasks.

  No script or workflow change is needed. Do not run `scripts/e2e.sh` while a dev server is up (`client/INSIGHTS.md:70-74`).
- **Verify:** `cd e2e && npm ci && npm run typecheck && npm run e2e:hermetic` → all flows pass, including 06 (the add-repo `/onboarding` screen, unaffected).
- **Done when:** flow 09 passes keyless.

## Test plan
- **Ownership:**
  - test-writer (test-first) owns every unit/it test below and writes them red after Step 0.
  - test-writer (e2e) owns flow 09.
  - The implementer writes no behaviour tests. It only updates `server/test/contracts.test.ts` (Step 0.1, pre-existing shape fixture).
- **Commit column** for the matrix:
  - production code and Step tasks → "Onboarding Generator - code";
  - all tests below and the e2e flow → "Onboarding Generator - tests & review";
  - plan-verifier evidence → "- verification".

### Server (`server/test/`)
| Test file | Layer | Pins |
|---|---|---|
| `repo-intel-facts.test.ts` (temp-dir clone, `RepoIntelService` with patched `repo` as in `repo-intel-facade-degraded.test.ts`) | unit | AC-25, AC-26, AC-32 (files_total), AC-34 (`filesBounded`), AC-60 (env values absent from facts), EC-4, EC-5, EC-6, EC-16 |
| `repo-intel-hotness.test.ts` (`MockGitClient.commitPaths`) | unit | AC-27, AC-29, EC-12, EC-13 |
| `onboarding-model.test.ts` | unit | AC-28, AC-30, AC-31, AC-33, AC-34, AC-37, AC-42, AC-47, EC-4, EC-16 |
| `onboarding-grounding.test.ts` | unit | AC-36, AC-37, AC-38, AC-39, AC-40, AC-61, EC-8, EC-9, EC-15, NFR-8 (incl. max-size tour serialises ≤ 256 KB) |
| `onboarding-prompt.test.ts` | unit | AC-59, AC-60, NFR-3, EC-7, AC-41 (`classifyLlmError` mapping) |
| `llm-no-retry.test.ts` (localhost HTTP stub) | unit | AC-35, NFR-4 |
| `onboarding.it.test.ts` (Docker; `buildApp` with `MockSecretsProvider` no keys, `llm: {openrouter, openai, anthropic}` = `MockLLMProvider`, `MockGitClient`, temp clone dir via config `cloneDir`; `new OnboardingService(container, log, { timeoutMs: 200, historyTimeoutMs: 200 })` for AC-49/NFR-1: (a) never-resolving mock LLM → skeleton `timeout` and response within `timeoutMs` + persistence margin measured from request start; (b) `getHotness` mock that takes longer than `timeoutMs` → skeleton `timeout`, `llm_calls` 0, total duration still ≤ `timeoutMs` + margin. AC-19 also asserts through `app.inject`: two concurrent `POST /repos/:id/onboarding/generate` with a slow mock LLM → exactly one 200 and one 409 `generation_in_progress`, which proves the routes share one service instance) | it | AC-17, AC-19, AC-20, AC-22, AC-24, AC-25, AC-29, AC-32, AC-35, AC-41, AC-43, AC-44, AC-49, AC-56, AC-57, EC-1, EC-2, EC-3, EC-10, EC-11, EC-17, NFR-1, NFR-2 (fixture-scale timing), NFR-4, NFR-5 (exactly one line, no file/prompt text), NFR-9 (20× GET with a 256 KB tour, p95 ≤ 300 ms), NFR-10 (no unmocked provider: unkeyed secrets mean any real path throws `ConfigError`, not network) |
| `contracts.test.ts` (updated, implementer) | unit | new `Onboarding` shape |

### Client (co-located)
| Test file | Pins |
|---|---|
| `client/src/vendor/ui/nav.test.ts` (extended) | AC-1 |
| `client/src/components/app-shell/helpers.test.ts` (new) | AC-2, AC-3 |
| `.../onboarding/_components/OnboardingView/OnboardingView.test.tsx` | AC-4, AC-5, AC-6, AC-7, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-18, AC-21, AC-23, AC-45, AC-46, AC-48, AC-50, AC-51, AC-52, AC-54, AC-55, EC-1, EC-2, EC-3, EC-17, EC-18, NFR-6 (roles, `aria-expanded`/`aria-controls`, copy names, live region), NFR-7 (real `onboarding.json` messages, plurals) |
| `.../onboarding/_components/MermaidDiagram/MermaidDiagram.test.tsx` (mocked `mermaid`) | AC-8, AC-62, EC-9, NFR-6 (alt text) |
| `.../onboarding/_lib/tour.test.ts` | AC-53, AC-55, EC-5, EC-14 |

### e2e
- `e2e/flows/09-onboarding-tour.flow.json` → AC-4, AC-13, AC-18.

### Layer deviations from `[verify:]` tags
- AC-41 is tagged unit+it. The unit part is `classifyLlmError` plus the skeleton builder; the it part is the end-to-end skeleton per reason.
- AC-35 unit uses the HTTP stub (adapter level); it uses the mock call count.
- AC-25 unit and it.
- AC-29 it uses `MockGitClient` rejecting.
- NFR-2 is tagged it+manual: the it-test uses a small fixture.

### Manual
- **AC-58:**
  - add a public repo not yet in DevDigest (e.g. a small OSS TS repo);
  - wait for clone + index;
  - Generate with a real OpenRouter key;
  - `server` log has exactly one `"onboarding generation"` line for the request with `llm_calls: 1`;
  - its `cost_usd` equals the banner's `$…`.
- **NFR-2 (scale):** on a repo with ~5,000 indexed files, the `duration_ms` portion before the LLM call is < 20 s. Log facts/hotness timing via a debug line, or compare `duration_ms` on a forced `no_api_key` run.
- **NFR-6:**
  - Tab order follows visual order on the page;
  - contrast of the complexity/status badges ≥ 4.5:1 in light and dark themes;
  - screen-reader announcement of "Copied".

### Commands and environment
- Commands per module:
  - server `pnpm typecheck`, `pnpm test`, `pnpm arch`;
  - client `pnpm typecheck`, `pnpm test`, `pnpm arch`;
  - e2e `npm run typecheck`, `npm run e2e:hermetic`.
- **Docker needed: yes** (`onboarding.it.test.ts`; `skipped > 0` with Docker up = failure).
- **e2e: required** (AC-4, AC-13, AC-18 are tagged e2e).

## AC → step coverage (for plan-verifier)
| Item | Step(s) | Test |
|---|---|---|
| AC-1, AC-2, AC-3 | C1 | nav.test, helpers.test |
| AC-4, AC-5, AC-9, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-18, AC-21, AC-23, AC-45, AC-46 | C3 (+C1 hooks) | OnboardingView.test (+e2e for AC-4/13/18) |
| AC-6, AC-7, AC-48 | C2, C3 | OnboardingView.test |
| AC-8, AC-62 | C2 | MermaidDiagram.test |
| AC-10, AC-50…AC-55 | C4 | OnboardingView.test, tour.test |
| AC-17, AC-19, AC-20, AC-22, AC-24, AC-43, AC-44, AC-49, AC-56, AC-57 | S6 | onboarding.it |
| AC-25, AC-26, AC-32 | S1 (+S6) | repo-intel-facts, onboarding.it |
| AC-27, AC-29 | S2 (+S6) | repo-intel-hotness, onboarding.it |
| AC-28, AC-30, AC-31, AC-33, AC-34, AC-42, AC-47 | S3 | onboarding-model |
| AC-36…AC-40, AC-61 | S4 | onboarding-grounding |
| AC-37 | S3, S4 | onboarding-model, onboarding-grounding |
| AC-41 | S4, S6 | onboarding-prompt, onboarding.it |
| AC-35 | S5, S6 | llm-no-retry, onboarding.it |
| AC-59, AC-60 | S1, S4 | onboarding-prompt, repo-intel-facts |
| AC-58 | S6 | **manual only** |
| EC-1 | S6, C3 | it, OnboardingView |
| EC-2 | S6, C3 | it, OnboardingView |
| EC-3 | S6, C3 | it, OnboardingView |
| EC-4 | S1, S3 | facts, model |
| EC-5 | S1, C4 | facts, tour |
| EC-6 | S1 | facts |
| EC-7 | S4 | prompt |
| EC-8, EC-9, EC-15 | S4 (+C2 for EC-9) | grounding, MermaidDiagram |
| EC-10, EC-11 | S5, S6 | it |
| EC-12, EC-13 | S2 | hotness |
| EC-14 | C4 | tour |
| EC-16 | S1, S3 | facts, model |
| EC-17 | S6, C3 | it, OnboardingView |
| EC-18 | C4 | OnboardingView |
| NFR-1, NFR-5, NFR-9, NFR-10 | S6 | it |
| NFR-2 | S1, S2, S6 | it + manual |
| NFR-3 | S4 | prompt |
| NFR-4 | S5, S6 | llm-no-retry, it |
| NFR-6 | C2, C3, C4 | unit + manual |
| NFR-7 | 0.3, C2, C3 (D2) | OnboardingView |
| NFR-8 | 0.1, S4 | grounding, contracts |

Every AC-1…62, EC-1…18 and NFR-1…10 is covered. The only manual-only item is AC-58.

## Cross-model review
Gemini 3.1 Pro, verdict APPROVE WITH CHANGES. Findings and resolutions:

1. **[blocker] Lock scope (D4).** The lock lives on the service instance, but the plan did not say where the instance is created.
   - Resolved: D4 and Step S6 Routes now require one instance at plugin-registration scope, never per request.
   - The AC-19 it-test sends two concurrent POSTs through `app.inject` and expects exactly one 409.
2. **[major] 120 s bound covered only the LLM call.** Facts and hotness ran before the race, so the total could exceed AC-49/NFR-1.
   - Resolved: Step S6 uses one `deadline = start + timeoutMs` for the whole generation.
   - Hotness, the LLM race and the SDK timeout all get the remaining time.
   - If the deadline has already passed before the call → skeleton `timeout`, `llm_calls` 0.
   - The it-test row adds case (b), a slow `getHotness`.
3. **[minor] `llmNoRetry` SDK timeout.** The OpenAI and Anthropic adapter options had no timeout field.
   - Resolved: `timeoutMs?` added to both adapter opts (Test seams, Steps 0.2 and S5).
4. **[minor, no change] `generating: true` is ignored by the client.**
   - User decision 3. The EC-1 409 path is the fallback for a second tab. Recorded only.

## Risks & open questions
- **Per-group worktrees are untested in a non-isolated session.** The fallback (run in the feature worktree) is defined in Execution mode, and its paths are disjoint.
- **The WIP commit + `reset --soft` folding is a main-session procedure.** A mistake there mixes stage commits. Check `git show --stat` of each stage commit against the Owned-files table.
- **Hotness deepens the shallow clone to 200 commits** (`git fetch --depth 200`), which costs disk and network on the first generation. A later `sync` (`--depth 50`) can re-shallow the clone, so the next generation fetches again. Acceptable, and inside the 15 s cap.
- **simple-git `abort` support is assumed** for 3.27 (typings grep found `abort` in `simple-git.d.ts`). Step S2 falls back to `withTimeout`, which may leave a git process running for a while.
- **The compose parser is regex-based (D7).** Unusual YAML may hide services. In that case the docker command just isn't offered.
- **Prompt budget truncation of mid-priority blocks** relies on `tokenizer.truncate` (SPEC-01 Not verified: re-count ≤ n). `buildPrompt` re-counts after truncating and drops the block if it is still over budget.
- **The default model `deepseek/deepseek-v4-flash` answered in 34–71 s** (`server/INSIGHTS.md:190-200`). It is inside 120 s but slow for the demo. Pick a faster onboarding model in Settings for the AC-58 demo if needed. The model choice is a setting, not code.
- **The NFR-7 interpretation (D2)** is recorded for spec-creator.

## Not verified
- **simple-git `abort` option semantics on 3.27:** only the presence of the string `abort` in `server/node_modules/simple-git/dist/typings/simple-git.d.ts` was checked (main repo `node_modules`; the feature worktree has none).
- **That the OpenAI and Anthropic SDK versions in `server/package.json` honour `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL`** for the localhost stub. If not, `llm-no-retry.test.ts` covers OpenRouter (explicit `baseURL`) only, and the openai/anthropic options are checked by code review.
- **That the hermetic stack resolves `/repos/<seeded id>/onboarding` via the sidebar click** (the e2e runner was not run during planning).
- **That `readdir({ recursive: true })` on Node 22.16 skips nothing hidden** (expected to include dotfiles). `files_total` excludes `.git` explicitly.
- **The design N5 visual** in `docs/designs/DevDigest_Design.html` (1.7 MB) was not opened. Implementers grep it for layout cues; the spec text is authoritative.
