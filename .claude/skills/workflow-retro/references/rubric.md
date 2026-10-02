# Retro rubric

Judge from `digest.md`. Every claim cites a signal (a digest row, a count, an excerpt) or a transcript line you opened. No evidence → no claim.

## Reading the numbers

| Signal | Means | Typical cause |
|---|---|---|
| processed ≫ peak × turns / 2 | context grew turn after turn | many small slice reads / edits; see `INSIGHTS.md` "implementer cost = iterations × context" |
| peak > 150K | near the window; quality drops, compaction risk | chunk too big; agent read whole modules |
| cache hit < 80% | prompt prefix keeps changing | long prompts rebuilt per call, frequent tool output churn, agent spawned cold several times |
| orchestrator share > 40% | main session does the work agents should | orchestrator reads/edits instead of delegating, or pastes big context into each prompt |
| same file read ≥2× in one agent | slice reading (`sed -n a,bp` repeatedly) | agent doesn't read once whole; prompt didn't give the content |
| file read by ≥2 agents | shared context rediscovered | candidate for the plan / prompt to carry the facts (not for every case: reviewers must read code themselves) |
| prompt-named reads | agent read what its prompt pointed to | fine when the prompt said "read X"; waste when the prompt already contained X |
| errors `hook-denied` / `permission` | agent tried a tool its guard forbids | agent prompt or `tools:` doesn't tell it the allowed way |
| errors `exit-code` + retried | command failed then repeated | flaky test, wrong cwd, missing env; check whether the retry changed anything |
| same type ×2+ in a session | rework (gate retries, fix rounds) or chunking | read the reports to tell planned chunks from rework |
| serial read-only pair | two independent read-only agents ran one after another | could run in parallel (one message, two Agent calls) |
| agent wall ≪ agent sum | parallelism used; ≈ → fully serial | |
| long duration, few turns | agent waited, not worked | duration = first → last transcript line, so it includes idle time between `SendMessage` rounds (spec-creator Q&A) |
| human interventions | user corrected course mid-run | what in a prompt/spec/plan would have made it unnecessary |

## Per agent (every agent in the digest)

- **Easy:** what it finished with few turns/errors — keep as is.
- **Struggled:** where turns, errors, retries or re-reads cluster; why (quote).
- **Missing input:** facts it had to discover that the caller already had (prompt-named reads, cross-agent reads), tools it was denied.
- **Missed vs plan/spec:** for implementer / plan-verifier / reviewers, compare the final report to the plan items and ACs it was given (open the plan when needed).
- **Model fit:** `keep` / `up` (sonnet → opus: repeated failures, shallow report) / `down` (opus → sonnet/haiku: < ~15 turns, no errors, mechanical task). One line why.

## Per type extras

| Type | Look at |
|---|---|
| spec-creator | rounds of questions, researcher spawns, re-reads of the same design source |
| implementation-planner | brainstorm count and whether each changed the plan; plan rewrites |
| brainstorm / researcher | duplicated reads with siblings; web fetch failures |
| implementer | Deviations, test-first adherence (test red before code), full-suite runs per chunk |
| test-writer | proof that each test can fail |
| plan-verifier | Not met / Partially met items; **plan fidelity**: out-of-scope changes it reported |
| reviewers | findings per round, disputed / false positives, overlap between reviewers |
| doc-writer | statements checked against code |

## Workflow level

- Order: anything that ran before its input existed, or waited for something it did not need.
- Lost parallelism: serial read-only pairs; agent wall vs sum.
- Duplicated context: what several agents rediscovered → should it live in the plan, the spec or a skill?
- Rework loops: root cause of each repeat (spec gap, plan gap, implementer miss, reviewer noise).
- Human interventions: for each, the artifact that should have carried that decision.

## Proposed changes

Each change:

```
### P<n>. <target file> — <one-line intent>
Evidence: <digest signal / transcript line>
Current: > <quoted text, or "(new)">
Proposed: > <replacement>
Expected effect: <metric that should move, e.g. "planner re-reads of prompt.ts 3 → 1">
```

Targets: `.claude/agents/*.md`, `.claude/skills/impl/**`, `.claude/agents/scripts/*` (guards). Never the spec or the plan.
Only propose a change with evidence from this run; mark a proposal that rests on one observation as `(single observation)`.

## Report template

`docs/workflow-retros/YYYY-MM-DD+<run>.md` (`<run>` = `spec-NN` lower-case, or the first 8 chars of the session id)

```markdown
# Workflow retro: <run>

- Date · sessions (id, branch, phase) · digest command

## Summary
3–5 bullets: what went well, the biggest cost, the biggest friction.

## Metrics
Totals line + the Agents table from the digest (trimmed columns ok).

## Timeline
Mermaid gantt (one bar per agent, sections per session/phase) + agent tree (flowchart parent → child).

## Per agent
One subsection per agent: Easy / Struggled / Missing input / Missed / Model fit.

## Duplication
## Rework and human interventions
## Proposed changes
P1…Pn in the format above.
```

Index row (`docs/workflow-retros/index.md`):

`| date | run | sessions | agents | processed main | processed sub | orchestrator % | cache hit (sub, weighted) | review rounds | plan-verifier runs | interventions | errors | report |`
