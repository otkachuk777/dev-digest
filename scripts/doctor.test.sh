#!/usr/bin/env bash
# Self-check for doctor.sh. Hermetic: fake tool binaries print fixed versions, HOME is a temp dir.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$S/.." && pwd)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
FAIL=0
ok()   { echo "ok   $1"; }
bad()  { echo "FAIL $1"; FAIL=1; }

# Basic utilities doctor itself may use; everything else comes from stubs.
mkdir -p "$T/base"
for u in bash sh sed grep awk sort head tail uname cat tr dirname basename env mktemp rm wc cut; do
  p=$(PATH=/usr/bin:/bin command -v "$u") && ln -s "$p" "$T/base/$u"
done

stubs() { # <dir> <tool=version line>...  — each stub prints its line for any arguments
  rm -rf "$1"; mkdir -p "$1"; local d=$1; shift
  for kv in "$@"; do printf '#!/bin/sh\necho "%s"\n' "${kv#*=}" > "$d/${kv%%=*}"; chmod +x "$d/${kv%%=*}"; done
}
ALL=("git=git version 2.54.0" "jq=jq-1.7.1" "perl=v5.34.1" "python3=Python 3.12.1" "node=v22.16.0"
     "pnpm=12.6.0" "npm=11.6.0" "gh=gh version 2.101.0 (2026-09-15)" "docker=Docker version 29.8.0, build x"
     "rg=ripgrep 15.2.0" "ruby=ruby 2.6.10p210" "rtk=rtk 0.50.0")
# stubs for ALL minus <tool>, plus extra overrides
stubs_without() { local skip=$1; shift; local a=(); for kv in "${ALL[@]}"; do [ "${kv%%=*}" = "$skip" ] || a+=("$kv"); done; stubs "$T/bin" "${a[@]}" "$@"; }

home() { # fresh HOME; $1=plugin installed (yes|no), $2=rtk hook (yes|no)
  rm -rf "$T/home"; mkdir -p "$T/home/.claude/plugins" "$T/home/.claude/hooks"
  [ "$1" = yes ] && echo '{"plugins":{"playwright@claude-plugins-official":[{}]}}' > "$T/home/.claude/plugins/installed_plugins.json"
  [ "$2" = yes ] && touch "$T/home/.claude/hooks/rtk-rewrite.sh"
  return 0
}
run() { env -i HOME="$T/home" PATH="$T/bin:$T/base" DOCTOR_UNAME="${UNAME:-Darwin}" bash "$S/doctor.sh" "$@" 2>&1; }

# 1. everything present
stubs "$T/bin" "${ALL[@]}"; home yes no
out=$(run); code=$?
[ $code -eq 0 ] && ! grep -qE 'MISSING|OLD' <<<"$out" && ok "all present → exit 0" || bad "all present: exit $code\n$out"

# 2. required tool missing
stubs_without jq
out=$(run); code=$?
[ $code -eq 1 ] && grep -q 'MISSING jq' <<<"$out" && grep -q 'brew install jq' <<<"$out" && grep -q 'agent guards' <<<"$out" \
  && ok "missing jq → MISSING + install hint + used-by, exit 1" || bad "missing jq: exit $code
$out"

# 3. required tool too old
stubs_without jq "jq=jq-1.5"
out=$(run); code=$?
[ $code -eq 1 ] && grep -q 'OLD jq 1.5' <<<"$out" && ok "jq 1.5 → OLD, exit 1" || bad "old jq: exit $code
$out"

# 4. optional tool missing → still exit 0
stubs_without rg
out=$(run); code=$?
[ $code -eq 0 ] && grep -q 'optional' <<<"$out" && grep -qE '(missing|MISSING).*rg|rg.*(missing|MISSING)' <<<"$out" \
  && ok "missing optional rg → reported, exit 0" || bad "optional rg: exit $code
$out"

# 5. --quiet: silent when fine, valid SessionStart JSON when not
stubs "$T/bin" "${ALL[@]}"; out=$(run --quiet)
[ -z "$out" ] && ok "--quiet silent when all ok" || bad "--quiet not silent: $out"
stubs_without rg; out=$(run --quiet)
[ -z "$out" ] && ok "--quiet silent when only optional missing" || bad "--quiet noisy for optional: $out"
stubs_without jq; out=$(run --quiet)
if python3 -c 'import json,sys; d=json.loads(sys.argv[1]); c=d["hookSpecificOutput"]; assert c["hookEventName"]=="SessionStart" and "jq" in c["additionalContext"] and "doctor.sh" in c["additionalContext"]' "$out" 2>/dev/null; then
  ok "--quiet missing jq → SessionStart JSON naming jq and doctor.sh"; else bad "--quiet JSON: $out"; fi

# 6. rtk becomes required when the user-level rtk hook exists
stubs_without rtk; home yes yes
out=$(run); code=$?
[ $code -eq 1 ] && grep -q 'MISSING rtk' <<<"$out" && ok "rtk hook present + rtk missing → required" || bad "rtk required: exit $code
$out"
home yes no; out=$(run); code=$?
[ $code -eq 0 ] && ok "no rtk hook → rtk optional" || bad "rtk optional: exit $code"

# 7. plugin needed by spec-creator
stubs "$T/bin" "${ALL[@]}"; home no no
out=$(run); grep -q 'playwright' <<<"$out" && grep -qi 'plugin install' <<<"$out" && ok "playwright plugin not installed → warning" || bad "plugin warning missing
$out"
out=$(run --quiet); grep -q playwright <<<"$out" && ok "--quiet mentions missing plugin" || bad "--quiet plugin: $out"
home yes no

# 8. native Windows (Git Bash / MSYS) advice
out=$(UNAME=MINGW64_NT-10.0 run)
grep -q WSL2 <<<"$out" && grep -q CLAUDE_CODE_GIT_BASH_PATH <<<"$out" && grep -q 'winget install' <<<"$out" \
  && ok "MINGW → WSL2 / CLAUDE_CODE_GIT_BASH_PATH / winget advice" || bad "windows advice
$out"

# 9. --fix installs only what is missing/old (not the whole Brewfile), via brew
stubs_without jq "rg=ripgrep 1"
printf '#!/bin/sh\necho "$*" >> "%s/brew.log"\n' "$T" > "$T/bin/brew"; chmod +x "$T/bin/brew"; rm -f "$T/brew.log"
run --fix >/dev/null
[ "$(cat "$T/brew.log" 2>/dev/null)" = "install jq" ] && ok "--fix → brew install jq only" || bad "--fix ran: $(cat "$T/brew.log" 2>/dev/null)"
rm -f "$T/bin/brew"
out=$(run --fix); grep -q 'brew not found' <<<"$out" && ok "--fix without brew → Homebrew hint" || bad "--fix no brew: $out"

# 10. Brewfile ↔ doctor table: every formula doctor suggests is in the Brewfile and vice versa
want=$(grep -oE 'brew install [a-z][a-z0-9@.+-]*' "$S/doctor.sh" | awk '{print $3}' | sort -u)
have=$(grep -oE '^brew "[^"]+"' "$ROOT/Brewfile" | cut -d'"' -f2 | sort -u)
[ -n "$want" ] && [ "$want" = "$have" ] && ok "Brewfile matches doctor table ($(echo $have | wc -w | tr -d ' ') formulae)" \
  || bad "Brewfile vs doctor: doctor-only [$(comm -23 <(echo "$want") <(echo "$have") | tr '\n' ' ')] brewfile-only [$(comm -13 <(echo "$want") <(echo "$have") | tr '\n' ' ')]"

exit $FAIL
