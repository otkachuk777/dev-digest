#!/usr/bin/env bash
# Decide whether a workflow's expensive steps must run for this push.
#
#   pushed-delta.sh <skip-glob>...     (shell `case` globs, `*` matches `/`)
#
#   e2e-web.yml:             pushed-delta.sh '*.md' 'server/test/*' 'client/*.test.ts' 'client/*.test.tsx'
#   server-unit.yml, server-integration.yml:  pushed-delta.sh '*.md'
#
# `paths` on pull_request matches the WHOLE PR diff (base...head), so once a PR
# touches a suite's paths, every later push re-runs it — even a push that only
# edits markdown. On `synchronize` this diffs just the pushed delta and writes
# run=false to $GITHUB_OUTPUT when every changed file matches a skip glob; the
# caller gates its later steps on it, so the job still ends green. Anything we
# can't prove is skippable writes run=true: a non-PR-push event, a missing or
# all-zeros `before`, or a `before` GitHub no longer serves (force-push).
#
# Env: EVENT (github.event_name), ACTION (github.event.action),
#      BEFORE (github.event.before),
#      AFTER (github.event.pull_request.head.sha — not github.sha, which is the
#             merge commit and would drag in base-branch changes).
# Keep the skip globs in sync with the calling workflow's negated `paths`.
set -euo pipefail

full_run() { echo "run=true" >> "$GITHUB_OUTPUT"; echo "full run: $1"; exit 0; }

[ "$#" -gt 0 ] || full_run "no skip patterns given"
[ "${EVENT:-}" = pull_request ] && [ "${ACTION:-}" = synchronize ] || full_run "${EVENT:-}/${ACTION:-} is not a PR push"
case "${BEFORE:-}" in ''|0000000000000000000000000000000000000000) full_run "no previous head";; esac
[ -n "${AFTER:-}" ] || full_run "no PR head sha"

# Two-dot diff compares trees, so depth 1 of each commit is enough.
git fetch --no-tags --depth=1 origin "$BEFORE" "$AFTER" || full_run "cannot fetch $BEFORE (force-push?)"
files=$(git diff --name-only "$BEFORE" "$AFTER") || full_run "cannot diff $BEFORE..$AFTER"
[ -n "$files" ] || full_run "empty delta"

while IFS= read -r f; do
  skip=false
  for p in "$@"; do
    # shellcheck disable=SC2254 # $p is a glob on purpose
    case "$f" in $p) skip=true; break;; esac
  done
  $skip || full_run "pushed delta changes $f"
done <<< "$files"

echo "run=false" >> "$GITHUB_OUTPUT"
{
  echo "### Skipped: pushed delta only matches $*"
  echo
  echo '```'
  echo "$files"
  echo '```'
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
echo "skipped; pushed delta only matches $*:"
echo "$files"
