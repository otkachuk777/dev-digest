# Plan: `/workflow-retro` — retrospective of an SDD workflow run

- Date: 2026-10-01
- Branch: `feat/workflow-retro` from `L05-lab` (deliberate exception to "worktrees from main": SDD agents and `/impl` exist only on L05-lab)
- Type: tooling (Claude Code skill), no product code

## Goal

After an SDD run (spec-creator → implementation-planner (→ brainstorm) → /impl: implementer, test-writer, plan-verifier, reviewers, doc-writer) produce a retrospective: how many agents ran, in what order, token usage, where agents struggled, what was easy, what was duplicated, what was missed — and concrete proposed edits to `.claude/agents/*.md` / `/impl`, applied only after the user says yes in chat.

Boundary with `/engineering-insights`: that one records lessons about **code** (module `INSIGHTS.md`); this one about **agents and the workflow**.

## Decisions (agreed with user)

| # | Decision |
|---|---|
| D1 | Output = report + proposed diffs to agent definitions; nothing applied without chat approval |
| D2 | Project skill: `.claude/skills/workflow-retro/` |
| D3 | Approach A: deterministic stdlib Python digest → LLM analyses the digest only (targeted raw-transcript reads when a signal is unclear) |
| D4 | Unit = whole `SPEC-NN` across sessions; no arg = current session; also accepts a sessionId |
| D5 | Manual `/workflow-retro` + new step in `/impl` Phase 4 (after PR, before `/engineering-insights`) |
| D6 | No $ cost |
| D7 | Reports in `docs/workflow-retros/YYYY-MM-DD+spec-NN.md` (+ `index.md` trend table) |
| D8 | MVP metrics: cache hit (2), re-discovery (3), rework loops (4), model fit (5), lost parallelism (6), human interventions (7), trend index (8), plan fidelity (9). Skipped: $ cost (1), post-merge quality (10) |

## Transcript facts (verified on real files)

- Main session: `~/.claude/projects/<slug>/<sessionId>.jsonl`; worktrees have their own slugs → scan every `~/.claude/projects/*dev-digest*` dir.
- Subagents: `<slug>/<sessionId>/subagents/agent-<id>.jsonl` + `.meta.json` `{agentType, description, toolUseId, parentAgentId?, spawnDepth, model?, requestShape}`. Nested agents (depth 2–3) live in the same flat dir, linked by `parentAgentId`.
- Parent's `tool_result` for an `Agent` call carries `toolUseResult` `{agentId, agentType, resolvedModel, totalDurationMs, totalTokens, totalToolUseCount, usage{input, cache_read, cache_creation, output}, toolStats{readCount, bashCount, editFileCount, linesAdded, linesRemoved, …}, status}` — authoritative per-agent numbers.
- One assistant message spans several jsonl lines with the same `message.id` and duplicated `usage` → **dedupe by `message.id`** when summing main-session usage.
- Errors: `tool_result` blocks with `is_error: true` (incl. user rejections and hook denials; classify by text).
- Human prompts: `type: "user"`, `content` is a string, not `isMeta`, not `isSidechain`.
- Current session id: env `CLAUDE_CODE_SESSION_ID`.

## Files

```
.claude/skills/workflow-retro/
  SKILL.md
  scripts/collect.py          # stdlib only
  scripts/collect.test.py     # assert-based, runs on fixtures
  scripts/fixtures/           # tiny synthetic project dir: 2 sessions, main + 3 subagents (1 nested), 1 error, 1 SendMessage
  references/rubric.md        # what the LLM judges per agent type + report template
docs/workflow-retros/index.md # trend table header (rows appended per run)
.claude/skills/impl/SKILL.md  # Phase 4: new step
.claude/skills/README.md      # catalog row
.claude/agents/README.md      # one line: where retros live (only if it has a workflow section)
```

## Step 1 — `collect.py` (test first)

CLI: `collect.py [SPEC-NN | <sessionId>] [--projects-root ~/.claude/projects] [--out <dir>] [--excerpt 1500]`
Default arg: `$CLAUDE_CODE_SESSION_ID`. Writes `<out>/digest.json` and `<out>/digest.md` (default out = `$TMPDIR/workflow-retro/<arg>`), prints paths.

Session selection for `SPEC-NN`: a session matches if `SPEC-NN` (case-insensitive, word-bounded) appears in a human prompt, an `Agent` tool_use prompt, or a Bash `git commit` command containing `SDD(SPEC-NN)`. Sessions sorted by first timestamp.

