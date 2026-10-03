# 08-project-context

**Spec:** SPEC-01 (AC-46) — `specs/SPEC-01-project-context-folder.md`.

**User journey:** Attach a repo doc to an agent, run the agent on a PR, and see the doc in the run trace.

**Fixture:** `scripts/e2e.sh` (hermetic) and `.github/workflows/e2e-web.yml` (CI) export `DEVDIGEST_CLONE_DIR` to a fresh temp dir and write `acme/payments-api/docs/e2e-invariant.md` (marker `E2E-INVARIANT-7f3a`) before the API starts. The seeded repo then lists exactly that one doc (clone = directory exists).

**What it tests:**
- The agent editor's Context tab lists the repo's doc and attaching it saves (`1 of 1 attached`).
- Running the agent on PR #482 reaches doc resolution. Docs are resolved BEFORE the LLM provider, and the API runs keyless, so the run deterministically fails with `OPENROUTER_API_KEY is not configured` (shown on its Timeline row; a failed run has no review-run accordion) yet its trace still carries the docs (AC-41). The flow settles on that error text, then opens the trace from the Timeline row.
- The run trace shows the path in the "Specs read" row and the doc text in the "Project context — attached specs (untrusted)" prompt block.

**Notes:**
- The first step sets a tall viewport: the trace drawer scrolls internally and `agent-browser` clicks do not scroll it, so the collapsed "Prompt assembly" section would be off-screen.
- The doc checkbox is clicked by its path text (the kit `Checkbox` is a `role=checkbox` button inside a `<label>`; `find role checkbox --name` and `find label` do not resolve it).
- Keyless by construction: CI has no key; `scripts/e2e.sh` starts the API with `HOME` set to an empty temp dir (secrets live at `$HOME/.devdigest/secrets.json`) and `OPENAI/ANTHROPIC/OPENROUTER_API_KEY` unset, so the user's real secrets file is never read. The clone dir lives inside that temp HOME. Running `npm test` against a stack that has a key makes the run succeed and the flow fail at the settle step.
