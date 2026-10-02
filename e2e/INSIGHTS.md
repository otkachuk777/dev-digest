# Insights — e2e

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

### agent-browser clicks don't scroll; the kit Checkbox can't be found by role; local runs spend real LLM money (2026-10)

Writing flow 08 took the implementer about 100 turns.
- **Clicks don't scroll.** `find … click` doesn't scroll the target into view. The run-trace drawer scrolls internally, so a click on the collapsed "Prompt assembly" section landed on the backdrop and silently closed the drawer.
- **Checkbox lookup fails.** The kit `Checkbox` is a `role=checkbox` button inside a `<label>`. Neither `find role checkbox --name …` nor `find label …` resolved it.
- **Real LLM calls.** `scripts/e2e.sh` doesn't isolate `~/.devdigest/secrets.json`, so with a real key present the flow's review run made a paid call (~$0.0002). CI has no key and takes the failure path instead.

**Rule:**
- Start a flow that clicks inside drawers with `set viewport 1280 2400`.
- Click kit checkboxes by their label text (`find text "<path>" click`).
- Write assertions that hold whether the run succeeds or fails, e.g. wait for text unique to the new run (`e2e/flows/08-project-context.flow.json`, `e2e/flows-docs/08-project-context.md`).

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
