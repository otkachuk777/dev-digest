# Eval results — snapshot 2026-10-08

Committed summary of eval runs whose raw output lives in gitignored folders
(`.claude/skills/*-workspace/`, `evals/results/`). Nothing here was re-run for this report: every
number is copied from the saved `benchmark.json` / `repeat-*.json` / `records.jsonl`.

## 1. Skill Creator — with vs without skill (repeated trials)

Source: `.claude/skills/<skill>-workspace/iteration-N/benchmark.json` (skill-creator v2 benchmark,
3 runs per configuration). Pass rate is the share of the skill's `evals/evals.json` expectations met.

| skill | iteration | config | runs/config | pass rate mean ± sd [min–max] | tokens mean | time s mean |
|---|---|---|---|---|---|---|
| dependency-checker | 1 | with_skill | 3 | 0.94 ± 0.05 [0.91–1] | 65420 | 97.0 |
| dependency-checker | 1 | without_skill | 3 | 0.72 ± 0.03 [0.69–0.75] | 62193 | 94.4 |
| dependency-checker | 1 | **delta** | | **+0.22** | +3227 | +2.6 |
| dependency-checker | 2 | with_skill | 3 | 1.00 ± 0.00 [1–1] | 68476 | 82.9 |
| dependency-checker | 2 | without_skill | 3 | 0.72 ± 0.03 [0.69–0.75] | 62193 | 94.4 |
| dependency-checker | 2 | **delta** | | **+0.28** | +6283 | -11.5 |
| onion-architecture | 1 | with_skill | 3 | 0.93 ± 0.12 [0.8–1.0] | 58320 | 34.2 |
| onion-architecture | 1 | without_skill | 3 | 0.80 ± 0.00 [0.8–0.8] | 51059 | 34.6 |
| onion-architecture | 1 | **delta** | | **+0.13** | +7260 | -0.4 |
| onion-architecture | 2 | with_skill | 3 | 0.85 ± 0.12 [0.6–1.0] | 59468 | 41.0 |
| onion-architecture | 2 | without_skill | 3 | 0.65 ± 0.09 [0.6–0.8] | 51579 | 39.5 |
| onion-architecture | 2 | **delta** | | **+0.20** | +7889 | +1.5 |
| onion-architecture | 3 | with_skill | 3 | 0.93 ± 0.10 [0.8–1.0] | 59493 | 36.5 |
| onion-architecture | 3 | without_skill | 3 | 0.67 ± 0.10 [0.6–0.8] | 51747 | 37.4 |
| onion-architecture | 3 | **delta** | | **+0.27** | +7746 | -0.9 |
| onion-architecture | 4 | new_skill | 3 | 0.93 ± 0.10 [0.8–1.0] | 59333 | 36.3 |
| onion-architecture | 4 | old_skill | 3 | 0.89 ± 0.15 [0.6–1.0] | 58337 | 33.9 |
| onion-architecture | 4 | **delta** | | **+0.04** | +997 | +2.4 |

Reading: both skills give a consistent lift over the raw model (+0.13…+0.28 pass rate) at a cost of
~3–8k extra tokens per run. Iteration 4 of onion-architecture compares two versions of the skill
(new vs old), not skill vs no skill; its +0.04 sits inside the spread (sd 0.10–0.15), so it is not
a measurable improvement.

The repo's own harness confirms the dependency-checker lift independently
(`evals/results/benchmarks/2026-10-07T19-51-45-490Z/benchmark.md`, task model `claude-haiku-4-5`,
judge `claude-sonnet-5`, 2 runs/config): pass rate 100% candidate vs 67% baseline (+33%), with
`tokens_out` 5890 ± 3171 vs 2096 ± 673.

## 2. Two agent versions — `architecture-reviewer` (strict) vs `architecture-reviewer-lite`

`-lite` is the same agent with the "every finding must cite a documented rule" hard rule removed
(`.claude/agents/architecture-reviewer-lite.md`). Both run the same cases
(`evals/agents/architecture-reviewer/architecture-reviewer.cases.ts`), so the series are a controlled A/B.

Source: `evals/results/repeat-strict3.json` and `repeat-lite3.json` (`pnpm eval:repeat … -n 2
--label strict3|lite3`, sha `8e394aa` + the case fixes later committed in `0d254dc`).
**n = 2 per version**: the spread shows the range, but the stddev is only an indication.

