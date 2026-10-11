#!/usr/bin/env bash
# Self-check for agent-type-guard.sh: allowlisted sub-agents with explicit run_in_background:false pass; an omitted or
# null flag on an allowlisted type is rewritten to false (updatedInput); everything else is denied.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
FAIL=0
check() { # <allow|deny|rewrite> <tool_input json> <allowed types…>
  want=$1 in=$2; shift 2
  out=$(jq -nc --argjson i "$in" '{tool_name:"Agent",tool_input:$i}' | "$S/agent-type-guard.sh" "$@")
  if [ -z "$out" ]; then got=allow
  elif [ "$(jq -r '.hookSpecificOutput.permissionDecision' <<<"$out")" = deny ]; then got=deny
  elif [ "$(jq -c '.hookSpecificOutput.updatedInput' <<<"$out")" = "$(jq -c '. + {run_in_background:false}' <<<"$in")" ]; then got=rewrite
  else got="unexpected: $out"; fi
  if [ "$got" = "$want" ]; then echo "ok   $want $in [$*]"; else echo "FAIL expected $want, got $got: $in [$*]"; FAIL=1; fi
}

check allow '{"subagent_type":"researcher","prompt":"q","run_in_background":false}' researcher
check allow '{"subagent_type":"brainstorm","prompt":"B1","run_in_background":false}' brainstorm
check allow '{"subagent_type":"brainstorm","prompt":"B1","run_in_background":false}' researcher brainstorm

# an omitted / null flag (the nested Agent tool may not expose the field) is forced to foreground, not denied
check rewrite '{"subagent_type":"researcher","prompt":"q"}' researcher
check rewrite '{"subagent_type":"brainstorm","prompt":"B1","run_in_background":null}' brainstorm

check deny '{"subagent_type":"general-purpose","prompt":"q"}' researcher
check deny '{"subagent_type":"claude","prompt":"q"}' researcher
check deny '{"subagent_type":"Researcher","prompt":"q"}' researcher
check deny '{"subagent_type":"researcher2","prompt":"q"}' researcher
check deny '{"prompt":"no type → general-purpose"}' researcher
check deny '{"subagent_type":"researcher","prompt":"q","run_in_background":true}' researcher
check deny '{"subagent_type":"researcher","prompt":"q","run_in_background":"true"}' researcher
check deny '{"subagent_type":"researcher","prompt":"q","run_in_background":"false"}' researcher
check deny '{"subagent_type":"brainstorm","prompt":"B1","run_in_background":false}' researcher
check deny '{"subagent_type":"researcher","prompt":"q","run_in_background":false}'

# without jq the guard must fail closed (exit 2) and say how to install it
out=$(printf '{}' | env -i PATH=/nonexistent /bin/bash "$S/agent-type-guard.sh" researcher 2>&1); code=$?
if [ $code -eq 2 ] && [[ "$out" == *"brew install jq"* ]]; then echo "ok   no-jq blocked (exit 2)"; else echo "FAIL no-jq: exit $code, out: $out"; FAIL=1; fi

exit $FAIL
