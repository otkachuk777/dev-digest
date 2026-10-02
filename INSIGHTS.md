# Insights — root (cross-module)

Lessons that span more than one module, or live in tooling, CI and root config.
Module-local lessons go in `<module>/INSIGHTS.md` instead.
Append-only — correct an entry with a dated note beneath it, never by rewriting it.
See `.claude/skills/engineering-insights/`.

## What Works

_No entries yet._

## What Doesn't Work

### A hook's `"once": true` did not suppress repeat firing in the Claude Desktop app harness (2026-09-18)

Added a `Stop` hook to `.claude/settings.json` with `"once": true` (per the documented schema: "hook runs once and is removed after execution") to nudge `/engineering-insights` at session wrap-up without nagging every turn. It still fired its `additionalContext` after every single assistant turn — across a session restart too, not just within one live process — so `once` bought nothing observable here. Root cause unconfirmed (no access to the harness's hook-execution internals from inside the session); could be host-specific (Claude Desktop's Code tab) rather than a general Claude Code bug.

**Rule:** don't rely on `"once": true` to make a `Stop` hook non-repetitive when running inside Claude Desktop. If a Stop-hook reminder must fire, prefer `SessionStart` (confirmed to fire exactly once per session here) over `Stop`, or skip the Stop hook if a `SessionStart` nudge already covers the "fires automatically" requirement — don't add both banking on `once` to keep Stop quiet. Removed the Stop hook entirely in this repo's `.claude/settings.json` after ~10 repeat firings in one session; `SessionStart` alone remains.

### `git add -A` while a subagent is running swallows its work into your commit (2026-09-20)

Committing a two-file docs change during a parallel refactor produced "158 files changed": a background agent was moving route folders with `git mv`, which stages the rename immediately, so the whole in-flight step landed inside an unrelated `docs(...)` commit. `git status` looked innocent beforehand — the renames read as ordinary staged entries, not as someone else's half-finished work. Recovered with `git reset --soft HEAD~1`, `git restore --staged client/src`, then a pathspec commit.

**Rule:** while any subagent is editing the repo, never `git add -A` / `git add <dir>`; commit with explicit paths (`git commit -m … -- path/a path/b`), which ignores the index entirely. If a commit comes back with a file count you did not expect, `reset --soft` and redo it rather than "fixing it later" — the renames are unrecoverable from the message alone. (commit `6a5ebd4`, split out of an accidental 158-file commit)

### A pr-self-review verify agent "confirmed" a critical with a false premise (2026-09)

Self-review flagged migration `0014` (NOT NULL columns with no DEFAULT on `pr_intent`) as critical: it would fail on existing rows. The verify agent confirmed it, saying `reviews/intent.ts` already wrote to `pr_intent` at the merge-base. That file was new in this change. `git grep` at the merge-base showed `upsertIntent` was never called, so no database could hold rows. Blocking the PR on that verdict would have cost a needless rewrite of an already-applied migration.

**Rule:** before acting on a confirmed critical whose scenario depends on prior state, check that premise at the merge-base yourself: `git cat-file -e $(git merge-base main HEAD):<path>` and `git grep <symbol> $(git merge-base main HEAD)`. A refuted premise means the finding goes down to major (`.claude/skills/pr-self-review/references/agent-prompt.md`, commit `2cf6fe9`)

> **2026-09-23 correction:** the merge-base check was too narrow, and so was my refutation. `git grep upsertIntent` across `origin/*` found callers in 16 course branches (`reference/full-build`, `lesson-3-lab/intent-layer-finish`, `lesson-7-lab/*`, …), so any DB that ever ran one of them holds old-shape `pr_intent` rows. On such a DB the migration really fails. Fixed with a `DELETE FROM pr_intent` custom migration (`0014_clear_pr_intent_cache`) before the ADD COLUMNs (`0015_pr_intent_layer`), tested on a seeded legacy row. **Rule:** for a migration's "existing rows" premise, grep every branch (`for b in $(git branch -a …); do git grep <writer> $b; done`), not just the merge-base. A shared local DB outlives branch switches.

> **2026-09-27 correction:** that recipe works only in the main session. Inside a read-only subagent (`readonly-bash-guard.sh`) every `git branch` form is denied, because `git branch <name>` creates a branch. In an agent, list branches with `git for-each-ref --format='%(refname:short)' refs/heads refs/remotes`, which the guard's deny message now names (`.claude/agents/scripts/readonly-bash-guard.sh:38-43`).