| case | strict pass | lite pass | strict duration s (mean ± sd [min–max]) | lite duration s | strict tok_out | lite tok_out |
|---|---|---|---|---|---|---|
| flags both violations in the checkout diff with severity and a citable rule | 2/2 | 0/2 | 49.0 ± 2.7 [47.1–50.9] | 43.4 ± 7.7 [37.9–48.8] | 3697 ± 157 [3586–3808] | 3307 ± 520 [2939–3675] |
| does not fabricate an architecture finding for the out-of-scope security-shaped change | 2/2 | 0/2 | 43.6 ± 3.4 [41.3–46.0] | 46.1 ± 5.9 [42.0–50.3] | 3362 ± 315 [3139–3584] | 3376 ± 436 [3068–3685] |
| cites the DevDigest-specific rule identifier for reviewer-core violations | 1/2 | 1/2 | 66.1 ± 2.3 [64.5–67.7] | 107.9 ± 55.1 [68.9–146.8] | 4661 ± 960 [3982–5340] | 4558 ± 462 [4232–4885] |
| does not fabricate a documented-rule violation for a benign rename | 2/2 | 2/2 | 22.0 ± 0.0 [21.9–22.0] | 10.4 ± 1.6 [9.3–11.6] | 1906 ± 542 [1523–2290] | 854 ± 135 [758–949] |
| **total** | **7/8** | **3/8** | | | | |

Practices that differ between the versions (judge verdicts per run):

| case / practice | strict | lite |
|---|---|---|
| checkout diff / gives EVERY finding a non-empty Rule that cites a specific documented source | 2/2 | 0/2 |
| out-of-scope change / does not invent an architecture-contract violation for the optional `reply?: FastifyReply` parameter | 1/1 | 1/2 |
| out-of-scope change / stays scoped to structural/layering/DI findings, no comments on naming, style or test coverage | 1/1 | 0/2 |
| reviewer-core / flags that `runPipeline` returns `deduped` directly, skipping `groundFindings()` | 1/2 | 2/2 |
| reviewer-core / cites a specific documented source for the fs-import finding | 2/2 | 1/2 |

Reading: removing the hard rule shows up exactly where it should. Lite stops citing a rule per
finding (checkout 0/2 vs 2/2) and drifts out of scope (0/2 vs 1/1). It is not worse at *finding*
the reviewer-core bug (2/2 vs 1/2). It is cheaper only on the trivial rename case. Strict stays the
shipped version.

## 3. Workflow trace — dispatch, positive activation, negative control

Cases: `evals/workflow/review-workflow.cases.ts`. They run against the live harness
(`settingSources: ["project"]`) and assert on the tool trace, not on the answer text.
Source: `evals/results/records.jsonl`. Counts below use the trace criterion:
- dispatch: `architecture-reviewer` appears in `subagents`;
- positive activation: `engineering-insights` appears in `skills`;
- negative control: no skill is invoked and nothing is written.

| signal | case | sha `0d254dc` (Claude Code backend) | sha `2b13c5c` (OpenRouter, `anthropic/claude-haiku-5.5`) |
|---|---|---|---|
| dispatch | API-route task reads `server/docs/README.md` AND pulls the architecture-reviewer | 4/6 | 1/1 |
| positive activation | engineering-insights activates on a genuine discovery | 10/12 | 0/1 |
| negative control | near-miss — explaining the same topic must NOT record an insight | 7/7 no activation (vitest outcome 6/7: run `092248` failed on another assertion; no skill was invoked, cause not recorded) | 0/1 (hit the 4-turn limit before the assertion) |

One run where all three signals hold together, `run_id 20261008T091117` (outputs in
`evals/results/outputs/20261008T091117/`):

```json
{"case": "API-route task …",               "subagents": ["architecture-reviewer"], "skills": [],                      "tools": ["Read","Glob","Agent"], "reads": ["server/CLAUDE.md","server/docs/README.md"]}
{"case": "engineering-insights activates …", "subagents": [],                        "skills": ["engineering-insights"], "tools": ["Bash","Skill","Read"], "reads": ["server/INSIGHTS.md"]}
{"case": "near-miss negative …",             "subagents": [],                        "skills": [],                      "tools": [],                      "reads": []}
```

Known gap: on OpenRouter Haiku 5.5 the positive activation case does not invoke the Skill tool (it
reads `server/INSIGHTS.md` directly), and the negative case needs more than 4 turns. Not fixed here.
`evals/README.md` already treats `activation` as indicative on non-default backends.

## 4. Structural quality gate

`pnpm eval:quality` (no model calls), 2026-10-08: **18 skills, 0 failures**.
