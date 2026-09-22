# Agents

Project subagents for Claude Code. Each file here is the source of truth for its agent; this README is only a map — roles, permissions, inputs/outputs and where the rules come from.

## Catalog

| Agent | Model | Responsibility | Writes code? |
|-------|-------|----------------|--------------|
| [researcher](researcher.md) | sonnet | Answers a concrete question with evidence — from this repo or from external sources | No |
| [planner](planner.md) | opus | Turns a task into a Development Plan that follows module rules, INSIGHTS.md and project skills | No |
| [implementer](implementer.md) | sonnet | Executes an approved plan in client / server / reviewer-core and verifies its own changes | Yes |

Out of scope for all three: architecture and security **review** (separate reviewer agents), git commits, writing `INSIGHTS.md`.

## Workflow

```
task ──► researcher (optional, facts) ──► planner ──► Development Plan
                                                        │  main session saves it:
                                                        │  ~/.claude/plans/ → docs/cc-plans/ after approval
                                                        ▼
                                       implementer ──► Implementation report ──► reviewers ──► main session commits
                                                                                  + /engineering-insights
```

Every agent asks clarifying questions (returned as its answer) instead of working on a vague task — subagents cannot use `AskUserQuestion`.

## Permissions

| Agent | Allowed tools | Denied | Notes |
|-------|---------------|--------|-------|
| researcher | Read, Grep, Glob, Bash, WebSearch, WebFetch | Write, Edit, NotebookEdit, Skill | Bash read-only by prompt; `Skill` denied → no `/deep-research` |
| planner | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, WebSearch, WebFetch | `permissionMode: plan`; Bash read-only by prompt; external facts → researcher |
| implementer | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, NotebookEdit, WebSearch, WebFetch | No git writes, no do-not-touch files, never regenerates the dependency-cruiser baseline (all by prompt) |

"By prompt" = instruction, not a technical block. Hard per-command limits would need `permissions.deny` in `settings.json`, which applies to the whole session.

## Inputs and outputs

| Agent | Input | Reads | Output |
|-------|-------|-------|--------|
| researcher | A concrete question | Repo code, git history / docs, specs, issues | Report: Answer · Findings with evidence · Links / Sources · Contradictions (external) · **Not found** · Open questions |
| planner | Task / feature request | Root + module `CLAUDE.md`, `INSIGHTS.md`, code to change, `skill-map.md`, current `SKILL.md` (+ relevant sub-files) | **Development Plan**: Context · Scope · Insights applied · Constraints · Skills for implementer · Steps (Files / Skills / Change / Verify / Done when) · Test plan · Risks · Not verified |
| implementer | Approved Development Plan | `INSIGHTS.md`, skills via `Skill`, code | **Implementation report**: Status · Insights read · Steps + skills applied · Verification evidence · Deviations · Not done · Insight candidates · Handoff for reviewers |

## How skills are shared between planner and implementer

- Both resolve skills the same way at run time: [`pr-self-review/references/skill-map.md`](../skills/pr-self-review/references/skill-map.md) (file glob → skills) plus a fallback over every `SKILL.md` `description` — so the plan and the code follow the same rules.
- Agent files contain no skill names, rules or `skills:` preload: adding, renaming or editing a skill needs no agent change. Renamed/removed mapped skills are caught by `pr-self-review/scripts/gate.test.sh`; unmapped skills in use are reported in the output.
- The generic TypeScript skill is deliberately unmapped (too noisy per file); planner names it in a step only for type-level work.
- Workflow skills (PR gating, diagrams, session insights) are not rule sources. `engineering-insights`: both agents do only Part A (read), the main session does the wrap-up.

## Sources

Official Claude Code docs (checked 2026-09-22):

| Source | Rule | Applied in |
|--------|------|-----------|
| [Subagents](https://code.claude.com/docs/en/sub-agents) | `description` drives delegation — say when to use the agent | planner, implementer frontmatter |
| | `tools` = allowlist, `disallowedTools` = denylist | all frontmatter |
| | `permissionMode: plan` = read-only exploration | planner |
| | Omit/deny `Agent` to stop a subagent spawning others | planner, implementer |
| | Without `skills:`, a subagent discovers skills through the `Skill` tool | implementer (live skills) |
| | Only the subagent's summary returns to the main session | structured output formats |
| | `AskUserQuestion` is unavailable to subagents | clarifying questions returned as output |
| | Per-command Bash limits need `permissions.deny` in settings | not applied — prompt rule only (see Permissions) |
| [Best practices](https://code.claude.com/docs/en/best-practices) | Explore → Plan → Implement → Commit; separate planning from coding | planner / implementer split |
| | Skip planning when the diff fits one sentence | planner "non-trivial change" |
| | Give a runnable check; show evidence, not claims | plan "Verify" per step; implementer verification table |
| | Specs name files, out-of-scope, end-to-end verification | Development Plan sections |
| | Independent review in a fresh subagent context | review excluded from both; implementer "Handoff for reviewers" |
| | Check nothing outside the task changed | implementer "Stay inside the plan" + Deviations |
| [Skills](https://code.claude.com/docs/en/skills) | Progressive disclosure — load supporting files only when needed | both read only relevant skill sub-files |
| | `description` decides when a skill applies | skill fallback discovery |
| | `SKILL.md` edits apply live | no copied skill rules in agents |

Project sources: root / module `CLAUDE.md` (commands, naming, do-not-touch), module `INSIGHTS.md` + [engineering-insights](../skills/engineering-insights/SKILL.md) Part A, [skill-map.md](../skills/pr-self-review/references/skill-map.md), root `INSIGHTS.md` (no `git add -A` while a subagent runs). Design record: [docs/cc-plans/2026-09-22+planner-implementer-agents.md](../../docs/cc-plans/2026-09-22+planner-implementer-agents.md).

## Adding an agent

One `<name>.md` per agent with frontmatter (`name`, `description` with a "Use when…" trigger, `model`, `tools` / `disallowedTools`). Add a row to Catalog, Permissions and Inputs/outputs here. New agents load in the next session.
