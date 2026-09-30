#!/usr/bin/env bash
# Self-check for browser-url-guard.sh: allowlisted tools/URLs pass, everything else is denied.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
P=mcp__plugin_playwright_playwright__
FAIL=0
check() { # <tool> <tool_input json> <allow|deny>
  out=$(jq -nc --arg t "$P$1" --argjson i "$2" '{tool_name:$t,tool_input:$i}' | "$S/browser-url-guard.sh")
  got=allow; [ -n "$out" ] && got=deny
  if [ "$got" = "$3" ]; then echo "ok   $3 $1 $2"; else echo "FAIL expected $3, got $got: $1 $2"; FAIL=1; fi
}

check browser_navigate '{"url":"http://localhost:3000/pulls"}' allow
check browser_navigate '{"url":"http://127.0.0.1:4000"}' allow
check browser_navigate '{"url":"https://figma.com"}' allow
check browser_navigate '{"url":"https://www.figma.com/file/x?node-id=1"}' allow
check browser_snapshot '{}' allow
check browser_take_screenshot '{"filename":"pr-list.png"}' allow
check browser_click '{"element":"Save","ref":"e1"}' allow

check browser_navigate '{"url":"https://evil.com"}' deny
check browser_navigate '{"url":"https://figma.com.evil.io/"}' deny
check browser_navigate '{"url":"http://localhost@evil.com/"}' deny
check browser_navigate '{"url":"http://localhost.evil.com/"}' deny
check browser_navigate '{"url":"file:///etc/passwd"}' deny
check browser_navigate '{"url":"javascript:alert(1)"}' deny
check browser_tabs '{"action":"new","url":"https://evil.com"}' deny
check browser_take_screenshot '{"filename":"../x.png"}' deny
check browser_take_screenshot '{"filename":"/tmp/x.png"}' deny
check browser_fill_form '{"fields":[]}' deny
check browser_type '{"text":"x"}' deny
check browser_evaluate '{"function":"() => 1"}' deny
check browser_run_code_unsafe '{"code":"1"}' deny
check browser_file_upload '{"paths":[]}' deny

exit $FAIL
