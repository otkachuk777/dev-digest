#!/usr/bin/env bash
# PreToolUse hook (matcher: mcp__plugin_playwright_playwright__.*) for spec-creator. View-only browsing of
# design sources: allowlisted tools only, navigation only to localhost / 127.0.0.1 / *.figma.com, screenshot
# filenames a single path segment. Usage: browser-url-guard.sh   (hook JSON on stdin)
set -uo pipefail
command -v jq >/dev/null || { echo "browser-url-guard: jq not found, tool call blocked — install it (macOS: brew install jq; Debian/Ubuntu: sudo apt-get install jq) and retry" >&2; exit 2; }
deny() { jq -nc --arg r "browser-url-guard: $1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

INPUT=$(cat)  # stdin is read once; every field below comes from this copy
TOOL=$(jq -r '.tool_name // ""' <<<"$INPUT" 2>/dev/null)
case "${TOOL#mcp__plugin_playwright_playwright__}" in
  browser_navigate|browser_navigate_back|browser_snapshot|browser_take_screenshot|browser_click|browser_hover|browser_wait_for|browser_tabs|browser_close|browser_resize) ;;
  *) deny "$TOOL is not allowed: spec-creator browses view-only (navigate/snapshot/screenshot/click/hover/wait/tabs/close/resize)";;
esac

URL=$(jq -r '.tool_input.url // ""' <<<"$INPUT" 2>/dev/null)
if [ -n "$URL" ]; then
  [[ "$URL" =~ ^https?://(localhost|127\.0\.0\.1|([a-z0-9-]+\.)*figma\.com)(:[0-9]+)?([/?#]|$) ]] \
    || deny "$URL is not allowed: only http(s)://localhost, 127.0.0.1 and *.figma.com; for other sources ask the caller for screenshots"
fi

NAME=$(jq -r '.tool_input.filename // ""' <<<"$INPUT" 2>/dev/null)
if [ -n "$NAME" ]; then
  [[ "$NAME" != */* && "$NAME" != *..* ]] || deny "$NAME: screenshot filename must be a single path segment"
fi
exit 0
