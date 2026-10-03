#!/usr/bin/env bash
# Read-only: where is a feature in the /impl workflow? Derived from artifacts only — the SPEC's Status,
# the approved plan (given path, or an archived plan in docs/cc-plans/ whose `- Source:` line is the spec)
# and the last `SDD(SPEC-NN): <phase>` commit.
# Usage: impl-status.sh <SPEC-NN | path/to/plan.md>   (run inside the repo / worktree)
# Prints one line: phase=<blocked-spec|blocked-plan|setup|build|review|final|done> spec=<path|none>
#                  status=<…> plan=<path|none> last=<phase marker|none> review_round=<next round, 0 = not started>
set -uo pipefail
ARG=${1:?usage: impl-status.sh <SPEC-NN | plan path>}
cd "$(git rev-parse --show-toplevel)" || exit 1

PLAN=none
if [ -f "$ARG" ]; then
  PLAN=$ARG
  ID=$(grep -m1 -E '^- Source: ' "$ARG" | grep -oE 'SPEC-[0-9]+' | head -1)
else
  ID=$(printf '%s' "$ARG" | grep -oE 'SPEC-[0-9]+' | head -1)
fi
[ -n "${ID:-}" ] || { echo "error: no SPEC-NN in '$ARG' (a plan needs a '- Source: …SPEC-NN-…' line)" >&2; exit 64; }

SPEC=none STATUS=none
for d in specs */specs; do
  [ -d "$d" ] || continue
  f=$(grep -lE "^Spec ID: $ID\$" "$d"/SPEC-*.md 2>/dev/null | head -1)
  [ -n "$f" ] && { SPEC=$f; break; }
done
[ "$SPEC" != none ] && STATUS=$(sed -nE 's/^Status: *([a-z]+).*/\1/p' "$SPEC" | head -1)

# The planner template names its spec on a `- Source:` line; a mere mention elsewhere does not count.
if [ "$PLAN" = none ]; then
  PLAN=$(grep -lE "^- Source: .*$ID-" docs/cc-plans/*.md 2>/dev/null | tail -1)
  [ -n "$PLAN" ] || PLAN=none
fi

LAST=$(git log --format=%s --grep="^SDD($ID): " -1 | sed -E "s/^SDD\\($ID\\): *//")
[ -n "$LAST" ] || LAST=none
ROUND=0
case "$LAST" in review-*) ROUND=$(( ${LAST#review-} + 1 ));; esac

if [ "$STATUS" = implemented ]; then
  # Squash at G3 removes the markers; an implemented spec is either at Final (PR not opened) or done.
  case "$LAST" in none) PHASE=done;; *) PHASE=final;; esac
elif [ "$STATUS" != approved ]; then PHASE=blocked-spec   # run spec-creator, get it approved
elif [ "$PLAN" = none ]; then PHASE=blocked-plan            # run implementation-planner, approve the plan
else
  case "$LAST" in
    none) PHASE=setup;;
    gate) PHASE=review; ROUND=1;;
    review-*) PHASE=review;;
    *) PHASE=build;;                                          # plan, skeleton, red-tests, chunk-<k>
  esac
fi
echo "phase=$PHASE spec=$SPEC status=$STATUS plan=$PLAN last=$LAST review_round=$ROUND"
