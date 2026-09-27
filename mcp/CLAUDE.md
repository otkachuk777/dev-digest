# mcp — conventions

Setup/run → see [README.md](README.md), не дублюй тут.

Local stdio MCP server — a thin wrapper over the running DevDigest Fastify API
(`server/`, default `http://localhost:3001`). No DB access, no duplicated
business logic; every tool resolves its inputs against the HTTP API and
shapes the response. Layout follows Onion Architecture by file role, not by
folder (`domain/`/`application/`/`infrastructure/` folders do not exist
here): `errors.ts`/`match.ts`/`shape.ts`/`inputs.ts` (pure domain; `inputs.ts` holds the zod tool-input shapes that `server.ts` registers and `usecases.ts` types against) → `port.ts` (the
`DevDigestApi` interface) → `http-api.ts` (fetch adapter, the only file that
imports `fetch`/HTTP concerns) → `usecases.ts` (orchestration, incl.
`waitForRun`) → `server.ts` (the only file that imports the MCP SDK;
`registerTool` with the `inputs.ts` shapes, annotations, result/error mapping) →
`index.ts` (composition root: wires `HttpDevDigestApi` to `createServer` and
starts the stdio transport). Package manager: **npm**
(`package-lock.json`) — never pnpm here (root `INSIGHTS.md`). Build:
`npm run build` (esbuild, per-file transpile to `dist/*.js` — see "Tool &
Library Notes" in `INSIGHTS.md` for why `tsc` alone can't emit `dist/index.js`
directly here). Dev: `npm run dev` (`tsx src/index.ts`). Test: `npm test`
(vitest). Typecheck: `npm run typecheck` (`tsc --noEmit`, the real
type-safety gate — `build` only strips types, it does not check them, so
always run `typecheck` too). Lint: not configured.

Rebuild: the registered `devdigest` server runs `mcp/dist/index.js`, not the
source. A PostToolUse hook in `.claude/settings.json` runs `npm run build` after
any Claude edit to `mcp/src/*.ts`; after editing by hand (or a `git pull`), run
`npm run build` yourself. New sessions pick up the new build; a running session
keeps the old process.

`pnpm arch` (dependency-cruiser) does not scan this package — the ring/import
rules for `mcp/` are checked by hand; see `.claude/skills/onion-architecture/SKILL.md`
("mcp/" section) for the allowed-imports table.

## Read when

- adding/changing a tool → `docs/cc-plans/2026-09-27+mcp-server.md` (tool specs,
  exact descriptions/`.describe()` text, error-text table)
- touching the DevDigest API shape this wraps → check the real contracts in
  `server/src/vendor/shared/contracts/*.ts` and routes in
  `server/src/modules/{agents,repos,pulls,reviews,conventions}/routes.ts`
  before assuming a field name
- **before any work → `INSIGHTS.md` (read first, always)**

## Naming

One file per ring role in `src/` (no `utils.ts` grab-bag): `errors.ts`,
`match.ts`, `shape.ts`, `port.ts`, `http-api.ts`, `usecases.ts`, `server.ts`,
`index.ts`. Tests in `test/<name>.test.ts`, one per source file plus
`budget.test.ts` (tool-list token-size guard). See root `CLAUDE.md` § Naming
for the full convention.

## Do not touch

- `package-lock.json` — never hand-edit; regenerate via `npm install` after a
  `package.json` change.
- `server/src/vendor/shared/` — this package only ever `import type`s from it
  via the `@devdigest/shared` tsconfig alias; never add a third copy of these
  types inside `mcp/`.
