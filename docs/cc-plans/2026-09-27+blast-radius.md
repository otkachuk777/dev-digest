# Plan: Blast Radius (Overview block + MCP tool + prior PRs)

## Context
The reviewer needs to see what else in the repo a PR's diff can affect. `repo-intel` already builds the index when the repo is cloned. This feature only reads that index through the facade `container.repoIntel.getBlastRadius(repoId, changedFiles)`, maps it to the `BlastRadius` wire contract, and shows it on the PR Overview tab (Tree and Graph views). The same map goes out through the MCP tool `get_blast_radius`. There is no reparsing and no LLM.

Decisions made by the user:
- Fix the facade's caller cap so it applies per `viaSymbol`, not to the whole list.
- Prior PRs come from the GitHub API.
- Implement all P3 items.
- Use `client/src/lib/api/blast.ts` for the hooks. `lib/hooks/` does not exist in this fork.

Intended outcome: on the demo PR (it changes `server/src/modules/pulls/status.ts`), the Overview tab shows at least 2 callers and at least 1 HTTP endpoint, each caller as a `file:line` GitHub link. On acme/payments-api it shows a degraded badge with a Resync button. PR #9 (only `.md` files) shows the "no downstream" text. `get_blast_radius` returns the same map.

## Scope
- Modules: server, client, mcp. (e2e flow extension dropped by the user — out of scope.)
- Out of scope: indexer/pipeline changes, the legacy ripgrep facade behaviour other than the cap, `PrBrief` composition, `reviewer-core`, and editing the archived `docs/cc-plans/2026-09-27+mcp-server.md` (it is a historical record). Architecture and security reviews are done by separate agents.

## Insights applied
- `server/INSIGHTS.md` "Cross-module imports go through the target module's index.ts". Blast reaches repo-intel only through `container.repoIntel` and `import type … from '../repo-intel/index.js'`. It reaches PR, repo and files through `container.reviewRepo` (`getPull`, `getRepo`, `getPrFiles`, at `server/src/modules/reviews/repository.ts:30-40`). Nothing imports `../reviews/repository*`. `helpers.ts` imports no `db/*`.
- `server/INSIGHTS.md` Open Question "vendor/shared copies out of sync". I checked `brief.ts` and `adapters.ts` today: the server and client copies are byte-identical (`diff` shows no output). `pr-self-review/scripts/guards.sh:33-41` blocks on any drift, so both files are edited identically in both copies. Re-run `diff` after editing.
- `server/INSIGHTS.md` "A no-DB test that calls buildApp reaped the dev DB". The `BlastService` constructor must not touch the DB (only `new BlastService(app.container)`), so `test/routes-smoke.test.ts` stays green.
- `client/INSIGHTS.md` "`<Button active>` only renders for kind=tertiary". The Tree/Graph toggle uses `kind="tertiary"` + `active` + `aria-pressed` inside a bordered `role="group"` wrapper, copied from `DiffTab.tsx:66-85`.
- `client/INSIGHTS.md` "user-event is not installed". Tests use `fireEvent` from `@testing-library/react`.
- `client/INSIGHTS.md` "`beforeEach(() => mock.mockResolvedValue(x))`". Hooks that configure mocks get braces.
- `client/INSIGHTS.md` "scripts/e2e.sh is a third writer to client/.next" and "pnpm build while next dev runs". Never run `npm run e2e:hermetic` or `pnpm build` while the preview dev server is up.
- `mcp/INSIGHTS.md` "tsc emits into the other package" and "zod alias". Build only with `npm run build` (esbuild). Then run `git status server/src/vendor/shared` to confirm nothing was emitted there. Import `@devdigest/shared` with `import type` only.
- Root `INSIGHTS.md` "e2e / reviewer-core use npm". Use npm in `mcp/` and `e2e/`, pnpm in `server/` and `client/`.

