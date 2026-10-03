#!/usr/bin/env bash
# Checks the tools this repo's scripts, hooks, skills and agents run. Never installs unless --fix.
# Usage: scripts/doctor.sh [--quiet | --fix]
#   (none)   one line per tool + plugin/platform notes; also checks docker daemon and gh auth
#   --quiet  SessionStart hook mode: no output when every required tool is fine, else a hook JSON message
#   --fix    installs (via brew) just the required tools found MISSING/OLD, then checks again
#            (a fresh machine: `brew bundle` installs the whole Brewfile)
# Exit 1 when a required tool is missing or too old. Pure bash 3.2 + coreutils: no jq/python here,
# because those are what it checks.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE=${1:-}
OS=${DOCTOR_UNAME:-$(uname -s)}

# name | min version | level | used by | install (macOS/Linux/WSL) | winget id | version command
TOOLS='git|2.30|required|everything|brew install git|Git.Git|git --version
jq|1.6|required|agent guards, PR gate, MCP rebuild hook|brew install jq|jqlang.jq|jq --version
perl|5.18|required|readonly-bash-guard, mutation-probe|system perl (Linux: apt install perl)|ships with Git for Windows|perl -e "print \$^V"
python3|3.9|required|spec-lint, workflow-retro|brew install python@3.13|Python.Python.3.13|python3 --version
node|22|required|client, server, mcp|brew install node@22|OpenJS.NodeJS.22|node --version
pnpm|10|required|client, server|brew install pnpm|pnpm.pnpm|pnpm --version
npm|8|required|reviewer-core, e2e, mcp|ships with node|ships with node|npm --version
gh|2.40|required|PR gate, /impl, /pr-self-review|brew install gh|GitHub.cli|gh --version
docker|20|required|Postgres, e2e|brew install --cask docker-desktop (Linux: Docker Engine)|Docker.DockerDesktop|docker --version
rg|-|optional|rg through the rtk hook (agents use grep)|brew install ripgrep|BurntSushi.ripgrep.MSVC|rg --version
ruby|2.6|optional|agent-frontmatter YAML check (root INSIGHTS.md)|brew install ruby|RubyInstallerTeam.Ruby.3.3|ruby -v
rtk|0.50|optional|user-level rtk hook (~/.claude/hooks)|brew install rtk|-|rtk --version'

# The rtk hook rewrites every Bash call; with the hook installed rtk itself is required.
RTK_LEVEL=optional
[ -e "$HOME/.claude/hooks/rtk-rewrite.sh" ] && RTK_LEVEL=required

case "$OS" in MINGW*|MSYS*|CYGWIN*) WINDOWS=1 ;; *) WINDOWS=0 ;; esac

version_of() { eval "$1" 2>&1 | head -1 | grep -oE '[0-9]+(\.[0-9]+)*' | head -1; }
at_least() { [ "$1" = "-" ] || [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ]; }

LINES=() PROBLEMS=() FIX=() FAIL=0
fixable() { case "$1" in "brew install "*) FIX+=("${1#brew install }") ;; esac; }  # "--cask docker-desktop (Linux: …)" → cut below
while IFS='|' read -r name min level used install winget vcmd; do
  [ "$name" = rtk ] && level=$RTK_LEVEL
  hint="install: $install"; [ $WINDOWS = 1 ] && [ "$winget" != "-" ] && hint="install: winget install $winget  (or in WSL2: $install)"
  if ! command -v "$name" >/dev/null 2>&1; then
    if [ "$level" = required ]; then
      LINES+=("MISSING $name — used by $used — $hint"); PROBLEMS+=("$name missing ($used)"); FAIL=1; fixable "$install"
    else
      LINES+=("missing $name (optional) — used by $used — $hint")
    fi
    continue
  fi
  found=$(version_of "$vcmd")
  if ! at_least "$min" "${found:-0}"; then
    if [ "$level" = required ]; then
      LINES+=("OLD $name $found (need ≥ $min) — used by $used — $hint"); PROBLEMS+=("$name $found < $min ($used)"); FAIL=1; fixable "$install"
    else
      LINES+=("old $name $found (optional, want ≥ $min) — $hint")
    fi
    continue
  fi
  LINES+=("ok   $name $found")
done <<<"$TOOLS"

if [ "$MODE" = "--fix" ]; then
  [ ${#FIX[@]} -eq 0 ] && exec bash "$0"
  command -v brew >/dev/null || { echo "brew not found — install Homebrew (https://brew.sh; macOS, Linux, WSL2), or install by hand: $(printf '%s; ' "${FIX[@]}")"; exit 1; }
  for f in "${FIX[@]}"; do brew install ${f%% (*} || exit 1; done   # word-split on purpose: "--cask docker-desktop"
  exec bash "$0"
fi

# Claude Code plugin the repo's agents call (spec-creator → Playwright MCP).
NOTES=()
PLUGIN=playwright@claude-plugins-official
if ! grep -qs "\"$PLUGIN\"" "$HOME/.claude/plugins/installed_plugins.json"; then
  NOTES+=("plugin $PLUGIN not installed — spec-creator cannot browse the live app; in Claude Code: /plugin install $PLUGIN")
fi
if [ $WINDOWS = 1 ]; then
  NOTES+=("native Windows: supported setup is WSL2 (same Brewfile). In Git Bash, hooks run through cmd.exe unless settings.json env sets CLAUDE_CODE_GIT_BASH_PATH (e.g. C:\\\\Program Files\\\\Git\\\\bin\\\\bash.exe); jq is not part of Git for Windows: winget install jqlang.jq")
fi

if [ "$MODE" = "--quiet" ]; then
  [ $FAIL = 0 ] && [ ${#NOTES[@]} -eq 0 ] && exit 0
  msg="doctor:"
  [ ${#PROBLEMS[@]} -gt 0 ] && msg="$msg required tools missing or too old: $(printf '%s; ' "${PROBLEMS[@]}")"
  [ ${#NOTES[@]} -gt 0 ] && msg="$msg $(printf '%s; ' "${NOTES[@]}")"
  msg="$msg Run scripts/doctor.sh for install commands and tell the user before relying on these tools."
  msg=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$msg"
  exit $FAIL
fi

printf '%s\n' "${LINES[@]}"
for n in "${NOTES[@]+"${NOTES[@]}"}"; do echo "note $n"; done
# Slow checks, interactive mode only.
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then echo "note docker is installed but the daemon is not running — start Docker Desktop / dockerd"; fi
if command -v gh >/dev/null 2>&1 && ! gh auth status >/dev/null 2>&1; then echo "note gh is not logged in — run: gh auth login"; fi
[ $FAIL = 0 ] && echo "doctor: all required tools ok" || echo "doctor: fix the MISSING/OLD lines above (or: scripts/doctor.sh --fix)"
exit $FAIL
