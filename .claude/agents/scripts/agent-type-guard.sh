#!/usr/bin/env bash
# PreToolUse hook (matcher: Agent) for agents that may spawn sub-agents. The `Agent(type, …)` allowlist in
# `tools` is ignored for subagents (only `claude --agent` honours it), so this hook is the type allowlist:
# subagent_type must be one of the given types, and run_in_background must not be true (in `-p` / SDK runs
# the launcher does not wait for a background child, so its report would bypass the launcher).
# Usage: agent-type-guard.sh <type> [<type> …]   (hook JSON on stdin)
set -uo pipefail
deny() { jq -nc --arg r "agent-type-guard: $1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

[ $# -gt 0 ] || deny "no allowed sub-agent types configured"
INPUT=$(cat)  # stdin is read once; every field below comes from this copy
TYPE=$(jq -r '.tool_input.subagent_type // ""' <<<"$INPUT" 2>/dev/null)
BG=$(jq -r '.tool_input.run_in_background // false' <<<"$INPUT" 2>/dev/null)

ok=0; for t in "$@"; do [ "$TYPE" = "$t" ] && ok=1; done
[ "$ok" = 1 ] || deny "subagent_type '${TYPE:-<none>}' is not allowed; allowed: $*"
[ "$BG" != true ] || deny "run_in_background must be false: wait for the $TYPE report yourself"
exit 0
