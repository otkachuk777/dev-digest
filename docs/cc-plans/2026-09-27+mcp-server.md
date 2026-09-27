# Plan: DevDigest local MCP server (`mcp/`)

## Context
We want Claude Code to drive DevDigest reviews directly from chat. We add a **local stdio MCP server** as a new standalone package `mcp/`. It is a thin wrapper over the running Fastify API (`server/`, `http://localhost:3001`). **No changes to server/client/reviewer-core code.** No DB access, no duplicated business logic.

Four tool-design principles (from the lesson):
1. **Outcome, not operation.** `run_agent_on_pr` creates the run, waits, and returns findings in one call.
2. **Flat arguments.** `repo`, `pr` and `agent` are separate primitive values.
3. **Concise structured response.** `{verdict, findings[]}` with only the needed fields, never a raw dump.
4. **Errors lead forward.** Example: "agent not found — call list_agents". Returned as `isError: true`, never thrown.

Token cost at chat start stays small:
- 5 tools with 1–2 sentence descriptions
- tiny flat schemas
- a 3-line `instructions`
- no `outputSchema`
- a test that enforces the size budget

The internal layout of `mcp/` follows **Onion Architecture**: dependencies point inward only, and the DevDigest API is reached only through a port/adapter. We apply the principles of `.claude/skills/onion-architecture`; its server-specific tooling (`pnpm arch`, Container) does not apply.

## Decisions (user, 2026-09-27)
- Scope: local only, stdio, new npm package `mcp/`, wraps the HTTP API.
- `run_agent_on_pr` blocks with a hard 120 s cap. On timeout it returns `{status:'running', run_id, hint}` (not an error). The server run keeps going; nothing is cancelled on timeout or client abort.
- If a run for the same PR + agent is already in flight, attach to it and wait (no duplicate POST).
- `get_findings(repo, pr, run_id?)`: without `run_id` it uses the PR's newest review. No new server route.
- `get_conventions` returns **accepted** conventions only.
- `get_blast_radius` is always registered, has a one-sentence description, and returns `isError "not implemented yet"`.
- Onion layout inside `mcp/`.
- Repo integration outside `mcp/`: pr-self-review (guards + skill-map), engineering-insights, CI workflow, docs/architecture.md, plus `.mcp.json`, root CLAUDE.md and README.

## Insights applied
- **`server/INSIGHTS.md` "`timeoutMs` on `completeStructured` does not bound the call" + "deepseek-v4-flash too slow…".** Model calls can take minutes, so the 120 s timeout path is a first-class result with its own test.
- **Root `INSIGHTS.md` "e2e/ and reviewer-core/ use npm".** Use npm only in `mcp/`.
- **`server/INSIGHTS.md` Open Questions "two vendor/shared copies".** Import wire types with `import type` only, from `server/src/vendor/shared`, via the `@devdigest/shared` alias (as `reviewer-core/tsconfig.json:21-24` does). No third copy.

## API map (researched)
| Need | Endpoint |
|---|---|
| Auth | None. `LocalNoAuthProvider` (`server/src/adapters/auth/local.ts`) uses the default workspace |
| Agents | `GET /agents` → `Agent[]` |
| Repos | `GET /repos` → `Repo[]` (`full_name`) |
| PR number → id | `GET /repos/:id/pulls` → `PrMeta[]` (`id`, `number`). This syncs from GitHub when a token is set |
| Start run | `POST /pulls/:id/review {agentId}` → `{runs:[{run_id,…}]}`. Fire-and-forget; 10/min rate limit |
| Active runs | `GET /pulls/:id/runs/active` |
| Status | `GET /pulls/:id/runs` → `RunSummary[]` (running/done/failed/cancelled, error) |
| Findings | `GET /pulls/:id/reviews` → `ReviewRecord[]` (run_id, verdict, score, summary, findings[]) |
| Conventions | `GET /repos/:id/conventions` → `ConventionScan{items[], scanned_at}` |
| Errors | Envelope `{error:{code,message,details}}` (`server/src/app.ts:120-162`) |

