# HW2 criteria audit (53 items; #1–2 excluded by the author)

Evidence: **live** = driven in the running app (DOM/API/Postgres), **test** = unit/integration test in
this branch, **static** = read from the code (not exercised).

| # | Status | Evidence |
|---|---|---|
| 3 | PASS | `.claude/skills/frontend-ui-architecture/SKILL.md` (name approximate, per the criteria) — static |
| 4 | PASS | `.claude/skills/onion-architecture/SKILL.md` — static |
| 5 | PASS | `.claude/skills/pr-self-review/SKILL.md`: a `## Workflow` that dispatches to per-file skills — static |
| 6, 44 | PASS | sidebar has WORKSPACE (Pull Requests) and SKILLS LAB (Skills, Agents, Conventions) — live |
| 7 | PASS | Agents page renders `AgentCard` grid — static |
| 8 | PASS | created via `POST /skills`, row found with `psql`, deleted in the DB → `GET /skills` no longer lists it — live |
| 9 | PASS | card: name, type, description, enabled toggle (+ version, agent count) — test |
| 10 | PASS | list stays on the left, editor opens on the right of the same screen (no modal, no separate page) — live |
| 11, 12 | PASS | *Add Skill* → create / import; create is a modal with name, description, type, markdown body — live |
| 13, 31 | PASS | dragged `breaking-change` in the agent's Skills tab; only attached **and** enabled rows are `draggable` — live + test |
| 14 | PASS | order after the drag was `response-schema, semver-discipline, deprecation-policy, breaking-change`; the run trace's skills block had the same order — live |
| 15 | PASS | `.md` and `.zip` both import; the drawer previews the skill core and lists what is *not imported* — live |
| 16 | PASS | `deprecation-policy` has `source: imported_file` and is linked to the new agent — live |
| 17 | **CAVEAT** | Test Quality on #483: `server/INSIGHTS.md` records that with skills OFF it already found the uncovered branches (2 findings, `comment`); with skills it is sharper (3 findings, `request_changes`). Not "no flag" vs "flag" — not re-run here |
| 18 | **PARTIAL** | API Contract on #484/#485 — see `api-contract-experiment.md`: the base agent catches most breaking changes on its own; skills make it consistent (both wire changes CRITICAL in every run) and add version/deprecation findings. On #485 one of two no-skills runs missed the 201 change |
| 19 | PASS | trace → Prompt assembly → *Skills (dynamic)* shows `~N tokens` for that block only (chars / 4); live trace of the with-skills run had a ~2 100-token block — test + live API |
| 20 | PASS | run without skills has no skills block in the trace; run with skills has it — live API + test |
| 21 | TO RUN | `/pr-self-review` on the diff (client + server changes) — run before opening the PR |
| 22–24 | PASS | card shows `v{version}` and `{n} agents`; Delete button opens a confirm / cancel / ✕ modal — test |
| 25–27 | PASS | `/skills/:id` tabs Config, Preview (rendered markdown), Versions (list) — static |
| 28, 29 | PASS | Diff (vs current) and Restore per older version; restore appends a new version, history untouched; cross-workspace → 404 — test + integration test |
| 30 | PASS | filter box in the agent's Skills tab — static |
| 32–34 | PASS | agent tile: name, description, `provider · model`, toggle, skill count; Delete → confirm modal — test |
| 35, 36 | PASS | exactly Config and Skills tabs; config has name, description, provider, model (list), strategy, prompt — static |
| 37 | PASS | tab lists every skill in the workspace with type label and a toggle on each row (switching an unattached one on attaches it) — test |
| 38 | PASS | `POST /repos/:id/conventions/extract` persists to Postgres; a reload shows the same candidates — live |
| 39 | PASS | configs + `repoIntel.getConventionSamples(repoId, 12)`, no model in that step — static |
| 40 | PASS | model returns `{category, rule, confidence, evidence{path, start_line, end_line, snippet}}` (Zod-validated) — test |
| 41 | PASS | *Create skill* modal edits name, description, type, enabled, agent and the whole body — live |
| 42 | PASS | accepted candidates → one skill `repo-conventions` (`source: extracted`), attached to *General Reviewer* from the modal — live |
| 43 | PASS | four skills with directive descriptions and Bad → Good examples — `docs/api-contract-skills/` |
| 45–47 | PASS | *Run Scan* and *ReScan* buttons; cards show rule, source file:lines, confidence; Accept / Reject / Edit — live |
| 48 | PASS | Reject deletes the row: gone after reload, absent from the skill — test + live |
| 49 | PASS | Edit swaps the rule for an input in place — test |
| 50 | PASS | *Create skill* renders only when at least one candidate is accepted — live + test |
| 51, 52 | PASS | modal explains it merges accepted conventions; Name/Description; Cancel/Create; the skill shows on the Skills page — live |
| 53 | PASS | Settings → Models has a *Conventions* row with a searchable model list from OpenRouter; the scan reads the model from it — live |