## Constraints
- Dependencies point inward. A route does parse → `getContext` → service → return. No drizzle, `db/*` or adapters in `routes.ts`, `service.ts` or `helpers.ts`. Sources: `onion-architecture/SKILL.md` §Step 1 table, and `server/.dependency-cruiser.cjs` rules `routes-thin`, `no-db-outside-infra`, `domain-pure`, `no-cross-module-internals`.
- The known-violations baseline only shrinks. Never run `pnpm arch:baseline` (`onion-architecture/SKILL.md` §Overview).
- A new module is `src/modules/<kebab>/`, registered in `src/modules/index.ts` (`onion-architecture/SKILL.md` §Step 2; `server/src/modules/index.ts:26-37`).
- Another module's data is reached via `container.<x>` (`reviewRepo`, `repoIntel`) or its `index.ts` (`onion-architecture/SKILL.md` §Step 2).
- A new external capability is a port in `vendor/shared/adapters.ts` + an adapter in `src/adapters/github/octokit.ts` + a mock in `src/adapters/mocks.ts` (`onion-architecture/SKILL.md` §Step 2). The skill says "server copy only", but the client copy is currently identical and `guards.sh:33-41` flags any drift, so edit both.
- `MAX_CALLERS_PER_SYMBOL` and `BFS_DEPTH` live only in `server/src/modules/repo-intel/constants.ts:42,63`. Never re-declare them in blast, client or mcp.
- Wire shapes are Zod contracts in `vendor/shared/contracts/*.ts` with snake_case wire fields and a PascalCase export plus a same-named `z.infer` type (root `CLAUDE.md` §Naming). Use `z.enum` for fixed string sets (`zod/SKILL.md` `schema-use-enums`).
- Validate the response at the boundary: `schema.response[200]` via fastify-type-provider-zod. `serializerCompiler` is already set at `server/src/app.ts:63-64`, and the precedent is `server/src/modules/reviews/routes.ts:173-179`.
- Pass the request logger into the service, as in `reviews/routes.ts:168` (`service.rederiveIntent(…, req.log)`).
- Client code is co-located in `_components/<PascalCase>/` with `<Name>.tsx`, `index.ts`, `styles.ts` (inline `CSSProperties`), and `helpers.ts`/`constants.ts` as needed. Tests are co-located as `<Name>.test.tsx` (root `CLAUDE.md` §Naming).
- Client data access lives per resource in `lib/api/<resource>.ts`: key factory + hooks, parsed with the contract (`frontend-ui-architecture/SKILL.md` §Step 1 "Data access").
- i18n: the namespace equals the file name. All labels go in `client/messages/en/blast.json` and are read with `useTranslations("blast")`. The loader auto-merges every JSON file (`client/src/i18n/request.ts:16-25`).
- Client `pnpm arch` rules: `no-circular`, `no-orphans`, and `no-cross-route-internals` (`client/.dependency-cruiser.cjs:34-95`).
- Do not touch `client/src/vendor/ui/`: every icon and primitive this feature needs already exists (`icons.tsx`: Code, CornerDownRight, Globe, Clock, ChevronDown, ChevronRight, Zap, RefreshCw, AlertTriangle, GitMerge). No lockfile changes and no new npm dependency: the graph is hand-rolled SVG.
- MCP layout: `inputs.ts`, `match.ts` and `shape.ts` are domain; `port.ts` is the port; `http-api.ts` is the only fetch; `usecases.ts`; `server.ts` is the only MCP SDK import (`mcp/CLAUDE.md`; `onion-architecture/SKILL.md` §mcp/). The tool list plus instructions must stay under 6000 chars (`mcp/test/budget.test.ts`).

## Skills for implementer
| Files (glob) | Skills | Key rules (source) |
|---|---|---|
| `server/src/modules/blast/**`, `server/src/modules/repo-intel/service.ts`, `server/src/adapters/**`, `server/src/modules/index.ts` | onion-architecture | Ring table; routes are thin; reuse `container.reviewRepo`/`container.repoIntel`; no repository interface; row→DTO mapping is a pure `helpers.ts` (`onion-architecture/SKILL.md` §Step 1, §Step 2, §Red flags) |
| `server/src/modules/blast/routes.ts` | fastify-best-practices | Schema-first `params` + `response` (`rules/serialization.md` "Response Schema Benefits"); structured `request.log.info({…}, msg)` (`rules/logging.md:55-81`) |
| `*/src/vendor/shared/contracts/brief.ts`, `mcp/src/inputs.ts` | zod | `schema-use-enums`, `type-use-z-infer`, `object-optional-vs-nullable` (optional = absent on the non-degraded path) (`zod/SKILL.md` §1, §3, §5) |
| all non-test `.ts`/`.tsx` | security | Workspace-scoped PR lookup: `getPull(workspaceId, prId)` (§A01). Outbound links use `rel="noopener noreferrer"` (MonoLink already does). Never log tokens (§A09). Fail closed: GitHub failure returns empty history, not a 500 leak (§A10) |
| `client/src/**/*.{ts,tsx}` | frontend-ui-architecture, react-best-practices | Data access in `lib/api/blast.ts` with an exported key factory. A UI mapping stays next to the UI. One exported component per file, ≤200 lines, so split into sub-folders. Derive, don't store. No render factories. Stable keys. `count > 0 &&`. Icon-only buttons get `aria-label` (`frontend-ui-architecture/SKILL.md` §Step 1-3; `react-best-practices/SKILL.md` §Component Design, §Derive, §Key Prop, §Conditional Rendering, §Accessibility) |
| `client/src/app/**` | next-best-practices | The card sits under an existing `"use client"` tree (`OverviewTab.tsx:1`); no new RSC boundary (`next-best-practices/SKILL.md` §RSC Boundaries) |
| `client/**/*.test.tsx` | react-testing-library | Few scenario tests; query by role/text; mock only at the API boundary (`@/lib/api/*`); assert what the user sees (`react-testing-library/SKILL.md` §Philosophy, §Detail/View scenarios) |
| `mcp/src/**` | onion-architecture (mcp section), zod | Import direction checked by hand; flat input shape (`onion-architecture/SKILL.md` §mcp/) |

