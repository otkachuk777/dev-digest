# Plan: PR #11 review fixes — agent model in list_agents, new get_pr_findings, drop duplicated blast decl-file filter

## Context
Three reviewer comments on otkachuk777/dev-digest#11 (branch `L04-HW`).
1. `list_agents` should expose each agent's model, so an LLM can pick between agents that differ only by model.
2. New read-only MCP tool `get_pr_findings(repo, pr, limit_per_agent?)` that returns the whole PR picture: each agent's latest review with its findings, plus severity totals. The user decided `get_findings` stays as it is.
3. `server/src/modules/blast/helpers.ts` `toBlastRadius` repeats a decl-file filter that the reviewer says the facade already guarantees. Remove it and pin the guarantee at facade level.

Shortest diff per item. Don't widen scope.

## Scope
- Modules: `mcp` (items 1, 2), `server` (item 3)
- Out of scope: any change to `get_findings` (including the fact that its "newest" `reviews[0]` can be a `kind:'summary'` row), `vendor/shared` contracts (no contract changes needed), and client. Architecture and security review are done by separate agents.

## Insights applied
- `mcp/INSIGHTS.md` "tsc with a cross-package paths alias emits into the other package" → build only via `npm run build` (esbuild). After the build, run `git status server/src/vendor/shared` and expect it to be clean.
- `mcp/INSIGHTS.md` "Don't trust a failed run that has no error" → does not apply. `get_pr_findings` reads persisted reviews only and never reports run status, so it has no reason to call `api.runs`.
- `server/INSIGHTS.md` "Reuse the existing severity tally" plus `findings-counts.ts:1-21` → `get_pr_findings` uses the same "latest review per agent, group key `agent_id ?? review id`" rule. mcp cannot import server code (it only uses `import type` from `@devdigest/shared`, see `mcp/CLAUDE.md` "Do not touch"). So a 3-line tally in `mcp/src/shape.ts` is the only option. It is not a duplicate we could have reused.
- `server/INSIGHTS.md` "Open Questions — vendor/shared drift" → not touched. No contract edits.
- Root `INSIGHTS.md` "e2e/reviewer-core use npm" → mcp uses **npm** (`mcp/package-lock.json`, `mcp/CLAUDE.md`). Server uses pnpm.
- Root `INSIGHTS.md` "git add -A while a subagent is running" → commit with explicit pathspecs.

## Constraints
- mcp ring by file role: `shape.ts`/`inputs.ts` are domain, `usecases.ts` is application, `server.ts` is the only file that imports the MCP SDK — `mcp/CLAUDE.md:8-17`, `onion-architecture/SKILL.md` §"mcp/" (l.65-72). `pnpm arch` doesn't scan mcp, so check imports by hand.
- mcp only `import type`s from `@devdigest/shared`. Never copy those types into mcp — `mcp/CLAUDE.md` "Do not touch".
- Tool inputs are flat primitives, defined once in `inputs.ts`, and use `z.input` types so the default stays optional for direct callers — `mcp/src/inputs.ts:3-8,22`; `zod/references/type-input-vs-output.md`.
- Parse once at the boundary (the SDK parses the `inputSchema`). Don't re-parse in usecases — `onion-architecture/SKILL.md` red flags (l.93); `zod/references/parse-avoid-double-validation.md`.
- Tool list + instructions must stay under 6000 chars, with no `outputSchema` — `mcp/test/budget.test.ts`.
- Errors lead forward and are returned as `isError`, never thrown — `docs/cc-plans/2026-09-27+mcp-server.md:10`; `mcp/src/server.ts:154-162`.
- Server: `pnpm arch` must stay green and the baseline must not be regenerated — `onion-architecture/SKILL.md:17`.
- Server tests go in `server/test/`, never under `src/` — root `CLAUDE.md` § Naming.
- Rebuild: `mcp/dist/index.js` is what runs. A PostToolUse hook rebuilds after edits to `mcp/src/*.ts`, but a running Claude Code session keeps the OLD MCP process until it is restarted — `mcp/CLAUDE.md:23-27`.

