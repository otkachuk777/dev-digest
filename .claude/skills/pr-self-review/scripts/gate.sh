#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash). Denies `gh pr create` / `gh pr merge` without a fresh PASS verdict.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
INPUT=$(cat)
# No jq → the call can't be parsed. Fail closed for anything that looks like a PR create/merge.
if ! command -v jq >/dev/null 2>&1; then
  grep -Eq 'gh[[:space:]]+pr[[:space:]]+(create|merge)' <<<"$INPUT" || exit 0
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"PR gate cannot run: jq not found. Install it (brew install jq; see scripts/doctor.sh) and retry."}}'
  exit 0
fi
CMD=$(jq -r '.tool_input.command // ""' <<<"$INPUT" 2>/dev/null)
echo "$CMD" | grep -Eq '(^|;|&&|\|\|?|\()[[:space:]]*gh[[:space:]]+pr[[:space:]]+(create|merge)\b' || exit 0
# The hook process starts in the main checkout; judge the checkout the command runs in (a worktree).
CWD=$(jq -r '.cwd // ""' <<<"$INPUT" 2>/dev/null)
[ -n "$CWD" ] && cd "$CWD" 2>/dev/null
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
V="${PR_SELF_REVIEW_DIR:-$ROOT/.claude/.pr-self-review}/verdict.json"
deny() { jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }
[ -f "$V" ] || deny "PR self-review has not been run. Run /pr-self-review first."
FP=$("$S/fingerprint.sh")
[ "$(jq -r .fingerprint "$V")" = "$FP" ] || deny "Code changed since the last PR self-review. Re-run /pr-self-review (cached, only changed files are re-reviewed)."
if [ "$(jq -r .status "$V")" != "PASS" ]; then
  deny "PR self-review is BLOCKED: $(jq -r .critical_count "$V") critical finding(s). See ${V%verdict.json}report.md, fix them and re-run /pr-self-review."
fi
exit 0