Unmapped skills: none. `drizzle-orm-patterns` does not apply because no `repository*` file is created or changed: blast reuses `container.reviewRepo`.

## Steps

### Step 1: Contract and port (both vendor copies)
- Files: modify `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts` (identical edits). Modify `server/src/vendor/shared/adapters.ts` and `client/src/vendor/shared/adapters.ts` (identical edits).
- Skills: zod (`schema-use-enums`, `type-export-schemas-and-types`); onion-architecture (a port lives in `adapters.ts`, §Step 2).
- Change:
  - In `brief.ts`, before `BlastRadius`, add:
    - `export const BlastDegradedReason = z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data']); export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;`
    - To `BlastRadius`, add `degraded: z.boolean().optional()` and `reason: BlastDegradedReason.optional()`.
    - Change nothing else. `PrHistory` and `PrHistoryItem` are reused as they are.
  - In `adapters.ts`, next to `GitHubClient`:
    - `export interface MergedPullRef { number: number; title: string; author: string; merged_at: string }`
    - A port method on `GitHubClient` with a doc comment: `listMergedPullsForPath(repo: RepoRef, path: string, commitLimit: number): Promise<MergedPullRef[]>`. It returns merged PRs associated with the last `commitLimit` commits touching `path`.
- Verify: `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts && diff server/src/vendor/shared/adapters.ts client/src/vendor/shared/adapters.ts` → no output. `cd server && pnpm test -- contracts` → green (the existing `BlastRadius` fixture still parses).
- Done when: both pairs are byte-identical and the contracts test passes. The server typecheck fails until Step 3 adds the adapter and mock methods; that is expected.

### Step 2: Facade fix (per-symbol cap, partial → degraded) + unit test
- Files: modify `server/src/modules/repo-intel/service.ts`. Create `server/test/repo-intel-blast-cap.test.ts`.
- Skills: onion-architecture (the facade is Application ring; a pure helper stays module-private).
- Change:
  - Add a module-private pure function at the bottom of `service.ts`, next to `enclosingFromRows`: `function capPerSymbol(callers: BlastCallerRow[], max: number): BlastCallerRow[]`. It keeps the first `max` rows per `viaSymbol` and preserves input order (a Map counter).
  - `tryPersistentBlast` (`service.ts:384-390`): replace `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` with `capPerSymbol(callers, MAX_CALLERS_PER_SYMBOL)`. This runs after the existing rank sort at `:372`.
  - Same return: replace `degraded: false` with `...(state.status === 'partial' ? { degraded: true, reason: 'index_partial' as const } : { degraded: false })`. The `index_partial` reason exists in `types.ts:30` but is never set, and "index incomplete" must reach the UI. `getBlastRadius` has no other consumer (grep: only `repo-intel/service.ts`).
  - Ripgrep fallback (`service.ts:297-303`): it has no cap at all. Apply `callers: capPerSymbol(callerRows, MAX_CALLERS_PER_SYMBOL)` so both paths honour the documented per-symbol cap (`constants.ts:41`).
- Test: follow `test/repo-intel-facade-degraded.test.ts:18-40`. Build `new RepoIntelService({ config: { repoIntelEnabled: true }, db: {} } as never)` and patch `svc.repo` with:
  - `tryGetIndexState` → `{ status: 'full', … }`
  - `getSymbolRows` → decl rows `{path:'a.ts', name:'alpha', kind:'function'}` and `{path:'a.ts', name:'beta', …}` when called with `['a.ts']`, otherwise `[]`
  - `getResolvedCallers` → 25 rows `alpha` from `c0..c24.ts`, rank 100-i, plus 3 rows `beta` from `b0..b2.ts`, rank 1
  - `getFileFacts` → `[]`

  Assertions:
  - alpha has 20 callers and beta has 3. The old code dropped beta entirely.
  - A second case with `status: 'partial'` gives `degraded: true, reason: 'index_partial'`.
- Verify: `cd server && pnpm test -- repo-intel-blast-cap repo-intel-facade-degraded` → green.
- Done when: the new test fails on the old `slice` (check by reasoning or a temporary revert) and passes now. The degraded test is still green.

### Step 3: GitHub adapter + mock
- Files: modify `server/src/adapters/github/octokit.ts` and `server/src/adapters/mocks.ts`.
- Skills: onion-architecture (SDK only in `src/adapters/**`, rule `sdk-only-in-adapters`).
- Change:
  - Octokit `listMergedPullsForPath(repo, path, commitLimit)`:
    - Call `this.octokit.rest.repos.listCommits({ owner, repo: name, path, per_page: commitLimit })`, wrapped in `withRetry(() => withTimeout(…, TIMEOUT))` like `getFileContent` at `octokit.ts:366-380`.
    - Then `Promise.all` over the commit SHAs: `this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo: name, commit_sha })`, with the same wrapping.
    - Flatten. Keep rows with `merged_at != null`. Dedupe by `number`. Map to `{ number, title, author: user?.login ?? '', merged_at }`.
    - Let errors throw; the service catches them. Neighbouring methods do the same.
  - Mock: add `mergedPulls?: Record<string, MergedPullRef[]>` to `MockGitHubOptions` (`mocks.ts:121-130`). The method returns `this.opts.mergedPulls?.[path] ?? []`.
