#!/usr/bin/env bash
# Self-check for impl-status.sh on a throwaway git repo.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)/impl-status.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; cd "$T" || exit 1
git init -q && git config user.email t@t && git config user.name t && git commit -q --allow-empty -m init
BASE=$(git rev-parse HEAD)
fail=0
check() { # arg, regex, name
  local out; out=$("$S" "$1"); echo "$out" | grep -qE "$2" && echo "ok   $3" || { echo "FAIL $3: want /$2/, got: $out"; fail=1; }; }
expect() { check SPEC-07 "$1" "$2"; }
mark() { git commit -q --allow-empty -m "SDD(SPEC-07): $1"; }

expect 'phase=blocked-spec spec=none' 'no spec'
mkdir -p specs docs/cc-plans drafts
printf '# Spec: x\nSpec ID: SPEC-07\nStatus: draft\n' > specs/SPEC-07-x.md
expect 'phase=blocked-spec .*status=draft' 'draft spec'
sed -i.bak 's/Status: draft/Status: approved/' specs/SPEC-07-x.md && rm specs/*.bak
expect 'phase=blocked-plan' 'approved, no plan'
printf '# Plan\n- Source: specs/SPEC-070-y.md\nVerify SPEC-07 later\n' > docs/cc-plans/2026-10-01+other.md
expect 'phase=blocked-plan' 'SPEC-070 source / bare mention do not count'
printf '# Plan\n- Source: `specs/SPEC-07-x.md` (Status: approved)\n' > drafts/spec-07-x.md
check drafts/spec-07-x.md 'phase=setup .*plan=drafts/spec-07-x.md' 'draft plan path given'
printf '# Plan\n- Source: specs/SPEC-07-x.md\n' > docs/cc-plans/2026-10-02+x.md
expect 'phase=setup .*plan=docs/cc-plans/2026-10-02\+x.md' 'archived plan, nothing done'
mark plan
expect 'phase=build .*last=plan' 'plan committed'
mark chunk-2
expect 'phase=build .*last=chunk-2' 'mid build'
mark gate
expect 'phase=review .*review_round=1' 'gate passed'
mark review-2
expect 'phase=review .*review_round=3' 'after review-2'
sed -i.bak 's/Status: approved/Status: implemented/' specs/SPEC-07-x.md && rm specs/*.bak
expect 'phase=final' 'implemented, markers present'
git reset -q --soft "$BASE" && git commit -q --allow-empty -m "feat: x (SPEC-07)"
expect 'phase=done' 'implemented, squashed'
exit $fail