## `mcp/` layout — rings by file role (no domain/ or application/ folders)
```
mcp/
  package.json        type:module; deps @modelcontextprotocol/sdk ^1.30, zod ^3.25 (SDK peer needs ≥3.25)
                      devDeps typescript, tsx, vitest, @types/node (reviewer-core versions)
                      scripts: build, dev, start, typecheck, test, inspect
  package-lock.json   via npm install only
  tsconfig.json       copy of reviewer-core's; outDir dist; paths @devdigest/shared → ../server/src/vendor/shared
  vitest.config.ts
  CLAUDE.md, README.md, INSIGHTS.md (header only, same format as e2e/INSIGHTS.md)
  src/
    errors.ts     DOMAIN   DevDigestError {kind: not_found|unreachable|rate_limited|invalid|server, message}; NotFound(hint)
    match.ts      DOMAIN   pure: findRepo(repos, "owner/name"|uuid), findPr(pulls, n), findAgent(agents, name|uuid),
                           activeRunFor(active, agentId) → value or NotFound("… — call list_agents")
    shape.ts      DOMAIN   pure: shapeAgents, shapeReview (severity sort, message≤200, summary≤300, limit, total, truncated),
                           shapeConventions (accepted only, rule≤200), capOutput (≤20k chars → trim findings)
    port.ts       PORT     interface DevDigestApi { listAgents, listRepos, listPulls, activeRuns, startReview, runs,
                           reviews, conventions } — typed with `import type` from @devdigest/shared
    http-api.ts   INFRA    class HttpDevDigestApi implements DevDigestApi: fetch + AbortSignal.any(15 s),
                           encodeURIComponent for path ids, JSON body only when present, error envelope → DevDigestError
    usecases.ts   APP      listAgents(api), runAgentOnPr(api, {repo,pr,agent}, {pollMs,waitMs,signal}),
                           getFindings(api, …), getConventions(api, …), waitForRun (poll, node:timers/promises sleep)
    server.ts     PRESENT  createServer(api, opts) → McpServer(instructions) + 5 registerTool: zod input (parse once,
                           at boundary), annotations, call use case, map result → {content:[text JSON]} / isError
    index.ts      ROOT     read env → new HttpDevDigestApi(url) → createServer → StdioServerTransport; logs to stderr only
  test/
    domain.test.ts    match + shape (pure, no mocks)
    usecases.test.ts  FakeApi (object implementing port): happy path, attach to active run with no POST,
                      timeout → running+run_id, failed, get_findings running/unknown/limit, conventions accepted/empty
    server.test.ts    InMemoryTransport + SDK Client + FakeApi: error → isError text mapping, annotations, blast-radius stub
    http-api.test.ts  stubbed fetch: envelope → DevDigestError kinds, network → unreachable, path encoding
    budget.test.ts    JSON(tools/list) + instructions < 6000 chars (~1.5k tokens)
```
**Allowed imports** (checked by hand + pr-self-review onion reviewer):
- `errors`/`match`/`shape` → only each other and `import type` contracts.
- `port` → type-only.
- `http-api` → port and errors (no SDK besides fetch).
- `usecases` → domain and port (never http-api or the MCP SDK).
- `server` → usecases, errors and the MCP SDK (never http-api).
- `index` → everything.

## Tool specs
1. **list_agents**
   - Input: none. Annotations: readOnlyHint.
   - Output: `{agents:[{id, name, description≤120, enabled}]}`.
   - Empty → isError "No agents configured — create one in the DevDigest UI (Agents page)."