- Verify: `cd server && pnpm typecheck` → green (with Step 1).
- Done when: both `GitHubClient` implementations compile.

### Step 4: `blast` server module (constants, pure mapping, service, routes, registry) + unit test
- Files: create `server/src/modules/blast/constants.ts`, `helpers.ts`, `service.ts`, `routes.ts`, and `server/test/blast-helpers.test.ts`. Modify `server/src/modules/index.ts`.
- Skills:
  - onion-architecture: `helpers.ts` is domain (pure; `import type` only), `service.ts` is application, `routes.ts` is presentation. Reuse `container.reviewRepo`; no new repository.
  - fastify-best-practices: response schema; `request.log`.
  - security: workspace scope; fail-closed history.
- Change:
  - `constants.ts`: `HISTORY_MAX_FILES = 10` (changed files queried), `HISTORY_COMMITS_PER_FILE = 5`, `HISTORY_MAX_PRS = 5`. Nothing else. Do not re-declare the repo-intel limits.
  - `helpers.ts` (pure; imports only `import type { BlastResult } from '../repo-intel/index.js'` and `import type { BlastRadius, PrHistoryItem, MergedPullRef } from '@devdigest/shared'`):
    - `export function toBlastRadius(result: BlastResult): BlastRadius`
      - Group `result.callers` by `viaSymbol`, in first-seen order (the facade already rank-sorted them).
      - Drop a caller when `result.changedSymbols` has `{name: c.viaSymbol, file: c.file}`. This defends the "decl file is never its own caller" rule. The facade already guarantees it (decl_file is resolved only through import edges, `repo-intel/repository.ts:386-425`; the ripgrep path skips it at `service.ts:273`).
      - Per group, emit `{ symbol, callers: [{ name: c.symbol, file: c.file, line: c.line }], endpoints_affected, crons_affected }`. The two arrays are the deduped union of `result.factsByFile?.[c.file]?.endpoints / .crons` across that group's callers. When `factsByFile` is absent (degraded ripgrep path), they are `[]`.
      - Sort groups by max caller `rank` desc, then by caller count desc.
      - `changed_symbols` = `result.changedSymbols.map(({name,file,kind}) => ({name,file,kind}))`.
      - `summary = buildSummary(...)`.
      - Spread `degraded`/`reason` only when defined.
    - `export function buildSummary(symbols: number, callers: number, endpoints: number, crons: number): string`. It is built from numbers only, for example `"2 symbols changed · 14 callers · 3 endpoints · 1 cron"`. With 0 callers: `"2 symbols changed · no downstream callers"`. Endpoints and crons are counted as unique across downstream.
    - `export function mergePriorPrs(files: string[], perFile: MergedPullRef[][], currentNumber: number, max: number): PrHistoryItem[]`
      - Dedupe by number; exclude `currentNumber`.
      - `files_overlap` = the files whose list contained that PR.
      - Sort by `merged_at` desc (ISO string compare) and slice to `max`.
      - Map to `{ pr_number, title, merged_at, author, files_overlap, notes: '' }`.
  - `service.ts`: `export class BlastService { constructor(private container: Container) {} … }`.
    - `private async loadPr(workspaceId, prId)`:
      - `this.container.reviewRepo.getPull(workspaceId, prId)`; missing → `NotFoundError('Pull request not found')`.
      - `getRepo(pull.repoId)`; missing → `NotFoundError('Repo not found')`.
      - `getPrFiles(prId)` → paths.
    - `async blast(workspaceId, prId, log: FastifyBaseLogger): Promise<BlastRadius>`:
      - Call `loadPr`, then `const result = await this.container.repoIntel.getBlastRadius(pull.repoId, paths)`, then `const blast = toBlastRadius(result)`.
      - Log: `log.info({ prId, repoId: pull.repoId, changedFiles: paths.length, source: result.degraded ? 'fallback' : 'prebuilt-index', degraded: !!result.degraded, reason: result.reason, symbols: blast.changed_symbols.length, downstream: blast.downstream.length }, 'blast: read from repo-intel index (no reparse, no LLM)')`.
      - Return `blast`.
    - `async history(workspaceId, prId, log): Promise<PrHistory>`:
      - Call `loadPr`, then get the client: `let gh; try { gh = await this.container.github(); } catch (err) { log.warn({ err }, 'prior PRs skipped: GitHub unavailable'); return { history: [] }; }`.
      - `const files = paths.slice(0, HISTORY_MAX_FILES)`.
      - `const perFile = await Promise.all(files.map((f) => gh.listMergedPullsForPath({ owner: repo.owner, name: repo.name }, f, HISTORY_COMMITS_PER_FILE).catch(() => [])))`.
      - `return { history: mergePriorPrs(files, perFile, pull.number, HISTORY_MAX_PRS) }`.
  - `routes.ts` follows `conventions/routes.ts:17-24`, with `const service = new BlastService(app.container)` (no DB work at construction):
    - `GET /pulls/:id/blast` with `{ schema: { params: IdParams, response: { 200: BlastRadius } } }`: `getContext`, then `service.blast(workspaceId, req.params.id, req.log)`.
    - `GET /pulls/:id/history` with `{ schema: { params: IdParams, response: { 200: PrHistory } } }`: `getContext`, then `service.history(…, req.log)`.
    - Header docblock lists both routes.
  - `modules/index.ts`: `import blast from './blast/routes.js';` and add `blast` to the `modules` map.
