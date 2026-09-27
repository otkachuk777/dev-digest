#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash) for read-only agents (planner, researcher,
# brainstorm, architecture-reviewer, security-reviewer, plan-verifier). Denies commands that write to the
# filesystem, git history, or install/run migrations — modeled on path-guard.sh
# but pattern-matching the COMMAND STRING, not a file_path. This is NOT a
# sandbox: it blocks known write shapes, not every way to mutate state.
set -uo pipefail
deny() { jq -nc --arg r "readonly-bash-guard: $1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

CMD=$(jq -r '.tool_input.command // ""' 2>/dev/null)
[ -n "$CMD" ] || exit 0

# ---- redirection -----------------------------------------------------------
# Strip the allowed no-op redirections (discard to /dev/null, dup an existing
# fd like 2>&1), then anything left with a bare `>`/`>>` writes a real file.
STRIPPED=$(printf '%s' "$CMD" | sed -E 's/[0-9]*>&[0-9]+//g; s/&>[[:space:]]*\/dev\/null//g; s/[0-9]*>>?[[:space:]]*\/dev\/null//g')
if printf '%s' "$STRIPPED" | grep -q '>'; then
  deny "redirection to a file is not allowed: $CMD"
fi

# ---- deny-listed write commands (matched as whole words) -------------------
DENY_WORDS='tee|rm|mv|cp|touch|mkdir|rmdir|chmod|chown|truncate'
if printf '%s' "$CMD" | grep -qE "(^|[|;&]|[[:space:]])($DENY_WORDS)([[:space:]]|\$)"; then
  deny "write command is not allowed for a read-only agent: $CMD"
fi

# sed -i / perl -i (in-place edit) — sed/perl themselves (no -i) are read-only.
if printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])(sed|perl)[[:space:]]+(-[a-zA-Z]*i|--in-place)'; then
  deny "in-place edit is not allowed for a read-only agent: $CMD"
fi

# find -delete (mutating flag; a plain `find` without it is read-only).
if printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])find[[:space:]].*-delete([[:space:]]|$)'; then
  deny "find -delete is not allowed for a read-only agent: $CMD"
fi

# ---- git: deny known-mutating subcommands, allow read-only ones ------------
GIT_DENY='commit|add|push|checkout|reset|stash|apply|rebase|merge|cherry-pick|revert|clean|branch|tag|rm|mv|restore'
# `git branch` lists OR creates/deletes depending on args — deny all forms, but
# name the read-only way to list branches so the agent can retry.
if printf '%s' "$CMD" | grep -qE "(^|[|;&]|[[:space:]])git[[:space:]]+branch([[:space:]|;&]|\$)"; then
  deny "git branch is not allowed for a read-only agent (to list branches use: git for-each-ref --format='%(refname:short)' refs/heads refs/remotes): $CMD"
fi
if printf '%s' "$CMD" | grep -qE "(^|[|;&]|[[:space:]])git[[:space:]]+($GIT_DENY)([[:space:]]|\$)"; then
  deny "git write command is not allowed for a read-only agent: $CMD"
fi

# ---- package managers: deny install/modify; allow test/typecheck/arch/lint --
# Global flags may sit before the subcommand (`npm --prefix mcp install`, `pnpm -C server add x`).
if printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])(npm|pnpm)([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+(install|i|ci|add|remove|uninstall|update|upgrade|link|publish)([[:space:]|;&]|$)'; then
  deny "package install/modify is not allowed for a read-only agent: $CMD"
fi

# `audit` is read-only, `audit fix` / `audit --fix` rewrites package.json/lockfile.
if printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])(npm|pnpm)([[:space:]][^|;&]*)?[[:space:]]audit([[:space:]][^|;&]*)?[[:space:]](fix|--fix)([[:space:]|;&]|$)'; then
  deny "audit fix modifies package.json/lockfile: $CMD"
fi

# ---- DB migrations/seeds ----------------------------------------------------
if printf '%s' "$CMD" | grep -qE 'db:(migrate|generate|seed|push|drop)'; then
  deny "database migration/seed command is not allowed for a read-only agent: $CMD"
fi

exit 0