### One implementer for a whole plan costs turns × context, not test output (2026-10)

Seven implementer transcripts (2026-09/10) ran 192–426 turns with the context growing to 200–315k, i.e. 25–81M input tokens per run. Test runs were only 3–12% of tool output (`pnpm test` prints ~5 KB); the cost came from every turn resending the whole context — dozens of `sed -n`/`grep -n` slice reads, 40–70 small Edits, plan and INSIGHTS re-read. Trimming test output would have saved almost nothing.

**Rule:** give each chunk of 2–3 plan steps to a fresh implementer, batch independent reads in one message, read a file once whole, and run step-level tests only (full suite once per chunk). Measure before optimising: sum `usage` per assistant turn in `~/.claude/projects/<repo>/<session>/subagents/agent-*.jsonl` (`.claude/agents/implementer.md` "Working efficiently", `.claude/agents/implementation-planner.md` Step 4 "Chunks")

## Codebase Patterns

_No entries yet._

## Tool & Library Notes

### `e2e/` and `reviewer-core/` use npm, not pnpm — running the wrong one litters stray lockfiles (2026-09-18)

`client` and `server` use pnpm (`pnpm-lock.yaml`); `e2e` and `reviewer-core` use npm (`package-lock.json` — see each's `CLAUDE.md` "do not touch"). Running `pnpm typecheck`/`pnpm install` inside `e2e/` or `reviewer-core/` "works" (pnpm happily installs from `package.json`) but silently creates a `pnpm-lock.yaml` + `pnpm-workspace.yaml` next to the real npm lockfile — untracked files that look like legitimate new lockfiles in `git status` and would get committed if not caught.

**Rule:** before running any package-manager command in a module, check which lockfile already exists there (`ls <module>/*lock*`) — don't default to the monorepo's dominant pnpm. If stray `pnpm-lock.yaml`/`pnpm-workspace.yaml` show up in `git status` for `e2e/` or `reviewer-core/`, delete them; `package-lock.json` is the source of truth there. (`e2e/package-lock.json`, `reviewer-core/package-lock.json`)

### The built-in browser pane has no file-upload tool — inject the File yourself (2026-09)

Verifying the skill import end to end needed a real `.zip` in an `<input type="file">`.
The pane's toolset has no upload action (that is Claude-in-Chrome's `file_upload`), and
it cannot open `file://`, so there is no path from disk to the page. What works: base64
the file into a `javascript_tool` call, rebuild it with `new File([bytes], name)`, put it
on the input through a `DataTransfer`, and dispatch `new Event("change", {bubbles:true})`
— React's onChange picks it up.

**Rule:** don't conclude a file-upload flow is unverifiable in the pane; inject the File
through DataTransfer. Take the drawer's state from the DOM (`[role="dialog"]`) rather
than a screenshot — screenshots lag a React re-render and showed a stale dropdown three
times in a row (commit `4703d6d`)

### `grep` in the agent shell is a ugrep shim that can reject a valid ERE (2026-09)

In Claude Code's Bash, `grep` is a shell function wrapping ugrep, not `/usr/bin/grep`. Two security-reviewer runs got a "complexity limit" error on the secret pattern `sk-(proj-)?[A-Za-z0-9_-]{32,}` over a large diff. Both then swapped in a broader pattern and reported it as the same check. The same pattern runs fine with BSD `/usr/bin/grep -E`.

**Rule:** when a `grep -E` pattern errors in a Bash call, re-run it with `/usr/bin/grep -E` before concluding anything. Never report a silently widened pattern as the original check (`.claude/agents/security-reviewer.md`, "Secret patterns" note).

### `: ` inside an agent's `description` breaks its YAML frontmatter (2026-10)

Adding "`[verify: e2e]` ACs" to the test-writer `description` made the frontmatter invalid: the description is a plain YAML scalar, and `: ` inside it reads as a new mapping key ("mapping values are not allowed"). Nothing in the repo's self-tests parses agent frontmatter, so the file looked fine and the agent would simply fail to load in the next session.