- Test `server/test/blast-helpers.test.ts` (pure; no DB):
  1. Flat callers from two `viaSymbol`s group into two downstream entries with `name/file/line` mapped and order kept.
  2. Endpoints and crons are attributed through `factsByFile` and deduped. A symbol whose callers' files have no facts gets `[]`.
  3. Downstream is sorted by max rank desc.
  4. A caller whose `file` equals the symbol's decl file is dropped.
  5. No callers → `downstream: []` and the summary mentions "no downstream". Degraded passthrough: `{degraded:true, reason:'no_data'}` is kept, and the absent keys stay absent when not degraded. The result `BlastRadius.parse(...)`s.
  6. `mergePriorPrs` dedupes across files, collects `files_overlap`, excludes the current PR, sorts desc, and caps.
- Verify: `cd server && pnpm test -- blast-helpers routes-smoke && pnpm typecheck && pnpm arch` → green, no new violations.
- Done when: all three are green. With the dev server running, `curl -s localhost:3001/pulls/<demoPrId>/blast` returns a `BlastRadius` with at least 2 callers and at least 1 endpoint, and the server log shows the `blast: read from repo-intel index` line with `source: 'prebuilt-index'`.

### Step 5: Client data hooks + i18n
- Files: create `client/src/lib/api/blast.ts`. Modify `client/messages/en/blast.json`.
- Skills: frontend-ui-architecture ("Data access": one module per resource, exported key factory, parse at the boundary).
- Change:
  - `blast.ts` mirrors `lib/api/pulls.ts` and `repo-intel.ts`:
    - `export const blastKeys = { radius: (prId: string | null | undefined) => ["blast", prId] as const, history: (prId: string | null | undefined) => ["blast-history", prId] as const };`
    - `export function useBlastRadius(prId)` → `useQuery({ queryKey: blastKeys.radius(prId), queryFn: () => api.get(\`/pulls/${prId}/blast\`, BlastRadius), enabled: !!prId })`
    - `export function usePriorPrs(prId, enabled: boolean)` → `useQuery({ queryKey: blastKeys.history(prId), queryFn: () => api.get(\`/pulls/${prId}/history\`, PrHistory), enabled: !!prId && enabled })`. It is lazy: fetched only when the block is expanded, because it costs GitHub calls.
  - Resync reuses `useResyncRepoIntel(repoId)` from `lib/api/repo-intel.ts` unchanged. The card passes a per-call `onSuccess` that invalidates `blastKeys.radius(prId)` (Step 6).
  - `blast.json`: keep the existing keys and add:
    - `"title": "Blast radius"`
    - `"viewLabel": "Blast radius view"`
    - `"loadError": "Could not load the blast radius."`
    - `"toggleSymbol": "Toggle {symbol}"`
    - `"degraded": { "badge": "Index incomplete: {reason}", "resync": "Resync index", "reason": { "flag_off": "repo-intel is off", "index_failed": "index build failed", "index_partial": "partial index", "repo_too_large": "repo too large to index", "no_data": "no index data yet" } }`
    - `"legend": { "changed": "changed symbol", "callers": "callers", "endpoints": "endpoints affected" }`
    - `"history": { "title": "Prior PRs touching these files", "empty": "No merged PRs found for these files.", "error": "Could not load prior PRs.", "meta": "merged {date} by {author}", "overlap": "{count} shared file(s)" }`
- Verify: `cd client && pnpm typecheck` → green.
- Done when: the hooks typecheck and `blast.json` is valid JSON.

### Step 6: BlastRadiusCard UI (tree, graph, prior PRs) + wiring
- Files:
  - Create under `client/src/app/(shell)/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/`:
    - `BlastRadiusCard.tsx`, `index.ts`, `styles.ts`, `helpers.ts`
    - `_components/BlastTree/{BlastTree.tsx,index.ts,styles.ts}`
    - `_components/BlastGraph/{BlastGraph.tsx,index.ts,styles.ts,helpers.ts}`
    - `_components/PriorPrs/{PriorPrs.tsx,index.ts,styles.ts}`
  - Modify `…/OverviewTab/OverviewTab.tsx` and `…/pulls/[number]/page.tsx`.
