#!/usr/bin/env bash
# PreToolUse hook (matcher: Write|Edit) declared in an agent's frontmatter. Denies writes outside the
# agent's profile. Usage: path-guard.sh <tests|docs|plans|specs>   (hook JSON on stdin)
#   tests — test-writer: test files, test-only helpers/fixtures and e2e flows (e2e/flows/NN-name.flow.json)
#   docs  — doc-writer: docs/, <module>/docs/, READMEs; never plans, prompts, specs, CLAUDE.md, INSIGHTS.md
#   plans — implementation-planner: draft plan files ~/.claude/plans/<name>.md only (outside the repo, never docs/cc-plans/)
#   specs — spec-creator: <module>/specs/SPEC-NN-<slug>.md or top-level specs/SPEC-NN-<slug>.md (cross-module),
#           plus decoded design extracts docs/designs/extracted/<kebab>.(jsx|tsx|html|md)
# Covers Edit/Write only — Bash writes are limited by the agent prompt, not here.
set -uo pipefail
command -v jq >/dev/null || { echo "path-guard: jq not found, tool call blocked — install it (macOS: brew install jq; Debian/Ubuntu: sudo apt-get install jq) and retry" >&2; exit 2; }
PROFILE="${1:-}"
deny() { jq -nc --arg r "path-guard($PROFILE): $1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

FILE=$(jq -r '.tool_input.file_path // ""' 2>/dev/null)
[ -n "$FILE" ] || deny "no file_path in tool input"

if [ "$PROFILE" = plans ]; then
  # Checked before the repo root: drafts live in the harness plan dir, outside the working tree.
  PLANS="$HOME/.claude/plans"
  case "$FILE" in "$PLANS"/*.md) NAME=${FILE#"$PLANS"/};; *) deny "$FILE is not a draft plan in $PLANS/*.md";; esac
  [[ "$NAME" =~ ^[A-Za-z0-9._+-]+\.md$ ]] && [[ "$NAME" != *..* ]] && exit 0
  deny "$NAME: plan file name must be a single path segment of [A-Za-z0-9._+-]"
fi
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
    [[ "$REL" =~ ^e2e/flows/[0-9][0-9]-[a-z0-9-]+\.flow\.json$ ]] && exit 0
    deny "$REL is not a test file. test-writer may only write *.test.ts(x), *.it.test.ts, test/helpers|fixtures and e2e/flows/NN-name.flow.json; prove fail-ability with mutation-probe.sh instead of editing production code."
    ;;
  docs)
    case "$REL" in
      docs/cc-plans/*|docs/agent-prompts/*|docs/reports/*|docs/designs/*|docs/api-contract-skills/*|docs/skills-import-demo/*) deny "$REL is a protected docs area";;
      specs/*|*/specs/*|e2e/flows-docs/*) deny "$REL is a spec, not documentation";;
      CLAUDE.md|*/CLAUDE.md|INSIGHTS.md|*/INSIGHTS.md) deny "$REL holds agent instructions/insights, not documentation";;
    esac
    [[ "$REL" =~ ^(docs/.+|($MODULES)/docs/.+|README\.md|($MODULES)/README\.md)$ ]] && exit 0
    deny "$REL is outside the documentation locations (docs/, <module>/docs/, README.md, <module>/README.md)"
    ;;
  specs)
    [[ "$REL" =~ ^(($MODULES|mcp)/)?specs/SPEC-[0-9]{2,}-[a-z0-9]+(-[a-z0-9]+)*\.md$ ]] && exit 0
    # Decoded design screens extracted from an encoded docs/designs bundle (spec-creator Round 2 step 2).
    [[ "$REL" =~ ^docs/designs/extracted/[a-z0-9]+(-[a-z0-9]+)*\.(jsx|tsx|html|md)$ ]] && exit 0
    deny "$REL is not a spec file. spec-creator may only write <module>/specs/SPEC-NN-<kebab-slug>.md (module: client|server|reviewer-core|e2e|mcp), specs/SPEC-NN-<kebab-slug>.md for cross-module specs, or docs/designs/extracted/<kebab-name>.(jsx|tsx|html|md)"
    ;;
  *) deny "unknown profile '$PROFILE' (expected tests|docs|plans|specs)";;
esac
