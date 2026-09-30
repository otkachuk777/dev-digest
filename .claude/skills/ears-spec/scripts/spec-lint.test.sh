#!/usr/bin/env bash
# Self-check for spec-lint.sh: a valid spec passes; each broken variant fails with the expected message.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/client/specs" "$TMP/specs"; git -C "$TMP" init -q
FAIL=0

good() { cat <<'EOF'
# Spec: Export findings
Spec ID: SPEC-97
Status: draft
Supersedes: none

## Problem and user
Reviewers cannot share findings outside DevDigest.

## Goals / Non-goals
- Goal: export the latest findings of a PR.
- Non-goal: scheduled exports.

## User stories
- **US-1:** As a reviewer, I want to export findings, so that I can share them.

### Workflow
```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Exporting: click Export (AC-1)
  Exporting --> Failed: GitHub down (EC-1)
```

## Acceptance criteria (EARS)
- **AC-1:** WHEN the reviewer clicks Export, the system shall download a CSV of the latest findings within 3 seconds. [verify: e2e]
- **AC-2:** IF the PR has no findings, THEN the system shall disable Export and show "No findings to export". [verify: unit]
- **AC-3:** The system shall escape every CSV cell that starts with =, +, - or @. [verify: unit, it]

### Traceability
| US | AC | EC | NFR | Verify |
|---|---|---|---|---|
| US-1 | AC-1, AC-2, AC-3 | EC-1 | NFR-1 | e2e, unit, it |

## Edge cases
- **EC-1:** GitHub API unavailable → see AC-2 wording; the export uses stored findings only (AC-1).

## Non-functional requirements
- **NFR-1:** The export shall handle 5000 findings in under 3 seconds. [verify: it]

## Inputs and provenance
| Input | Source | Via | Trust |
|---|---|---|---|
| finding title | LLM | server `GET /pulls/:id/reviews` | untrusted |

## Untrusted inputs
- finding title — CSV injection → AC-3.

## Open questions
None
EOF
}

check() { # <name> <expect ok|fail> <grep pattern or -> <sed expression or ->
  local f="$TMP/client/specs/SPEC-97-export-findings.md"
  if [ "$4" = - ]; then good > "$f"; else good | sed -E "$4" > "$f"; fi
  out=$("$S/spec-lint.sh" "$f" 2>&1); rc=$?
  if [ "$2" = ok ] && [ $rc -eq 0 ]; then echo "ok   $1"; return; fi
  if [ "$2" = fail ] && [ $rc -eq 1 ] && printf '%s' "$out" | grep -q -- "$3"; then echo "ok   $1"; return; fi
  echo "FAIL $1 (rc=$rc)"; printf '%s\n' "$out" | sed 's/^/     /'; FAIL=1
}

check "valid spec passes"            ok   -                                   -
check "Spec ID mismatch"             fail "does not match file name"           's/^Spec ID: SPEC-97/Spec ID: SPEC-98/'
check "bad status"                   fail "Status"                             's/^Status: draft/Status: wip/'
check "missing section"              fail "sections must be exactly"           '/^## Untrusted inputs/d'
check "extra section"                fail "sections must be exactly"           's/^### Workflow/## Workflow/'
check "AC not EARS"                  fail "not in an EARS form"                's/WHEN the reviewer clicks Export, the system/Export/'
check "AC two shalls"                fail "exactly one 'shall'"                's/within 3 seconds\./within 3 seconds and the system shall log it./'
check "AC without verify tag"        fail "\[verify:"                          's/ \[verify: e2e\]//'
check "vague word in AC"             fail "vague word 'properly'"              's/escape every CSV cell that starts with =, \+, - or @/properly escape CSV cells/'
check "undefined reference"          fail "AC-9 is referenced"                 's/see AC-2 wording/see AC-9 wording/'
check "duplicate id"                 fail "defined twice"                      's/\*\*AC-3:\*\*/**AC-2:**/'
check "EC without AC or shall"       fail "EC-1 must reference"                's/^- \*\*EC-1:\*\*.*/- **EC-1:** GitHub down → nothing special./'
check "bad mermaid type"             fail "mermaid block must start"           's/^stateDiagram-v2/stateMachine/'
check "NFR without verify tag"       fail "NFR must end"                       's/ \[verify: it\]$//'
check "AC missing from traceability" fail "AC-3 is missing from the Traceab"   's/AC-1, AC-2, AC-3 \|/AC-1, AC-2 |/'
check "US missing from traceability" fail "US-1 is missing from the Traceab"   's/^\| US-1 \|/| - |/'
check "no traceability table"        fail "missing '### Traceability'"         '/^### Traceability/d'
check "superseded-by header allowed" ok   -                                    $'s/^Supersedes: none/&\\\nSuperseded by: SPEC-98 (specs\\/SPEC-98-x.md)/'
check "empty open questions"         fail "Open questions is empty"            '/^None$/d'
check "untrusted without handling"   fail "no handling statements"             's/^- finding title — CSV injection → AC-3\./None/'

printf 'Spec ID: SPEC-97\n' > "$TMP/specs/SPEC-97-other.md"
check "Spec ID already used"         fail "SPEC-97 is already used"            -
rm "$TMP/specs/SPEC-97-other.md"

exit $FAIL
