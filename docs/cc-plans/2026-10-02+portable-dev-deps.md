# Plan: portable dev dependencies — manifest, doctor, fail-closed hooks

- Date: 2026-10-02
- Branch: `feat/workflow-retro` (continues; same agents/skills scope) — or a new branch from it if the user prefers
- Type: tooling, no product code

## Goal

Moving the repo to another machine (macOS, Linux, WSL2) must not silently break skills, agents or hooks. Every external tool they run is declared once, checked automatically, and a missing tool gives a clear message with the install command. Security hooks fail **closed**.

## Decisions (agreed)

| # | Decision |
|---|---|
| D1 | Scope = repo + **check** of user-level deps (plugins, rtk hook); `~/.claude` files are documented, not copied |
| D2 | `scripts/doctor.sh` reports; `--fix` runs `brew bundle` only when asked |
| D3 | Quiet doctor on SessionStart — context message only when something is missing; no slow checks (docker daemon, `gh auth`) there |
| D4 | Supported: macOS, Linux, WSL2 (one `Brewfile`, Homebrew works on Linux). Native Windows: `.gitattributes` (LF), doctor detects Git Bash/MSYS and prints "use WSL2 or set `CLAUDE_CODE_GIT_BASH_PATH`" + winget commands, no guarantees |

## Findings this plan fixes

| # | Finding | Evidence |
|---|---|---|
| F1 | PR gate **fails open** without `jq`: `gh pr create` passes with no self-review | ran `gate.sh` with a PATH without jq → empty output, exit 0; with jq → deny |
| F2 | PostToolUse MCP-rebuild hook silently no-ops without `jq` | `.claude/settings.json` PostToolUse command |
| F3 | `spec-lint.sh` (python3), `collect.py`, `mutation-probe.sh` (perl), `gate.sh` (`gh`, `shasum`) have no dependency check | per-script grep |
| F4 | No `.gitattributes` → CRLF `.sh` on Windows checkouts | `ls .gitattributes` |
| F5 | No Node/pnpm version pin anywhere (`.nvmrc`, `engines`) | 5× `package.json` |
| F6 | spec-creator needs the Playwright MCP plugin; only enabled in the user's `~/.claude/settings.json` | agent frontmatter `mcp__plugin_playwright_playwright__*` |
| F7 | Root `INSIGHTS.md` YAML check uses `ruby` (macOS system ruby; absent on Linux/WSL) | INSIGHTS entry "`: ` inside an agent's description" |

## Files

```
Brewfile                         # required + optional formulae (works on macOS and Linux/WSL Homebrew)
.gitattributes                   # *.sh *.py text eol=lf
.nvmrc                           # 22
scripts/doctor.sh                # checks; --quiet (hook), --fix (brew bundle), exit 1 if a required tool is missing
scripts/doctor.test.sh           # PATH-stripping tests, Brewfile ↔ doctor table consistency
.claude/settings.json            # SessionStart: + doctor --quiet; PostToolUse jq guard; enabledPlugins playwright
.claude/skills/pr-self-review/scripts/gate.sh     # fail closed without jq / gh
.claude/skills/ears-spec/scripts/spec-lint.sh     # python3 check with install hint
.claude/agents/scripts/mutation-probe.sh          # perl check
.claude/skills/*/SKILL.md        # `compatibility:` where a skill runs external tools
.claude/agents/README.md         # "Requires" column / section
README.md (or docs/setup.md)     # "New machine" section: brew bundle, doctor, plugins, rtk, WSL2, Windows notes
INSIGHTS.md                      # YAML check via python3 instead of ruby (dated correction)
```

## Step 1 — doctor (test first)

Table inside `doctor.sh` (single place; Brewfile must list every brew-installable row — test enforces):

| tool | min | level | used by | brew | winget |
|---|---|---|---|---|---|
| git | 2.30 | required | everything | git | Git.Git |
| jq | 1.6 | required | agent guards, PR gate, MCP rebuild hook | jq | jqlang.jq |
| perl | 5.18 | required | readonly-bash-guard, mutation-probe | (system) | (Git for Windows) |
| python3 | 3.9 | required | spec-lint, workflow-retro | python@3 | Python.Python.3.12 |
| node | 22 | required | client/server/mcp | node@22 | OpenJS.NodeJS.LTS |
| pnpm | 9 | required | client/server | pnpm | pnpm.pnpm |
| npm | — | required | reviewer-core, e2e, mcp | (with node) | (with node) |
| gh | 2.40 | required | PR gate, /impl, /pr-self-review | gh | GitHub.cli |
| docker | — | required (full mode: daemon running) | Postgres, e2e | --cask docker | Docker.DockerDesktop |
| ripgrep | — | optional | `rg` via rtk | ripgrep | BurntSushi.ripgrep.MSVC |
| ruby | 2.6 | optional | agent-frontmatter YAML check (root INSIGHTS) | ruby | RubyInstallerTeam.Ruby.3.3 |
| rtk | 0.50 | optional (if `~/.claude/hooks/rtk-rewrite.sh` exists → required) | user-level hook | rtk | — |

