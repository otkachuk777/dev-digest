#!/usr/bin/env bash
# Proves a test can fail: replace one line of a committed production file, expect the test to go red,
# restore the file from git, verify its hash, expect green again. The only way test-writer touches
# production code. Usage: mutation-probe.sh <file> <line> <replacement> -- <test command...>
# Exit 0 = test killed the mutant (red then green). Non-zero = survived / refused / restore problem.
set -uo pipefail
[ $# -ge 5 ] && [ "$4" = "--" ] || { echo "usage: mutation-probe.sh <file> <line> <replacement> -- <test command...>" >&2; exit 64; }
FILE=$1 LINE=$2 REPL=$3; shift 4
cd "$(git rev-parse --show-toplevel)"

git ls-files --error-unmatch -- "$FILE" >/dev/null 2>&1 || { echo "REFUSED: $FILE is not tracked by git" >&2; exit 65; }
git diff --quiet HEAD -- "$FILE" || { echo "REFUSED: $FILE has uncommitted changes; probe would risk them" >&2; exit 65; }
[[ "$LINE" =~ ^[1-9][0-9]*$ ]] && [ "$LINE" -le "$(wc -l < "$FILE")" ] || { echo "REFUSED: line $LINE out of range" >&2; exit 64; }

BEFORE=$(git hash-object -- "$FILE")
restore() { git checkout -q -- "$FILE"; }
trap restore EXIT INT TERM

ORIG=$(sed -n "${LINE}p" "$FILE")
L="$LINE" R="$REPL" perl -i -pe 'if ($. == $ENV{L}) { $_ = $ENV{R} . "\n" }' "$FILE"
echo "mutant: $FILE:$LINE"
echo "  - $ORIG"
echo "  + $REPL"

"$@" >/dev/null 2>&1; RED=$?
restore; trap - EXIT INT TERM
[ "$(git hash-object -- "$FILE")" = "$BEFORE" ] || { echo "RESTORE FAILED: $FILE hash differs from before the probe" >&2; exit 70; }

"$@" >/dev/null 2>&1; GREEN=$?
if [ $RED -ne 0 ] && [ $GREEN -eq 0 ]; then echo "PROBE KILLED: red on mutant, green after restore ($FILE:$LINE)"; exit 0; fi
[ $RED -eq 0 ] && { echo "PROBE SURVIVED: tests passed on the mutant — they do not pin $FILE:$LINE"; exit 1; }
echo "PROBE INCONCLUSIVE: tests fail even on the restored file (exit $GREEN)"; exit 2