2. **run_agent_on_pr**
   - Input: `{repo: string, pr: int>0, agent: string}`.
   - Annotations: readOnly false, destructive false, idempotent false, openWorld true.
   - Flow: resolve → attach to an active run or POST → wait up to 120 s → review with that `run_id` → shape.
   - Done → `{status:'done', run_id, agent, verdict, score, summary, findings[{severity,file,line,title,message}], total, truncated}`. Default limit 20, sorted CRITICAL > WARNING > SUGGESTION.
   - Failed or cancelled → isError "Run <id> failed: <error>. Retry run_agent_on_pr or pick another agent (list_agents)."
   - Timeout → `{status:'running', run_id, hint:"Still running — call get_findings(repo, pr, run_id) in ~1 min."}`.
3. **get_findings**
   - Input: `{repo, pr, run_id?: uuid, limit?: 1–50 = 20}`. Annotations: readOnlyHint.
   - Output: same shape as run_agent_on_pr. A run that is still running returns a hint, not an error.
   - Unknown run → isError "run not found on this PR — call run_agent_on_pr first".
4. **get_conventions**
   - Input: `{repo, limit?: 1–100 = 30}`. Annotations: readOnlyHint.
   - Output: `{scanned_at, total, conventions:[{category, rule, file, line}], truncated}`.
   - None → isError "No accepted conventions for <repo> — run the scan / accept rules on the repo's Conventions page in DevDigest."
5. **get_blast_radius**
   - Input: `{repo, pr}`. Annotations: readOnlyHint.
   - Description: "PR impact map. Not implemented yet."
   - Always returns isError "get_blast_radius is not implemented yet."

**Descriptions (exact text, English — read by the model)**

| Tool | description |
|---|---|
| list_agents | "List configured DevDigest reviewer agents. Call first to get a valid agent name for run_agent_on_pr." |
| run_agent_on_pr | "Review a GitHub PR with one agent: starts the run, waits up to 120 s, returns verdict and findings. If still running, returns run_id — then call get_findings." |
| get_findings | "Get the verdict and findings of a review run on a PR (newest run if run_id is omitted)." |
| get_conventions | "Get a repo's accepted coding conventions (house rules) with file:line evidence." |
| get_blast_radius | "PR impact map. Not implemented yet." |

**Parameter descriptions (`.describe()`, shared zod fields defined once):**
- `repo`: 'GitHub repo "owner/name"'
- `pr`: 'PR number'
- `agent`: 'Agent name from list_agents'
- `run_id`: 'From run_agent_on_pr; omit for newest'
- `limit`: 'Max items'

**instructions**, 3 lines:
> DevDigest reviews GitHub PRs with configured agents. Flow: list_agents → run_agent_on_pr(repo "owner/name", pr number, agent name) → if still running, get_findings(repo, pr, run_id). get_conventions returns a repo's accepted house rules.

**Error → text** (in `server.ts`, from `DevDigestError.kind`):
- `unreachable` → "DevDigest API not reachable at <URL> — start it: cd server && pnpm dev"
- `not_found` → the domain hint (for repo misses it lists up to 10 known repos)
- `rate_limited` → "rate limited (10 runs/min) — wait a minute"
- `server` → message + " — check the server log"

Details and stacks go to stderr only.

**Security**:
- zod bounds all inputs (the trust boundary).
- Ids are `encodeURIComponent`-ed in paths.
- The base URL comes only from env (`DEVDIGEST_API_URL`, default `http://localhost:3001`).
- No secrets.

