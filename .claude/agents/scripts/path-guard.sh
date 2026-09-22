#!/usr/bin/env bash
# PreToolUse hook (matcher: Write|Edit) declared in an agent's frontmatter. Denies writes outside the
# agent's profile. Usage: path-guard.sh <tests|docs>   (hook JSON on stdin)
#   tests — test-writer: test files and test-only helpers/fixtures
#   docs  — doc-writer: docs/, <module>/docs/, READMEs; never plans, prompts, specs, CLAUDE.md, INSIGHTS.md
# Covers Edit/Write only — Bash writes are limited by the agent prompt, not here.
set -uo pipefail
PROFILE="${1:-}"
deny() { jq -nc --arg r "path-guard($PROFILE): $1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

FILE=$(jq -r '.tool_input.file_path // ""' 2>/dev/null)
[ -n "$FILE" ] || deny "no file_path in tool input"
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || deny "not inside a git repository"
case "$FILE" in /*) ;; *) FILE="$PWD/$FILE";; esac
case "$FILE" in "$ROOT"/*) REL=${FILE#"$ROOT"/};; *) deny "$FILE is outside the repository";; esac
case "/$REL/" in */../*|*/./*) deny "$REL: relative segments are not allowed";; esac

MODULES='client|server|reviewer-core|e2e'
case "$PROFILE" in
  tests)
    case "$REL" in
      *.test.ts|*.test.tsx|*/test/helpers/*|*/test/fixtures/*) exit 0;;
    esac
    deny "$REL is not a test file. test-writer may only write *.test.ts(x), *.it.test.ts and test/helpers|fixtures; prove fail-ability with mutation-probe.sh instead of editing production code."
    ;;
  docs)
    case "$REL" in
      docs/cc-plans/*|docs/agent-prompts/*|docs/reports/*|docs/designs/*|docs/api-contract-skills/*|docs/skills-import-demo/*) deny "$REL is a protected docs area";;
      */specs/*|e2e/specs-docs/*) deny "$REL is a spec, not documentation";;
      CLAUDE.md|*/CLAUDE.md|INSIGHTS.md|*/INSIGHTS.md) deny "$REL holds agent instructions/insights, not documentation";;
    esac
    [[ "$REL" =~ ^(docs/.+|($MODULES)/docs/.+|README\.md|($MODULES)/README\.md)$ ]] && exit 0
    deny "$REL is outside the documentation locations (docs/, <module>/docs/, README.md, <module>/README.md)"
    ;;
  *) deny "unknown profile '$PROFILE' (expected tests|docs)";;
esac