- Skills:
  - frontend-ui-architecture: co-locate by single consumer; UI mapping next to the UI; split by responsibility.
  - react-best-practices: ≤200 lines per component; derive, don't store; stable keys; `> 0 &&`; `aria-label`/`aria-pressed`.
  - security: external links through `MonoLink href`, which sets `target="_blank" rel="noopener noreferrer"`.
- Component tree:
  ```
  OverviewTab(prId, headSha, prBody, repoId, repoFullName)
  ├─ IntentCard
  ├─ BlastRadiusCard(prId, repoId, repoFullName, headSha)   ← useBlastRadius, useResyncRepoIntel, useQueryClient; view state
  │   ├─ SectionLabel icon="Zap" "Blast radius", right = Tree|Graph group (tertiary+active)
  │   ├─ stats row: Code n symbols · CornerDownRight n callers · Globe n endpoints · Clock n crons
  │   ├─ degraded row (when blast.degraded): Badge AlertTriangle warn + Button tertiary sm RefreshCw "Resync index"
  │   ├─ downstream.length === 0 → t("noDownstream", {count: changed_symbols.length})
  │   ├─ view==="tree"  → BlastTree(downstream, repoFullName, headSha)   ← collapsed Set state
  │   ├─ view==="graph" → BlastGraph(downstream)                         ← pure SVG
  │   └─ PriorPrs(prId, repoFullName)                                    ← open state + usePriorPrs(prId, open)
  └─ Description section (unchanged)
  ```
- Change:
  - `page.tsx:127`: pass `repoId={repoId}` and `repoFullName={repoFullName}` to `<OverviewTab …/>`. `OverviewTab` forwards them plus `prId` and `headSha` to `<BlastRadiusCard/>`, rendered after `IntentCard`. The card mounts only after `usePullDetail` resolved (`page.tsx:74-101`), so `GET /pulls/:id` has already refreshed `pr_files`.
  - `BlastRadiusCard.tsx`:
    - Loading: `<div role="status" aria-busy="true"><Skeleton height={160}/></div>`, following `IntentCard.tsx:24-30`.
    - Error: `<ErrorState title={t("loadError")} onRetry={refetch}/>`.
    - Otherwise a `<Card>` with the tree above. The view is `useState<"tree"|"graph">("tree")`.
    - Resync: `resync.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: blastKeys.radius(prId) }) })`, button `loading={resync.isPending}`. Resync is a 202 plus a background job, so the refetched data may still be old. That is acceptable, and no polling is added.
  - `BlastRadiusCard/helpers.ts`: `blastStats(blast: BlastRadius) → { symbols, callers, endpoints, crons }` (unique endpoints and crons over downstream). A UI-local derivation, not stored in state.
  - `BlastTree`:
    - Per `downstream` item (key = `symbol`), a header button with `aria-expanded`, `aria-label={t("toggleSymbol",{symbol})}`, a ChevronDown or ChevronRight, `<Code/> {symbol}()`, and right-aligned `t("callerCount",{count})`.
    - When expanded, an indented list of callers (key = `${file}:${line}`). Each caller is `CornerDownRight` plus `<MonoLink href={githubBlobUrl(repoFullName, headSha, file, line)}>{file}:{line}</MonoLink>`. When `repoFullName` is null, the same text is rendered without a link. Import `githubBlobUrl` from `[number]/_lib/github-urls.ts` with a relative path.
    - Then endpoint badges `<Badge icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)" mono>` and cron badges `<Badge icon="Clock" color="var(--warn)" bg="var(--warn-bg)" mono>`: distinct styles and icons, so the meaning is not carried by colour alone.
    - All symbols start expanded. Collapsed state is a `Set<string>` in `useState`.
  - `BlastGraph`:
    - A pure `layoutGraph(downstream)` in `BlastGraph/helpers.ts` returns `{ nodes: {id, col: 0|1|2, label, y}[], edges: {from,to}[], height }`, with fixed columns x = 0/260/520, node height 28 and gap 12.
      - Column 0 is the changed symbols.
      - Column 1 is the callers, unique by `file+name`, labelled `name`, with a `<title>` of `file:line`.
      - Column 2 is the unique endpoints and crons.
      - Edges: symbol→each of its callers, and each caller of that symbol→each of that symbol's endpoints/crons. Add `// ponytail: endpoints are known per symbol, not per caller, so caller→endpoint edges are symbol-scoped; add endpoints to BlastCaller if exact edges matter.`
    - `BlastGraph.tsx` renders `<svg role="img" aria-label={t("graph.ariaLabel")} viewBox=…>` with rects:
      - changed symbol and endpoints: `var(--accent)` stroke
      - callers: `var(--border-strong)`
      - crons: `var(--warn)`
      - edges: grey cubic `path d="M x1 y1 C mx y1, mx y2, x2 y2"`
    - Below it, a legend row (three swatches with `legend.*`). Empty downstream → `t("graph.empty")`.
  - `PriorPrs`: collapsed by default. A header button with `aria-expanded` shows `t("history.title")` and a count Badge once data exists. When open, it calls `usePriorPrs(prId, open)` and handles:
    - loading: Skeleton
    - error: `t("history.error")`
    - empty: `t("history.empty")`
    - otherwise a list: `#pr_number` as `MonoLink href=githubPrUrl(repoFullName, pr_number)` (from `_lib/github-urls.ts`), title, `t("history.meta",{date: merged_at.slice(0,10), author})`, and `t("history.overlap",{count: files_overlap.length})`.
  - `styles.ts` in each folder: inline `CSSProperties` only, using the `s = {…} as const` pattern from `OverviewTab/styles.ts`.