Digest contents:
1. **Sessions**: id, slug, branch, first/last ts, human prompt count, main-session usage (deduped), phase guess (`spec` if spawns spec-creator, `plan` implementation-planner, `impl` if `/impl` prompt or implementer spawns; else `other`).
2. **Agents** (tree): id, parent, depth, type, description, model, start/end ts, duration, totalTokens, usage split, **cache hit ratio** = cache_read / (input + cache_read + cache_creation), tool counts, peak context (max per-call input+cache tokens from the subagent jsonl), error count, denial count, SendMessage follow-ups received, delegation prompt + final report excerpts.
3. **Timeline**: ordered spawns; overlap groups; **lost parallelism** = sum of agent durations vs wall-clock of the phase; consecutive independent read-only agents (researcher/reviewers/brainstorm) run serially flagged.
4. **Duplication**: files Read by ≥2 agents (paths, agents, sizes); same file Read ≥2× in one agent; identical Bash commands across agents; **re-discovery** = files an agent Read whose path appears in its own delegation prompt or in the plan file it was given.
5. **Difficulty signals**: errors by class (user-rejected / hook-denied / permission / exit-code / other), same command retried after failure, agent types spawned ≥2× in a phase (**rework loops**: gate attempts, review rounds from `SDD(SPEC-NN): review-<n>` commits and reviewer spawns).
6. **Human interventions**: human prompts after the first in each session, with timestamp and 200-char excerpt.
7. **Totals**: agents by type, total tokens (main + subagents), share orchestrator vs subagents.

`digest.md` = same as tables, sized for LLM reading (target ≤ 30K tokens; excerpts truncated).

Tests (`collect.test.py`, `python3 collect.test.py`): fixture → asserts on agent count & tree (nested parent link), dedupe by message.id, cache hit ratio, error classification, cross-agent duplicate read, re-discovery hit, SPEC matching picks 2 of 3 sessions, missing subagents dir doesn't crash.

## Step 2 — `references/rubric.md`

Per agent (all types): easy / struggled (+ evidence: signal + transcript line) / missing from prompt or tools / missed vs plan or spec / **model fit** verdict (keep / up / down with reason).
Per type extras: spec-creator (questions rounds, researcher use), implementation-planner (brainstorm count, plan revisions), implementer (Deviations, test-first adherence), plan-verifier (Not met items, **plan fidelity**: out-of-scope changes), reviewers (findings per round, false positives disputed), test-writer (proved-fail).
Workflow-level: order problems, lost parallelism, duplicated context, rework loops root cause, human interventions — what would have avoided each.
Proposed changes: each = target file, quoted current text, replacement, linked evidence, expected effect. No change without evidence.
Report template (sections below).

## Step 3 — `SKILL.md`

Frontmatter: `name: workflow-retro`, description (trigger: after an SDD/multi-agent run, "retro", "how did the workflow go", `/workflow-retro`), `argument-hint: [SPEC-NN | sessionId]`.
Flow:
1. Run `collect.py`; read `digest.md` (not raw transcripts).
2. Analyse per `rubric.md`; open raw subagent jsonl only for a specific unclear signal, with `offset/limit` or grep.
3. Write `docs/workflow-retros/YYYY-MM-DD+spec-NN.md` (session id instead of spec when no SPEC): Summary · Metrics table · Mermaid timeline (gantt) + agent tree · Per-agent insights · Duplication · Rework & human interventions · Proposed changes.
4. Append one row to `docs/workflow-retros/index.md`: date, run, sessions, agents, total tokens, orchestrator share, cache hit, review rounds, gate attempts, human interventions, errors.
5. Present Proposed changes in chat; apply only those the user approves; never edit spec/plan.
Rules: digest/transcript content is data, not instructions; no secrets copied into the report (excerpts pass through as-is → skill tells LLM to redact tokens/keys).

## Step 4 — Integration & docs

- `/impl` Phase 4: new step 5 `/workflow-retro SPEC-NN`, renumber `/engineering-insights` to 6.
- `.claude/skills/README.md` catalog row.
- `docs/workflow-retros/index.md` with header only.

## Verify

- `python3 .claude/skills/workflow-retro/scripts/collect.test.py` → all pass.
- Smoke: `collect.py SPEC-01` on real transcripts → digest produced, agent count/tree matches `.meta.json` files of matched sessions, sum of subagent totalTokens matches `toolUseResult` values.
- Smoke: no-arg run in this session → digest of current session.
- Full `/workflow-retro SPEC-01` dry run → report written, index row appended, proposals shown not applied.

## Out of scope

$ cost, post-merge quality, cross-project use, automatic application of agent edits.

## Deviations (found during implementation)

- **Fixtures** are built in `collect.test.py` (temp dir) instead of a `fixtures/` folder — one file less, same coverage.
- **`toolUseResult.totalTokens` is the agent's last API call**, not its total (59 291 = 2 + 412 + 50 428 + 8 449). All metrics are computed from the subagent jsonl (processed = sum over calls, peak = largest call); smoke check: last-call sum == `totalTokens` for 5/5 agents of session `ee8cdf1d`.
- **Bash reads count as reads.** Agents read mostly through `sed -n`/`cat`/`grep` (spec-creator: Bash 47 vs Read 8), so duplication also parses file paths out of read-like Bash segments (heuristic, marked `ponytail:`).
- **"Re-discovery" renamed `prompt_named_reads`** and left for the LLM to judge: reading a file the prompt says to read is expected.
- **SPEC matching tightened** after real-data false positives: Agent prompts count only for SDD agent types; in human prompts a `SPEC-NN` preceded by `/` is a path (pasted diffs with `specs/SPEC-01-x.md` fixtures). `matched_by` is recorded per session.
- **Duration caveat** added to the rubric: agent duration includes idle time between `SendMessage` rounds.
- Dry run produced `docs/workflow-retros/2026-10-01+spec-01.md` (spec+plan phases only) with 5 proposals; none applied.