## Facts verified (drive the design)
- `GET /pulls/:id/reviews` (`server/src/modules/reviews/routes.ts:132`) → `service.reviewsForPull` (`reviews/service.ts:214-228`) → `repository/review.repo.ts:57-66`. The server returns **all kinds** (no kind filter), ordered **newest first** (`orderBy(desc(createdAt))`). It includes `agent_id` and `agent_name` (resolved per agent).
- `ReviewRecord` (`server/src/vendor/shared/contracts/review-api.ts:23-37`) has `kind: 'summary' | 'review'`, `model: string | null`, `run_id`, `agent_id`, `agent_name?`, and `created_at`. **The model is on each review record**: `run-executor.ts:297` writes `model: agent.model`. So `get_pr_findings` needs no `listAgents` call.
- Only `run-executor.ts:293` writes `kind: 'review'`. Nothing in `server/src` writes `'summary'` today, but the contract allows it, so the new tool excludes it.
- `capOutput` (`mcp/src/shape.ts:111-121`) only trims a **top-level** `findings` array. On `{reviews:[{findings}]}` it is a no-op, so it has to be applied per review (see Step 2b).
- Item 3: the persistent path does **not** filter decl-file rows in code. `getResolvedCallers` (`repo-intel/repository.ts:503-531`) selects references with `decl_file IN changedFiles` and has no `from_path <> decl_file` predicate. The loop in `tryPersistentBlast` (`repo-intel/service.ts:352-370`) has no skip either. The "guarantee" is only a data invariant of `resolveReferences` (`repository.ts:400-425`: `decl_file` comes from a `file_edges` import edge, and a file doesn't normally import itself). A unit test with a stubbed repository therefore **cannot** prove it today: a stubbed row `{fromPath:'a.ts', toSymbol:'alpha'}` would come back as a caller. The ripgrep fallback does skip it (`service.ts:273`, `r.fromPath === sym.file`).

## Skills for implementer
| Files (glob) | Skills | Key rules (source) |
|---|---|---|
| `mcp/src/**` | onion-architecture, zod | ring by file role and inward imports (`onion-architecture/SKILL.md` §mcp/); flat input shapes, `z.input` for defaulted fields (`zod/references/type-input-vs-output.md`); no double parse (`zod/references/parse-avoid-double-validation.md`) |
| `server/src/modules/repo-intel/service.ts`, `server/src/modules/blast/helpers.ts` | onion-architecture | helpers stay pure (domain); the facade (application) owns the data guarantee (`onion-architecture/SKILL.md` Step 1 table, l.23-29) |
| any non-test `.ts` | security | no new trust boundary. Inputs are SDK-parsed zod, output is read-only data — nothing specific to apply |

Unmapped skills: none.

## Steps

### Step 1 — `list_agents` returns the model (item 1)
- Files: modify `mcp/src/shape.ts`, `mcp/test/domain.test.ts`, `mcp/test/usecases.test.ts`, `mcp/test/server.test.ts`
- Skills: onion-architecture — the change stays in the pure `shape.ts` (domain).
- Decision: add a single field `model: a.model`, without `provider`. Why: the model id is what differs between otherwise-identical agents. OpenRouter ids already carry the vendor (`deepseek/deepseek-v4-flash`), so a `provider/model` string would read `openrouter/deepseek/...`. It also uses the same field name `get_pr_findings` returns (`ReviewRecord.model`). If provider is ever needed, it is a 1-line add.
- Change:
  - `ShapedAgent` gets `model: string`.
  - `shapeAgents` gets `model: a.model` (after `name`).
  - `server.ts` `list_agents` description: no change needed (the field is self-describing and saves budget).
  - Tests:
    - `domain.test.ts` `shapeAgents`: add `expect(shaped.model).toBe(<fixture model>)`.
    - `usecases.test.ts` `listAgents` "returns shaped agents": `expect(result.agents[0]!.model).toBe('gpt-5')`.
    - `server.test.ts` "list_agents returns shaped agents": `expect(parsed.agents[0].model).toBe('gpt-5')`.
  - The FakeApi fixtures already contain `model: 'gpt-5'`, so no fixture change is needed.
- Verify: `cd mcp && npm test -- domain usecases server` → green
- Done when: `list_agents` JSON includes `model` for each agent.

### Step 2a — domain: `shapePrFindings` (item 2)
- Files: modify `mcp/src/shape.ts`
- Skills: onion-architecture — a pure grouping/counting rule belongs in the domain (`SKILL.md` l.32 "would it still be true with no HTTP…").
- Change: add `ReviewRecord` to the existing `import type` from `@devdigest/shared`, then add:
  ```ts
  export interface ShapedAgentReview extends ShapedReview {
    agent: string | null;
    model: string | null;
    run_id: string | null;
  }
  export interface ShapedPrFindings {
    total_findings: number;
    by_severity: Record<Severity, number>;
    reviews: ShapedAgentReview[];
  }
  /** Each agent's LATEST review only (same rule as server pulls/findings-counts.ts:
   *  group by agent_id, legacy null agent_id = its own group). Counts are taken
   *  before the per-agent limit. Summary-kind rows are skipped. */
  export function shapePrFindings(reviews: ReviewRecord[], limitPerAgent = 10): ShapedPrFindings
  ```
  Body:
  - `kind === 'review'` rows, sorted by `created_at` desc (`b.created_at.localeCompare(a.created_at)` — ISO strings). This makes the function independent of the server's ordering and keeps the test honest.
  - Keep the first row per `agent_id ?? id` (a `Set`).
  - `by_severity = { CRITICAL:0, WARNING:0, SUGGESTION:0 }`, incremented over **all** findings of the kept reviews. `total_findings` = the sum.
  - `reviews = kept.map(r => ({ agent: r.agent_name ?? null, model: r.model, run_id: r.run_id, ...shapeReview(r, limitPerAgent) }))`. This reuses the severity sort and truncation.
- Verify: `cd mcp && npm run typecheck` → no errors
- Done when: the function compiles and has no imports besides `import type`.

### Step 2b — input, use case, registration (item 2)
- Files: modify `mcp/src/inputs.ts`, `mcp/src/usecases.ts`, `mcp/src/server.ts`, `mcp/README.md` (tool table row only)
- Skills: zod — flat primitives, `z.input` type (`type-input-vs-output.md`); onion-architecture — orchestration in `usecases.ts`, SDK only in `server.ts`.
- Change:
  - `inputs.ts`: add `export const GetPrFindingsInput = { repo, pr, limit_per_agent: limit(1, 50, 10).describe('Max findings per agent') };` and `export type GetPrFindingsInput = z.input<z.ZodObject<typeof GetPrFindingsInput>>;`.
  - `usecases.ts`: add `getPrFindings(api, input, signal)`:
    - Resolve repo and PR exactly like `getFindings` (`usecases.ts:185-187`: `unwrap(findRepo…)`, `unwrap(findPr…)`, the `!prObj.id` guard). This gives the same lead-forward `not_found` texts.
    - `const shaped = shapePrFindings(await api.reviews(prObj.id, signal), input.limit_per_agent ?? 10);`
    - If `shaped.reviews.length === 0`, throw `new DevDigestError('not_found', 'No reviews yet for this PR — call run_agent_on_pr first')`. This is the same text as `getFindings`.
    - Return `{ ...shaped, reviews: shaped.reviews.map((r) => capOutput(r, Math.floor(20_000 / shaped.reviews.length))) }`. This reuses `capOutput` per review with an equal share of the existing 20k budget, because `capOutput` ignores nested arrays (see "Facts verified").
    - Don't add a `resolvePr` helper: the 3-line pattern is already repeated in 3 use cases, and refactoring them is out of scope.
  - `server.ts`:
    - Import `GetPrFindingsInput`.
    - Register `get_pr_findings` after `get_findings`, with description `"Whole-PR review picture: every agent's latest verdict and findings plus severity totals. For one specific run use get_findings."`, `inputSchema: GetPrFindingsInput`, and `annotations: { readOnlyHint: true }`. The handler follows the same try/`handleError` pattern.
    - Append to `INSTRUCTIONS`: ` get_pr_findings(repo, pr) returns all agents' latest reviews at once.`
  - `mcp/README.md`: add a row for `get_pr_findings` to the tools table (l.12-14). Leave the "Context cost" numbers as they are (measured values). Note in the commit body that they predate the new tool.
- Verify: `cd mcp && npm run typecheck && npm test -- budget` → budget still < 6000
- Done when: the tool is listed with `readOnlyHint: true` and budget.test is green.

### Step 2c — tests (item 2)
- Files: modify `mcp/test/domain.test.ts`, `mcp/test/usecases.test.ts`, `mcp/test/server.test.ts`
- Change:
  - `domain.test.ts` `shapePrFindings`. Fixtures come from the existing `finding()` helper plus a local `rec()` for `ReviewRecord`.
    - (a) Two reviews from the same agent, older with 3 findings and newer with 1 → only the newer is kept, `total_findings === 1`.
    - (b) Counts before truncation: one agent with 3 findings (1 CRITICAL, 2 SUGGESTION), `limitPerAgent = 1` → `total_findings 3`, `by_severity {CRITICAL:1, WARNING:0, SUGGESTION:2}`, `reviews[0].findings.length 1`, `total 3`, `truncated true`, and `findings[0].severity === 'CRITICAL'` (severity order).
    - (c) A `kind:'summary'` row is excluded.
    - (d) Two different agents → 2 reviews. A null `agent_id` row counts as its own group.
  - `usecases.test.ts` `getPrFindings`:
    - Happy path: `api.reviewsResult = [doneReview with 2 findings]` → one review, with `agent: 'Reviewer'`, `model: 'gpt-5'`, and totals.
    - Unknown PR (`pr: 999`) → rejects `{ kind: 'not_found' }`.
    - `reviewsResult = []` → rejects `not_found` and the message contains `run_agent_on_pr`.
  - `server.test.ts`: change the tool-list test to 6 names including `get_pr_findings` (and rename "exactly the 5 tools" to 6). Assert `get_pr_findings` has `annotations.readOnlyHint === true`.
  - `budget.test.ts`: no code change. Optionally update the "5 tools" wording in its comment to 6.
- Verify: `cd mcp && npm test` → all green
- Done when: all new cases pass and the existing ones stay green.

### Step 3 — item 3: move the decl-file guarantee into the facade
- Files: modify `server/src/modules/repo-intel/service.ts`, `server/src/modules/blast/helpers.ts`, `server/test/blast-helpers.test.ts`, `server/test/repo-intel-blast-cap.test.ts`, `server/test/repo-intel-facade-degraded.test.ts`
- Skills: onion-architecture — the facade (application) guarantees what it returns, and the pure mapper stays a mapper (`SKILL.md` l.23-33).
- Decision: the reviewer's premise is only half true. The ripgrep path skips the decl file in code (`service.ts:273`). The persistent path relies on an indexer data invariant (see "Facts verified"), which a stubbed-repo test cannot exercise. Options:
  - **A (recommended):** a 1-line skip in `tryPersistentBlast`, using the `seenSym` key set that already exists (`${name}:${path}`, `service.ts:327-336`). This gives exact semantic parity with the removed helper filter (`${viaSymbol}:${file}`), and the existing stubbed unit test can prove it without Docker.
  - **B:** a SQL predicate `ne(t.references.fromPath, t.references.declFile)` in `getResolvedCallers`. The onion skill prefers this for rules that are naturally a `WHERE` (`SKILL.md` l.42, red flag l.91). It needs a new Docker `*.it.test.ts` that seeds `references` + `file_rank` + `decl_file` (~40 lines), and it is not provable by the stubbed unit test.
  - Recommend A: it is the shortest honest diff, and `seenSym` is derived from a separate query, so the check is a facade-level cross-query invariant rather than a plain row filter. If the architecture reviewer insists on B, switch to B.
- Change (A):
  - `service.ts`, directly after `const callerRows = await this.repo.getResolvedCallers(...)` (l.342), before `callerFiles` is computed so the decl file is not fetched either:
    ```ts
    // A decl file is never its own caller (the ripgrep path skips it at the ref loop).
    const callerRows = (await this.repo.getResolvedCallers(repoId, changedFiles, [...nameSet]))
      .filter((c) => !seenSym.has(`${c.toSymbol}:${c.fromPath}`));
    ```
  - `blast/helpers.ts`: delete `declByNameFile` (l.15), the comment and `continue` (l.24-26). Update the docblock (l.9-13) by removing "drop a caller whose file is the symbol's own declaration file,".
  - `test/blast-helpers.test.ts`: delete the case "drops a caller whose file equals the symbol decl file" (l.79-89).
  - `test/repo-intel-blast-cap.test.ts`: add a `selfRow` option to `buildService`, or a small inline service, where `getResolvedCallers` also returns `{ fromPath: 'a.ts', toSymbol: 'alpha', line: 5, rank: 999 }`. Add the case `it('never returns a reference from the symbol's own decl file as a caller')`, which expects `result.callers.some(c => c.file === 'a.ts')` to be `false` and the real callers to be present. Update the file docblock to mention the second concern in one line.
  - `test/repo-intel-facade-degraded.test.ts`: add one ripgrep-path case. Build a local service with `config.repoIntelEnabled: false`, `getRepoBasics → { id:'r1', owner:'a', name:'b', clonePath:'/nonexistent' }` (`readClone` returns null on a missing file, `service.ts:781-783`), `codeIndex.symbols → [{ path:'a.ts', name:'alpha', kind:'function', line:1 }]`, and `codeIndex.references → [{fromPath:'a.ts',…}, {fromPath:'c.ts',…}]`. Expect callers to have exactly one entry, with `file 'c.ts'`. This pins the existing `service.ts:273` skip that the deleted helper test used to cover indirectly.
- Verify: `cd server && pnpm typecheck && pnpm test -- blast-helpers repo-intel-blast-cap repo-intel-facade-degraded && pnpm arch`
- Done when: the helper has no decl-file logic, both facade paths have a test proving no self-caller, and arch is green.

### Step 4 — build, full verification, handoff
- `cd mcp && npm run typecheck && npm test && npm run build`, then `git status server/src/vendor/shared` → must be clean (`mcp/INSIGHTS.md` tsc/esbuild entry).
- `cd server && pnpm typecheck && pnpm test && pnpm arch`
- Tell the user: `mcp/dist` is rebuilt, but the running Claude Code session's `devdigest` MCP process still serves the old tools until the session (or MCP server) restarts. A new session is needed to see `get_pr_findings` and `model`.
- Re-run `/pr-self-review` before merge (the gate hook requires it). The implementer does not commit or review. Hand back to the caller.

## Test plan
- New/changed tests:
  - mcp: `domain.test.ts` (shapeAgents model; shapePrFindings ×4), `usecases.test.ts` (listAgents model; getPrFindings ×3), `server.test.ts` (6 tools, readOnlyHint, list_agents model); `budget.test.ts` unchanged and must stay green.
  - server: `blast-helpers.test.ts` (−1 case), `repo-intel-blast-cap.test.ts` (+1 persistent self-caller), `repo-intel-facade-degraded.test.ts` (+1 ripgrep self-caller).
- Commands:
  - mcp (npm): `npm run typecheck`, `npm test`, `npm run build`, plus `git status server/src/vendor/shared`
  - server (pnpm): `pnpm typecheck`, `pnpm test`, `pnpm arch`
- Docker needed: no (option A). It would be yes under option B.
- e2e (`npm run e2e:hermetic`): not required. Nothing changes in the client/user flow: the MCP tool surface isn't covered by e2e, and blast output is unchanged for real data.

## Commit plan
Recommend **one commit per item** (3 commits). They map 1:1 to the review threads, item 3 is server-only, and a reviewer can check each thread in isolation:
1. `feat(mcp): list_agents returns each agent's model`
2. `feat(mcp): get_pr_findings — latest review per agent + severity totals`
3. `refactor(blast): decl-file self-caller guarantee lives in the repo-intel facade`

Use explicit pathspecs (root INSIGHTS). The archived plan file goes into the last implementation commit, per the user's CLAUDE.md plan lifecycle.

## Risks & open questions
- Item 3: the reviewer's premise ("the facade already guarantees it in both paths") is false for the persistent path in code. The guarantee there is only a data invariant of the indexer. Option A adds the check; option B (SQL + it-test) is what the onion skill's "rule is naturally a WHERE" line would prefer. The architecture reviewer may push for B.
- Item 3 edge (ripgrep path, pre-existing): the removed helper also dropped a caller in file B when B **also** declares a changed symbol with the same name. The ripgrep path skips only `sym.file`. That case is negligible (two changed files declaring the same name), and parity would need a 1-line change of `r.fromPath === sym.file` to `seen.has(\`${sym.name}:${r.fromPath}\`)` at `service.ts:273`. Not planned unless asked.
- Budget: `get_pr_findings` adds ~350-450 chars to tools/list + instructions. The current headroom has not been measured (the README numbers are tokens). If `budget.test.ts` fails, shorten the description first, then the INSTRUCTIONS sentence.
- `capOutput` split: each review gets `20_000 / n` chars. With many agents, each one's list is cut sooner (marked `truncated: true`). The totals stay correct because they are counted before the cap.
- `get_findings` "newest" can pick a `kind:'summary'` record if one ever exists. This is out of scope per the user decision. Flag it only.

## Not verified
- Whether any writer of `kind:'summary'` reviews exists outside `server/src`. I searched `server/src` only; no writer was found.
- The actual current char size of tools/list + instructions (tests were not run, read-only).
- Whether dependency-cruiser can ever emit a self-edge (`from_file == to_file`) into `file_edges`. Not checked, and it doesn't matter under option A.
