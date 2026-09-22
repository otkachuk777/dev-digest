#!/usr/bin/env bash
# Self-check for path-guard.sh: allowed paths pass through, everything else is denied.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
ROOT=$(git rev-parse --show-toplevel)
FAIL=0
check() { # <profile> <path> <allow|deny>
  out=$(jq -nc --arg p "$2" '{tool_input:{file_path:$p}}' | "$S/path-guard.sh" "$1")
  got=allow; [ -n "$out" ] && got=deny
  if [ "$got" = "$3" ]; then echo "ok   $1 $3 $2"; else echo "FAIL $1 expected $3, got $got: $2"; FAIL=1; fi
}

check tests "$ROOT/client/src/app/_components/Foo/Foo.test.tsx" allow
check tests "$ROOT/server/test/skills.test.ts" allow
check tests "$ROOT/server/test/skills.it.test.ts" allow
check tests "$ROOT/server/test/helpers/pg.ts" allow
check tests "$ROOT/server/src/modules/skills/service.ts" deny
check tests "$ROOT/client/package.json" deny
check tests "$ROOT/server/test/../src/app.ts" deny
check tests "/tmp/x.test.ts" deny

check docs "$ROOT/docs/architecture.md" allow
check docs "$ROOT/docs/adr/0001-use-onion.md" allow
check docs "$ROOT/client/docs/README.md" allow
check docs "$ROOT/README.md" allow
check docs "$ROOT/server/README.md" allow
check docs "$ROOT/docs/cc-plans/2026-09-23+x.md" deny
check docs "$ROOT/docs/agent-prompts/a.md" deny
check docs "$ROOT/server/src/app.ts" deny
check docs "$ROOT/client/src/vendor/docs/x.md" deny
check docs "$ROOT/CLAUDE.md" deny
check docs "$ROOT/server/INSIGHTS.md" deny
check docs "$ROOT/e2e/specs-docs/01.md" deny
check docs "$ROOT/client/specs/x.md" deny
check docs "$ROOT/docs/../server/src/app.ts" deny

check other "$ROOT/docs/architecture.md" deny

exit $FAIL
