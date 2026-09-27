# Insights — mcp

Lessons an agent cannot guess from the code alone. Read this before starting work in
this module; append to it at wrap-up, but only when something non-obvious came up.
Append-only — correct an entry with a dated note beneath it, never by rewriting it.
See `.claude/skills/engineering-insights/`.

## What Works

_No entries yet._

## What Doesn't Work

_No entries yet._

## Codebase Patterns

_No entries yet._

## Tool & Library Notes

### `tsc` with a cross-package `paths` alias emits into the other package (2026-09)

`mcp/` reads `@devdigest/shared` types through a tsconfig `paths` alias pointing at `../server/src/vendor/shared`. Even with `import type` only, plain `tsc -p` with `outDir` emits `.js` for every file in the type-checking program: the entry landed at `dist/mcp/src/index.js`, and one attempt wrote 24 `.js`/`.js.map` files straight into `server/src/vendor/shared/` (a do-not-touch dir). `rootDir: "src"` just turns it into `TS6059`; project references would need a tsconfig inside vendor/shared.

**Rule:** build with esbuild per-file transpile (`esbuild src/*.ts --outdir=dist --outbase=src`) and keep `tsc --noEmit` as the type gate; after any build experiment run `git status server/src/vendor/shared` (`mcp/package.json` `build` script)

### Headless `claude -p` inherits plan mode — pass `--permission-mode default` (2026-09)

Checking the MCP flow with `claude -p "…" --mcp-config .mcp.json` first produced no MCP calls at all: the user's settings default to plan mode, so the headless session wrote a plan file into `~/.claude/plans/` and asked for approval. `/context` works headless too and is the cheapest way to measure tool-schema cost per config.

**Rule:** for scripted checks use `claude -p "<prompt>" --permission-mode default --strict-mcp-config --mcp-config .mcp.json --allowedTools "mcp__devdigest__…" --output-format stream-json --verbose`; for token cost use `claude -p "/context" --strict-mcp-config --mcp-config <cfg>` with `ENABLE_TOOL_SEARCH=false|true` (numbers in `mcp/README.md` § Context cost)

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
