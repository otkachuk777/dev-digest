#!/usr/bin/env bash
# Self-check for agent-type-guard.sh: allowlisted sub-agents with explicit run_in_background:false pass, everything else
# is denied (including an omitted flag, which means background by default).
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
FAIL=0
check() { # <allow|deny> <tool_input json> <allowed types…>
  want=$1 in=$2; shift 2
  out=$(jq -nc --argjson i "$in" '{tool_name:"Agent",tool_input:$i}' | "$S/agent-type-guard.sh" "$@")
  got=allow; [ -n "$out" ] && got=deny
  if [ "$got" = "$want" ]; then echo "ok   $want $in [$*]"; else echo "FAIL expected $want, got $got: $in [$*]"; FAIL=1; fi
}

check allow '{"subagent_type":"researcher","prompt":"q","run_in_background":false}' researcher
check allow '{"subagent_type":"brainstorm","prompt":"B1","run_in_background":false}' brainstorm
check allow '{"subagent_type":"brainstorm","prompt":"B1","run_in_background":false}' researcher brainstorm

check deny '{"subagent_type":"general-purpose","prompt":"q"}' researcher
check deny '{"subagent_type":"claude","prompt":"q"}' researcher
check deny '{"subagent_type":"Researcher","prompt":"q"}' researcher
check deny '{"subagent_type":"researcher2","prompt":"q"}' researcher
check deny '{"prompt":"no type → general-purpose"}' researcher
check deny '{"subagent_type":"researcher","prompt":"q","run_in_background":true}' researcher
check deny '{"subagent_type":"researcher","prompt":"q","run_in_background":"true"}' researcher
check deny '{"subagent_type":"researcher","prompt":"q"}' researcher
check deny '{"subagent_type":"researcher","prompt":"q","run_in_background":null}' researcher
check deny '{"subagent_type":"brainstorm","prompt":"B1","run_in_background":false}' researcher
check deny '{"subagent_type":"researcher","prompt":"q","run_in_background":false}'

exit $FAIL
