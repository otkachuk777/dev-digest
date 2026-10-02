# 08-project-context

**Spec:** SPEC-01 (AC-46) — `specs/SPEC-01-project-context-folder.md`.

**User journey:** Attach a repo doc to an agent, run the agent on a PR, and see the doc in the run trace.

**Fixture:** `scripts/e2e.sh` (hermetic) and `.github/workflows/e2e-web.yml` (CI) export `DEVDIGEST_CLONE_DIR` to a fresh temp dir and write `acme/payments-api/docs/e2e-invariant.md` (marker `E2E-INVARIANT-7f3a`) before the API starts. The seeded repo then lists exactly that one doc (clone = directory exists).

**What it tests:**
- The agent editor's Context tab lists the repo's doc and attaching it saves (`1 of 1 attached`).
- Running the agent on PR #482 reaches doc resolution. Docs are resolved BEFORE the LLM provider, so the run records them whether it fails (no API key, CI) or succeeds (key present locally) (AC-41).
- The run trace shows the path in the "Specs read" row and the doc text in the "Project context — attached specs (untrusted)" prompt block.

**Notes:**
- The first step sets a tall viewport: the trace drawer scrolls internally and `agent-browser` clicks do not scroll it, so the collapsed "Prompt assembly" section would be off-screen.
- The doc checkbox is clicked by its path text (the kit `Checkbox` is a `role=checkbox` button inside a `<label>`; `find role checkbox --name` and `find label` do not resolve it).
- With a real provider key in `~/.devdigest/secrets.json` the run makes a real (paid) LLM call; the flow passes either way.
