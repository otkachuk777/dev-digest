# DevDigest MCP server

A local stdio [MCP](https://modelcontextprotocol.io) server that lets an MCP
client (e.g. Claude Code) drive DevDigest PR reviews from chat. It is a thin
wrapper over the running DevDigest Fastify API (`server/`) — no database
access, no duplicated review logic.

## Tools

| Tool | What it does |
|---|---|
| `list_agents` | List configured reviewer agents. Call first. |
| `run_agent_on_pr` | Review a PR with one agent: starts the run, waits up to 120 s, returns verdict + findings. If still running, returns a `run_id` to poll with `get_findings`. |
| `get_findings` | Get the verdict/findings of a review run (newest run if `run_id` is omitted). |
| `get_conventions` | Get a repo's accepted coding conventions with file:line evidence. |
| `get_blast_radius` | PR impact map. Not implemented yet — always returns an error. |

## Setup from scratch

The MCP server is **opt-in**: `scripts/dev.sh` never starts it, and the repo has
no root `.mcp.json`, so Claude Code does not spawn it in every session. You
connect it only when you want it. It is a stdio process — the MCP client
(Claude Code) starts it as a child and it exits with the session; there is no
daemon to run or stop.

### 0. Prerequisites

- Node 22+ and npm (this package uses npm, not pnpm)
- The DevDigest stack prerequisites: Docker + pnpm (see the root `README.md`)
- Claude Code CLI (`claude --version`)

### 1. Start the DevDigest API (the MCP server is only a proxy)

```bash
./scripts/dev.sh              # Postgres → migrate → seed → server (:3001) + client (:3000)
./scripts/dev.sh --no-client  # enough for MCP: API only
curl -s localhost:3001/health # → 200
```

`run_agent_on_pr` calls the LLM, so `server/.env` needs a model key
(`OPENROUTER_API_KEY` for the default models); `GITHUB_TOKEN` lets the API
import fresh PRs. Read-only tools work on the seeded data without keys.

### 2. Install and build the MCP server (once, and after pulling changes)

```bash
cd mcp
npm ci
npm run build        # → mcp/dist/index.js
npm test             # optional: 44 hermetic tests, no API needed
```

### 3. Check it on its own (optional)

```bash
cd mcp
npm exec devdigest-mcp                 # stdio server; prints "devdigest-mcp: connected…" to stderr, Ctrl+C to stop
npm run inspect                        # MCP Inspector UI: call each tool by hand
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
```

### 4. Connect it to Claude Code — only when you need it

**Per session (recommended).** From the repo root:

```bash
claude --mcp-config mcp/claude-mcp.json
```

The server exists for that session only. `mcp/claude-mcp.json` uses the
relative path `mcp/dist/index.js`, so start `claude` from the repo root.

**Toggle for this project** (also works in the desktop app's Code tab):

```bash
claude mcp add devdigest --scope local -e DEVDIGEST_API_URL=http://localhost:3001 -- node "$PWD/mcp/dist/index.js"
claude mcp remove devdigest --scope local   # turn it off again
```

`--scope local` keeps it private to you and this checkout (stored in
`~/.claude.json`, not in git).

**Keep the build fresh.** Both options run `mcp/dist/index.js`, not the source.
Claude's own edits to `mcp/src` trigger `npm run build` via a PostToolUse hook
(`.claude/settings.json`); after a manual edit or `git pull`, run `cd mcp && npm run build`.
The change takes effect in the next session.

### 5. Use it

In the session, check `/mcp` shows `devdigest` connected, then ask e.g.
"review PR #6 of otkachuk777/dev-digest with the Security Reviewer". The
expected flow is `list_agents` → `run_agent_on_pr` → (if still running)
`get_findings`.

### Troubleshooting

| Symptom | Fix |
|---|---|
| "DevDigest API not reachable at …" | Start the API (step 1); check `DEVDIGEST_API_URL` |
| `/mcp` shows devdigest failed | `mcp/dist/index.js` missing → `npm run build`; started `claude` outside the repo root → use the absolute-path variant |
| "PR #N not found … Known PRs: …" | The API only knows imported PRs; open the repo in the DevDigest UI or set `GITHUB_TOKEN` |
| `run_agent_on_pr` returns `status: running` | Normal for slow models (120 s cap) — call `get_findings` with the returned `run_id` later |

Environment: `DEVDIGEST_API_URL` (default `http://localhost:3001`).

## Development

- `npm run dev` — run `src/index.ts` directly via `tsx` (no build step).
- `npm run typecheck` — the real type-safety gate (`tsc --noEmit`).
- `npm test` — vitest (domain, use cases with a `FakeApi`, the server via an
  in-memory MCP transport, the HTTP adapter with a stubbed `fetch`, and a
  token-budget guard on `tools/list`).
- `npm run build` — emits `dist/*.js` via esbuild (per-file transpile, not a
  bundle). `tsc` alone can't produce a flat `dist/index.js` here because it
  also type-checks — and therefore tries to emit — every file reachable
  through the `@devdigest/shared` alias, even though this package only ever
  `import type`s from it; esbuild strips types per file without following
  that cross-package alias at all. See `INSIGHTS.md`.
- `npm run inspect` — run the built server under the
  [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to call
  each tool manually against a real repo/PR.

## Context cost (`/context`, measured 2026-09-27)

Measured with `claude -p "/context" --strict-mcp-config --mcp-config <cfg>`,
Claude Code 2.1.280. "Total" is the whole context at chat start; `ENABLE_TOOL_SEARCH=false`
loads every tool schema up front, `true` defers them behind Tool Search.

| Setup | Tool Search | MCP tools | Tools | Total at start |
|---|---|---|---|---|
| Baseline (no MCP) | off | — | 0 | 65.5k |
| Baseline (no MCP) | on | — | 0 | 41.7k |
| `devdigest` | off | 871 | 5 | 66.3k |
| `devdigest` | on | 870 (deferred) | 5 | 41.7k |
| GitHub MCP, all toolsets | off | 41.2k | 95 | 107.5k |
| GitHub MCP, default toolsets | off | 19.2k | 46 | 85.4k |
| GitHub MCP, `pull_requests` only | off | 5.3k | 10 | 71.5k |
| GitHub MCP, all toolsets | on | 41.2k (deferred) | 95 | 41.7k |

Per tool (`devdigest`, loaded): `list_agents` 79 · `get_blast_radius` 150 ·
`get_conventions` 173 · `run_agent_on_pr` 227 · `get_findings` 241.
Takeaways: `devdigest` costs ~1/47 of the full GitHub MCP; narrowing GitHub
toolsets cuts 41.2k → 5.3k; Tool Search defers MCP schemas entirely, so the
start-of-chat total equals the baseline. `test/budget.test.ts` keeps
`tools/list` + `instructions` under 6000 chars.

## Design notes

Every tool response is small and flat by design (outcome, not operation;
flat primitive arguments; a capped, shaped result; errors that lead forward
as `isError` text, never a thrown stack) — see
`docs/cc-plans/2026-09-27+mcp-server.md` for the full rationale and the exact
tool specs. `src/` is laid out by Onion Architecture file role
(`errors.ts`/`match.ts`/`shape.ts`/`inputs.ts` domain → `port.ts` → `http-api.ts` infra →
`usecases.ts` application → `server.ts` presentation → `index.ts` root); see
`CLAUDE.md`.
