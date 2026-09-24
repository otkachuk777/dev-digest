# Agent prompts

## Review agent (one per group from skill-map.md; `Agent`, general-purpose, `model: sonnet`, all launched in ONE message)

Keep the prompt's first block **byte-identical across the group agents** and put everything that varies at the end: parallel agents then share a cached prefix. The diff is written once to files (workflow step 5), never pasted or re-run per agent.

```
You are reviewing a pending pull request against project skills. Repo: <REPO_ROOT>.
Read <SEVERITY_PATH>. Read the shared context <CONTEXT_PATH> (changed files, diffstat, guard results) — do not re-run git diff, pnpm arch or typecheck; their results are there.
Review ONLY changed lines; read surrounding code for context; do not report pre-existing issues. Report only violations of the skills listed below. Do not edit any file.
Return ONLY a JSON array (no prose), [] if nothing:
[{"skill":"<name>","severity":"critical|major|minor","file":"...","line":N,"rule":"<short rule id/title from the skill>","problem":"...","scenario":"...","fix":"..."}]
--- varies per agent below ---
Group: <GROUP>
Skills (read each SKILL.md fully, references only if a finding needs them) and the files each applies to:
- <SKILL_PATH>: <FILES>
Diff: <DIFF_FILE>  (untracked files: read whole)
```

## Verify agent (only for a critical the deterministic check in step 6 could not settle; `model: sonnet`)

```
Another reviewer claims this CRITICAL issue:
<finding JSON>
Read the code at file:line and its callers. Try to REFUTE it: is the scenario actually reachable, is the input untrusted, is there a guard elsewhere?
Return ONLY JSON: {"confirmed": true|false, "reason": "..."}
Confirm only if you can state a concrete reachable scenario.
```
Refuted → downgrade to major, append " (unconfirmed critical)" to `problem`.