Plus checks: Playwright plugin enabled (project `enabledPlugins` or user settings) for spec-creator — warning; OS = MSYS/MINGW → Windows advice; full mode only: `docker info`, `gh auth status`.

Output: one line per row `ok|MISSING|OLD <tool> <found> (need ≥min) — used by … — install: brew install …`. `--quiet`: prints nothing when all required are ok; otherwise a SessionStart JSON `additionalContext` naming missing tools and `scripts/doctor.sh`. Must stay fast (< 0.5 s; no network, no docker).

Tests (`doctor.test.sh`): all present → exit 0; PATH without jq → MISSING jq, exit 1; fake old version (stub script printing `jq-1.5`) → OLD; `--quiet` prints nothing when ok and valid JSON when not; every Brewfile `brew "x"` has a doctor row and vice versa; MSYS uname stub → Windows advice.

## Step 2 — fail closed

- `gate.sh`: `command -v jq` missing → deny `gh pr create/merge` with install hint (can't parse the command without jq, so deny when the raw input mentions `gh pr`); test: no-jq PATH → deny. Add to `gate.test.sh`.
- PostToolUse hook: no jq → `systemMessage` "jq missing — MCP auto-rebuild disabled".
- `spec-lint.sh`, `mutation-probe.sh`: dependency check with hint, exit 2.
- `collect.py`: Python ≥3.9 check at import (stdlib only already).

## Step 3 — declare

- `Brewfile`, `.gitattributes`, `.nvmrc` (`22`), `engines.node: ">=22"` — **skipped** in package.json (lockfile/tooling churn; `.nvmrc` + doctor cover it).
- `.claude/settings.json`: `enabledPlugins: {"playwright@claude-plugins-official": true}` (Claude Code prompts to install on a new machine).
- `compatibility:` in SKILL.md of skills that run tools: pr-self-review (git, jq, gh, pnpm), ears-spec (python3), workflow-retro (python3 ≥3.9), impl (git, gh, jq), engineering-insights (git). YAML-check each.
- Agents README: "Requires" column (jq + perl for read-only agents; Playwright plugin for spec-creator).
- INSIGHTS YAML check keeps `ruby` (no stdlib YAML in python); ruby is an optional doctor row with its install command — Linux/WSL get it from the Brewfile.

## Step 4 — docs

README "New machine" section: `brew bundle` → `scripts/doctor.sh` → Claude Code plugins (project prompts; list user-level ones the workflow expects: superpowers etc. as optional) → rtk (`rtk init -g`, optional) → WSL2 note → native Windows notes (`CLAUDE_CODE_GIT_BASH_PATH`, winget list, no guarantee).

## Verify

- `scripts/doctor.test.sh`, `gate.test.sh`, all existing `*.test.sh`, `collect.test.py` green.
- `scripts/doctor.sh` on this Mac → all ok; with PATH minus jq → MISSING + exit 1.
- `brew bundle check --no-upgrade --file Brewfile` → satisfied here.
- SessionStart hook output with jq hidden → message appears; with all present → nothing.

## Out of scope

Copying `~/.claude` (dotfiles), full native-Windows support, CI image changes.

## Deviations (found during implementation)

- **`--fix` installs only what doctor reports MISSING/OLD** (`brew install <formula>`), not `brew bundle`: `brew bundle check` counts packages installed *by brew*, so on a machine where node/docker/pnpm/jq came from other installers it reported 6 unmet entries while every tool worked — a full bundle would install duplicates. `brew bundle` stays the fresh-machine command.
- **pnpm minimum 10** (README already said ≥ 10), not 9.
- **CI:** new `tooling` job in `pr-self-review.yml` runs `doctor.test.sh` and the agent guard self-tests, which were not in CI before. All 8 self-test suites (241 checks) verified green in an `ubuntu:24.04` container.
- Brewfile uses `cask "docker-desktop" if OS.mac?` (token `docker-desktop`); `node@22` is keg-only → `link: true`.
