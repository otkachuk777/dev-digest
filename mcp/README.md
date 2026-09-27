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

## Setup

1. Start the DevDigest server (`cd server && pnpm dev`) — the MCP server is
   only a proxy and does nothing without it.
2. Install and build:

   ```bash
   cd mcp
   npm ci
   npm run build
   ```

3. Point your MCP client at `node mcp/dist/index.js` (stdio). This repo's
   `.mcp.json` (root) already does this for Claude Code — approve the
   `devdigest` server when prompted.

Environment: `DEVDIGEST_API_URL` (default `http://localhost:3001`).

Standalone command: the package exposes a `devdigest-mcp` bin, so from `mcp/`
`npm exec devdigest-mcp` starts the stdio server (after `npm run build`).

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
