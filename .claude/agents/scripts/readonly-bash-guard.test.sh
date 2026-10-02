#!/usr/bin/env bash
# Self-check for readonly-bash-guard.sh: read-only commands pass through,
# write-shaped commands are denied.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
FAIL=0
check() { # <command> <allow|deny>
  out=$(jq -nc --arg c "$1" '{tool_input:{command:$c}}' | "$S/readonly-bash-guard.sh")
  got=allow; [ -n "$out" ] && got=deny
  if [ "$got" = "$2" ]; then echo "ok   $2  $1"; else echo "FAIL expected $2, got $got: $1"; FAIL=1; fi
}

# ---- must stay allowed (the reviewers' own toolkit) ------------------------
check "grep -rn foo src" allow
check "cat server/src/app.ts" allow
check "git diff" allow
check "git diff --stat" allow
check "git log --oneline -20" allow
check "git show HEAD~1" allow
check "git status" allow
check "cd server && pnpm typecheck" allow
check "cd server && pnpm test" allow
check "cd server && pnpm arch" allow
check "cd reviewer-core && npm test" allow
check "cd reviewer-core && npm run typecheck" allow
check "diff -r server/src/vendor/shared client/src/vendor/shared" allow
check "ls -la .claude/agents" allow
check "find . -name '*.test.ts'" allow
check "pnpm test 2>&1" allow
check "pnpm arch > /dev/null" allow
check "some-cmd 2>&1 | tail -50" allow
check "npx vitest run 2>&1 | tail -100" allow
check "cd server && pnpm audit" allow
check "cd reviewer-core && npm audit --json" allow
check "git diff main -U0 | grep -nE '^\+.*AKIA[0-9A-Z]{16}'" allow
check "git ls-files --others --exclude-standard | xargs grep -nE 'gh[ps]_[A-Za-z0-9]{36,}'" allow

# ---- must be denied (write-shaped) -----------------------------------------
check "echo hi > f.txt" deny
check "echo hi >> f.txt" deny
check "pnpm arch > out.log" deny
check "rm -rf /tmp/x" deny
check "git rm foo.ts" deny
check "mv a.ts b.ts" deny
check "cp a.ts b.ts" deny
check "touch new-file.ts" deny
check "mkdir new-dir" deny
check "chmod +x script.sh" deny
check "sed -i 's/a/b/' file.ts" deny
check "perl -i -pe 's/a/b/' file.ts" deny
check "git commit -m 'x'" deny
check "git add -A" deny
check "git push" deny
check "git checkout main" deny
check "git reset --hard" deny
check "git stash" deny
check "git apply patch.diff" deny
check "pnpm install" deny
check "npm install" deny
check "cd server && pnpm db:generate" deny
check "cd server && pnpm db:migrate" deny
check "some_cmd | tee out.txt" deny
check "find . -name '*.log' -delete" deny
check "find . -name '*.tmp' -exec rm {} \\;" deny
check "npm audit fix" deny
check "cd server && pnpm audit --fix" deny
check "npm audit fix --force" deny
check "npm --prefix mcp audit fix" deny
check "pnpm -C server audit --fix" deny
check "npm audit fix; echo done" deny
check "npm audit fix&& echo done" deny
check "npm audit --json | grep fix" allow
check "npm --prefix mcp install" deny
check "pnpm -C server add zod" deny
check "pnpm --filter server install" deny
check "npm install; echo done" deny
check "cd server && pnpm -C . test" allow
check "cd server && pnpm vitest run -t add" allow
check "git branch -a" deny
check "git branch -d old" deny
check "git for-each-ref --format='%(refname:short)' refs/heads refs/remotes" allow

# ---- `>` inside quotes / a quoted-delimiter heredoc is code, not redirection --
check "node -e 'console.log(a>b)'" allow
check "grep -v '=>' src/a.ts" allow
check 'python3 -c "print(1>0)"' allow
check $'python3 - <<\'EOF\'\nprint(1>0)\nEOF' allow
check $'python3 - <<"EOF" | head\nprint(1>0)\nEOF' allow
check 'echo "x" > f.txt' deny
check "echo 'x' >> f.txt" deny
check 'echo "$(date > f.txt)"' deny
check 'echo "`date > f.txt`"' deny
check $'cat <<\'EOF\' > f.txt\nx\nEOF' deny
check $'cat <<EOF\n$(date > f.txt)\nEOF' deny
check $'python3 - <<\'EOF\' > out.txt\nprint(1)\nEOF' deny

# the git branch deny names the read-only alternative
jq -nc '{tool_input:{command:"git branch -a"}}' | "$S/readonly-bash-guard.sh" | grep -q 'for-each-ref' \
  && echo "ok   git branch deny reason names for-each-ref" \
  || { echo "FAIL git branch deny reason lacks for-each-ref hint"; FAIL=1; }

# without perl the quote stripper can't run → fail closed, not "no > left, allow"
NOPERL=$(mktemp -d); for t in jq sed grep; do ln -s "$(command -v $t)" "$NOPERL/$t"; done
out=$(jq -nc '{tool_input:{command:"echo x > f.txt"}}' | env PATH="$NOPERL" /bin/bash "$S/readonly-bash-guard.sh")
rm -rf "$NOPERL"
[[ "$out" == *'perl not found'* ]] && echo "ok   no-perl → deny" || { echo "FAIL no-perl: $out"; FAIL=1; }

# without jq the guard must fail closed (exit 2) and say how to install it
out=$(printf '{}' | env -i PATH=/nonexistent /bin/bash "$S/readonly-bash-guard.sh" 2>&1); code=$?
if [ $code -eq 2 ] && [[ "$out" == *"brew install jq"* ]]; then echo "ok   no-jq blocked (exit 2)"; else echo "FAIL no-jq: exit $code, out: $out"; FAIL=1; fi

exit $FAIL