## Changes outside `mcp/`
| File | Change |
|---|---|
| `.mcp.json` (new, root) | `{"mcpServers":{"devdigest":{"type":"stdio","command":"node","args":["mcp/dist/index.js"],"env":{"DEVDIGEST_API_URL":"http://localhost:3001"}}}}` |
| `CLAUDE.md` (root) | Line 3: 5 packages incl. `mcp` (MCP server). "Read when": touching `mcp/*` → `mcp/CLAUDE.md`. Lock file list: add `mcp/package-lock.json` |
| `README.md` (root) | "MCP server" section: `cd mcp && npm ci && npm run build`, server must run, approve `devdigest` in Claude Code |
| `docs/architecture.md` | Topology diagram: `Claude Code ──stdio──▶ mcp ──REST──▶ server`. Module-boundaries row: `mcp` owns MCP tool surface + response shaping; does not own persistence/review logic |
| `.claude/skills/pr-self-review/scripts/guards.sh` | Lockfile pairs: add `mcp/package-lock.json:mcp/package.json` |
| `.claude/skills/pr-self-review/references/skill-map.md` | Rows: `mcp/src/**` → `onion-architecture`, `zod` (tool input schemas). `security` already covers all non-test `.ts` |
| `.claude/skills/onion-architecture/SKILL.md` | Short "mcp/" note: ring by file role (errors/match/shape = domain, port.ts, http-api.ts = infra, usecases.ts = app, server.ts = presentation, index.ts = root). `pnpm arch` does not scan it |
| `.claude/skills/engineering-insights/scripts/detect-module.sh` | `MODULES=(client server reviewer-core e2e mcp)` |
| `.claude/skills/engineering-insights/SKILL.md:23` | Module table: add `mcp` |
| `.github/workflows/mcp.yml` (new) | Mirror of `reviewer-core.yml`: paths `mcp/**`, `server/src/vendor/shared/**`, the workflow file; Node 22, npm cache on `mcp/package-lock.json`; `npm ci`, `npm run typecheck`, `npm test`, `npm run build` |

## Steps
1. **Scaffold** `mcp/` (package.json, tsconfig, vitest config, CLAUDE.md, INSIGHTS.md header). Run `npm install`, then `npm run typecheck`. Confirm only `package-lock.json` exists.
2. **Domain.** `errors.ts`, `match.ts`, `shape.ts`, plus `test/domain.test.ts`. Write the test first, then `npm test`.
3. **Port + adapter.** `port.ts`, `http-api.ts`, plus `test/http-api.test.ts`.
4. **Use cases.** `usecases.ts` with `waitForRun`, plus `test/usecases.test.ts` (FakeApi, `pollMs:1`, `waitMs:50`).
5. **Presentation + root.** `server.ts`, `index.ts`, plus `test/server.test.ts` and `test/budget.test.ts`. Confirm SDK import paths (`McpServer.registerTool`, `StdioServerTransport`, `InMemoryTransport`) against the installed SDK README.
6. **Repo integration.** Every row of the "Changes outside mcp/" table, plus `mcp/README.md`.

## Verification
- `cd mcp && npm run typecheck && npm test && npm run build`. All green, no network.
- `bash .claude/skills/pr-self-review/scripts/gate.test.sh` still passes (the skill-map names existing skills).
- `bash .claude/skills/engineering-insights/scripts/detect-module.sh` prints `mcp/INSIGHTS.md` when mcp files are changed.
- Import-direction check by grep:
  - `grep -n "http-api" mcp/src/{usecases,server}.ts` → empty
  - `grep -n "modelcontextprotocol" mcp/src/{usecases,match,shape,errors,port}.ts` → empty
- Manual:
  1. `docker compose up -d` + `cd server && pnpm dev`. Use `npm run inspect` and call each tool on a real repo/PR.
  2. In a new Claude Code session, approve `devdigest`. Ask "review PR #N of owner/name with <agent>". Check the flow list_agents → run_agent_on_pr → (get_findings).
  3. `/context` shows the devdigest tools at about 1.5k tokens or less.
- `/pr-self-review` before the PR (otkachuk777/dev-digest ← main). The archived plan goes into the implementation commit.

## Risks / not verified
- Claude Code's `MCP_TOOL_TIMEOUT` must be at least 120 s. Check during the manual run; if it is shorter, document the env var in the README.
- `GET /repos/:id/pulls` syncs with GitHub on every resolve. That adds latency; acceptable for now.
- First reviews (intent + slow model) will often hit 120 s. This is handled by the running + get_findings path.