- Verify: `cd client && pnpm typecheck && pnpm arch` → green. With the dev server up, open the demo PR's Overview and click a caller: GitHub opens at `#L<line>` in a new tab.
- Done when: every P1/P3 UI element renders on the demo PR, acme/payments-api shows the badge and Resync, and PR #9 shows the `noDownstream` text.

### Step 7: Client component test
- Files: create `…/BlastRadiusCard/BlastRadiusCard.test.tsx`.
- Skills: react-testing-library (scenario tests, mock at the API boundary, role/text queries). Client INSIGHTS: `fireEvent`, braces in `beforeEach`.
- Change:
  - Follow `IntentCard.test.tsx`:
    - `vi.mock("@/lib/api/blast", …)` with mutable `blastData`/`blastLoading` and a `usePriorPrs` spy.
    - `vi.mock("@/lib/api/repo-intel", () => ({ useResyncRepoIntel: () => ({ mutate: resyncMutate, isPending: false }) }))`.
    - Render inside `QueryClientProvider` (a new `QueryClient`, needed for `useQueryClient`; precedent: `PRRow.test.tsx`) plus `NextIntlClientProvider messages={{ blast: messages }}`, importing `messages/en/blast.json` by relative path.
  - Tests:
    1. Loading shows a `role="status"` with `aria-busy="true"`.
    2. Data with links. Fixture: 2 downstream symbols, a caller `src/api/public/index.ts:23`, an endpoint `GET /api/public/items`, a cron `reset-rate-buckets`, with repo `o/r` and sha `abc`. Assert:
       - stats text
       - a `getByRole("link", { name: "src/api/public/index.ts:23" })` with `href` `https://github.com/o/r/blob/abc/src/api/public/index.ts#L23` and `target="_blank"`
       - endpoint and cron chips visible
       - clicking the symbol toggle hides that caller link
       - clicking "graph" gives `getByRole("img", { name: "Blast radius graph" })`
       - expanding prior PRs calls `usePriorPrs` with `enabled=true` and renders `#12`
    3. No downstream: `downstream: []` shows the `noDownstream` text.
    4. Degraded: `{degraded:true, reason:"no_data"}` shows the badge text "Index incomplete: no index data yet". Clicking "Resync index" calls `resyncMutate` once.
- Verify: `cd client && pnpm test -- BlastRadiusCard` → 4 green. Then `pnpm test` for the full suite.
- Done when: all client tests pass.

### Step 8: MCP get_blast_radius
- Files:
  - Modify `mcp/src/port.ts`, `mcp/src/http-api.ts`, `mcp/src/usecases.ts`, `mcp/src/inputs.ts`, `mcp/src/server.ts`.
  - Modify `mcp/test/usecases.test.ts` and `mcp/test/server.test.ts`. Modify `mcp/test/http-api.test.ts` only if it enumerates port methods.
- Skills: onion-architecture §mcp/ (ring by file role, checked by hand); zod (flat input).
- Change:
  - `port.ts`: add `pullDetail(prId: string, signal?: AbortSignal): Promise<PrDetail>` and `blast(prId: string, signal?: AbortSignal): Promise<BlastRadius>`, as type imports from `@devdigest/shared`.
  - `http-api.ts`: `pullDetail` → `GET /pulls/${encodeURIComponent(prId)}`; `blast` → `GET /pulls/${encodeURIComponent(prId)}/blast`. Use the existing `request<T>`.
  - `inputs.ts`: `export type GetBlastRadiusInput = z.input<z.ZodObject<typeof GetBlastRadiusInput>>;`
  - `usecases.ts` `getBlastRadius(api, input, signal): Promise<BlastRadius>`:
    - Resolve with `unwrap(findRepo(...))` and `unwrap(findPr(..., repoObj.full_name))`, copying `getFindings` (`usecases.ts:186-189`). Unknown repo or PR gives the existing lead-forward NotFound text with the known list.
    - Guard `prObj.id`.
    - `await api.pullDetail(prObj.id, signal)`. This refreshes `pr_files` for a PR never opened in the UI; the server serves persisted files when GitHub is offline.
    - `return api.blast(prObj.id, signal)`, returned as-is so it is the same map as the UI.
  - `server.ts`:
    - Replace the stub (`server.ts:132-140`) with `registerTool('get_blast_radius', { description: 'What else a PR can break: changed symbols, their callers (file:line), affected HTTP endpoints and crons, from the prebuilt code index. Call before reviewing a PR to judge its risk.', inputSchema: GetBlastRadiusInput, annotations: { readOnlyHint: true } }, …)`.
    - The handler follows the `get_conventions` pattern: `textResult(await usecases.getBlastRadius(api, args, extra.signal))` with `handleError`.
    - Append ` get_blast_radius(repo, pr) maps a PR's downstream callers and endpoints.` to `INSTRUCTIONS`.
  - Tests:
    - `usecases.test.ts`: `FakeApi` gains `blastResult` plus `pullDetail`/`blast` methods and a `pullDetailCalls` counter. Cases:
      - happy path returns the `BlastRadius` unchanged and calls `pullDetail` first
      - unknown PR (`pr: 999`) rejects with `DevDigestError` of kind `not_found`, message containing `Known PRs: #42`
      - unknown repo rejects with `not_found`
    - `server.test.ts`: add the two methods to its `FakeApi`. Replace the "always returns the not-implemented isError" test with: an unknown repo gives `isError` and text containing `not found`. The tool list assertion is unchanged.
