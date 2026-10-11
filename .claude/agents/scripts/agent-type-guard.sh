#!/usr/bin/env bash
# PreToolUse hook (matcher: Agent) for agents that may spawn sub-agents. The `Agent(type, …)` allowlist in
# `tools` is ignored for subagents (only `claude --agent` honours it), so this hook is the type allowlist:
# subagent_type must be one of the given types, and run_in_background must be an explicit false (omitted means
# background by default; in `-p` / SDK runs the launcher does not wait for a background child, so its report
# would bypass the launcher). Fails closed: without jq the call is blocked (exit 2).
# Usage: agent-type-guard.sh <type> [<type> …]   (hook JSON on stdin)
set -uo pipefail
command -v jq >/dev/null || { echo "agent-type-guard: jq not found, Agent call blocked — install it (macOS: brew install jq; Debian/Ubuntu: sudo apt-get install jq) and retry" >&2; exit 2; }
deny() { jq -nc --arg r "agent-type-guard: $1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

[ $# -gt 0 ] || deny "no allowed sub-agent types configured"
INPUT=$(cat)  # stdin is read once; every field below comes from this copy
TYPE=$(jq -r '.tool_input.subagent_type // ""' <<<"$INPUT" 2>/dev/null)
BG=$(jq -c '.tool_input.run_in_background' <<<"$INPUT" 2>/dev/null)  # JSON: false | true | null | "…"

ok=0; for t in "$@"; do [ "$TYPE" = "$t" ] && ok=1; done
[ "$ok" = 1 ] || deny "subagent_type '${TYPE:-<none>}' is not allowed; allowed: $*"
[ "$BG" = false ] && exit 0
# Omitted / null: a nested Agent tool may not expose the field at all, so force the child to the foreground instead of
# denying (the launcher must still wait for the report). Any explicit non-false value stays denied.
if [ "$BG" = null ]; then
  jq -c '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",permissionDecisionReason:"agent-type-guard: run_in_background forced to false",updatedInput:(.tool_input + {run_in_background:false})}}' <<<"$INPUT"
  exit 0
fi
deny "run_in_background must be false (got: $BG): wait for the $TYPE report yourself"