**Rule:** after editing any `.claude/agents/*.md` frontmatter, parse it: `for f in .claude/agents/*-*.md .claude/agents/{implementer,brainstorm,researcher}.md; do LANG=en_US.UTF-8 ruby -Eutf-8 -ryaml -e 'YAML.load(File.read(ARGV[0]).split(/^---$/)[1])' "$f" || echo "FAIL $f"; done`; keep `: ` out of descriptions or quote them (`.claude/agents/test-writer.md:3`)

### `rg` in the agent shell becomes a non-recursive BSD `grep` (2026-10)

`rg` exists only as a Claude Code shell function, and the RTK command hook rewrites it to `rtk grep`, which runs BSD `grep`. So `rg … -g '*.md'` / `--glob` fail with "grep: invalid option -- g", `rg pattern <dir>` fails with "Is a directory", and `rtk proxy rg` fails because no `rg` binary exists. A plain `rg pattern file` still works, which hides the problem. Eight agent prompts recommended `rg`; the planner's spec search and spec-creator's SPEC-ID lookup used `--glob` and were broken on every run. Separate from the ugrep-shim entry above.

**Rule:** in commands and in agent prompts, search with `grep -rnE` / `grep -rl --include='SPEC-*.md' … specs */specs`, never `rg`. (`.claude/agents/implementation-planner.md` Step 1, `.claude/agents/spec-creator.md` ID rule, commit `e62533a`)

> **2026-10-02 correction:** the cause was rtk ≤ 0.39 plus a missing ripgrep binary. On rtk 0.50.0 + `brew install ripgrep` (15.2.0), `rg` is rewritten to `rtk rg` and runs real ripgrep, so `-g`/`--glob` and directory search work (verified). On a machine with older rtk or no ripgrep the old failure comes back, so agent prompts keep `grep -rnE`. Also note that rtk 0.50 `rewrite` returns exit 3 (ask) for every command with no explicit allow rule, so the RTK hook no longer auto-approves rewritten commands and Claude Code's own permission rules decide (`src/hooks/decision.rs` upstream).

### `toolUseResult.totalTokens` is an agent's last API call, not its total (2026-10)

The `Agent` tool result in the parent transcript carries `totalTokens`, which looks like the agent's cost. It is the input + cache + output of the agent's **last** call only (59 291 = 2 + 412 + 50 428 + 8 449). Adding these up undercounts a 46-turn planner (4.4M processed) by about 25×. A second trap when summing `usage` yourself: one assistant message spans several jsonl lines with the same `message.id` and a repeated `usage`, so a naive sum overcounts.

**Rule:** measure agent cost from `subagents/agent-<id>.jsonl`. Sum `usage` once per `message.id` and track the largest single call as peak context. Or run `.claude/skills/workflow-retro/scripts/collect.py`, which does both (`usage()` in `collect.py`, commit `ffb2db1`).

### `brew bundle check` answers "installed by brew?", not "is the tool here?" (2026-10)

On this Mac every tool worked (`node` from the nodejs.org installer, `pnpm` from its own script, Docker Desktop, `jq` in `/usr/bin`), yet `brew bundle check --no-upgrade` reported 6 unmet Brewfile entries. A `--fix` built on `brew bundle` would have installed a second node, pnpm and Docker on top of the working ones.

**Rule:** check tools with `command -v` plus a version, as `scripts/doctor.sh` does. Use the Brewfile only to install on a fresh machine, and let `doctor.sh --fix` brew-install only the rows it reports MISSING/OLD (`scripts/doctor.sh`, commit `7b52ea3`).

### Testing "tool X is missing": strip PATH properly, and mount worktrees at their real path (2026-10)

A hook's missing-dependency branch is only tested if X is really unreachable. `PATH=$(dirname $(command -v jq))` looked like a "jq only" PATH, but on macOS `jq` lives in `/usr/bin` next to `perl`, so the no-perl test passed while perl was still there. Running the self-tests in Docker from a worktree also failed with `fatal: not a git repository`, because the worktree's `.git` file points at the host path of the main repo.

**Rule:** build the PATH from a temp dir of symlinks to every file in `/usr/bin` and `/bin` except the tool under test (see the `NOPERL` / `NJ` / `NP` blocks in `readonly-bash-guard.test.sh`, `gate.test.sh`, `spec-lint.test.sh`). Then mutate the check away once to prove the test goes red. For Linux runs of a worktree: `docker run -v "$REPO":"$REPO" -w "$WORKTREE" ubuntu:24.04 …`, mounting the main repo at the same absolute path (commit `7b52ea3`).

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