- Verify: `cd mcp && npm run typecheck && npm test && npm run build && git status --short ../server/src/vendor/shared` → all green, including the budget test, and no stray emitted files.
- Done when: `dist/` is rebuilt and the tests pass. With the API running, calling the tool on otkachuk777/dev-digest and the demo PR returns the same JSON as `/pulls/:id/blast`.

## Test plan
- New tests:
  - `server/test/repo-intel-blast-cap.test.ts`: per-symbol cap and `index_partial`.
  - `server/test/blast-helpers.test.ts`: flat→grouped mapping, attribution, rank sort, decl-file drop, empty/degraded, summary, prior-PR merge.
  - `client/.../BlastRadiusCard/BlastRadiusCard.test.tsx`: loading, data+links+collapse+graph+prior PRs, no downstream, degraded+resync.
  - `mcp/test/usecases.test.ts` + `server.test.ts`: real tool, unknown repo/PR.
- Existing tests to keep green:
  - `server/test/contracts.test.ts` (the `BlastRadius` fixture)
  - `server/test/repo-intel-facade-degraded.test.ts`
  - `server/test/routes-smoke.test.ts` (no DB touched at `buildApp`)
  - `mcp/test/budget.test.ts` (≤6000 chars)
- Commands (package manager from each lockfile):
  - server: `pnpm typecheck && pnpm test && pnpm arch`
  - client: `pnpm typecheck && pnpm test && pnpm arch`
  - mcp: `npm run typecheck && npm test && npm run build`
  - repo root: `diff` both vendor pairs (brief.ts, adapters.ts) → identical
- Docker needed: no. None of the new tests are `*.it.test.ts`.

## Risks & open questions
- Graph edges from callers to endpoints are symbol-scoped: the contract has endpoints per symbol, not per caller, so the graph can show a caller→endpoint edge that doesn't exist for that exact caller. The upgrade is an optional `endpoints` field on `BlastCaller`. This needs a decision if exact edges matter.
- Degraded (ripgrep) path: the facade returns only the flat `impactedEndpoints`, with no `factsByFile`. In degraded mode, per-symbol `endpoints_affected` is therefore `[]` and the endpoint count reads 0. That path also parses the clone (it is facade-internal); the log line reports `source: 'fallback'` honestly rather than claiming the index was used.
- Facade semantics change: `partial` status now returns `degraded: true, reason: 'index_partial'`, which was `degraded: false` before. No other consumer of `getBlastRadius` exists (grep).
- Caller links use the PR head sha, but line numbers come from the index at `lastIndexedSha`. A caller file changed on main after indexing could be off by a few lines. The resync button mitigates this.
- Prior PRs: up to 10 files × (1 + 5) GitHub calls, each with a 30 s timeout and retry. There is no overall deadline, so it is fetched lazily only when expanded. Add a `Promise.race` cap if it proves slow on a real PR.
- MCP calls `GET /pulls/:id` before `/blast` so `pr_files` exists for PRs never opened in the UI. This costs one GitHub fetch per tool call.
- `onion-architecture/SKILL.md` §Step 2 says ports go in the server copy of `adapters.ts` only, but `guards.sh` blocks drift between the (currently identical) copies. The plan edits both, and flags this conflict for the skill owner.
- `docs/cc-plans/2026-09-27+mcp-server.md` still documents the stub. It is left as a historical record, and `mcp/CLAUDE.md` "Read when adding/changing a tool" points there. Consider a one-line note in `mcp/README.md` if it lists tools.

## Not verified
- Whether `mcp/test/http-api.test.ts` needs new cases. I did not open it; add a case only if it covers per-method paths.
- The octokit method names `repos.listCommits` / `repos.listPullRequestsAssociatedWithCommit` and the `merged_at`/`user.login` fields are from Octokit REST knowledge, not checked against the installed `octokit` typings. Typecheck will confirm them.
- The CSS tokens `--accent-bg`, `--accent-text`, `--warn` and `--warn-bg` are used in existing components (`Chip.tsx`, `IntentCard.tsx`). I did not check them in `styles.css`.
