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

exit $FAIL
