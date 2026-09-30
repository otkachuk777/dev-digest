# scripts/stop.sh — stop whole local stack

## Context
`scripts/dev.sh` starts Postgres (docker) + API :3001 + web :3000. Ctrl-C leaves Postgres up and
`cleanup` kills only the subshell PID, so `tsx`/`next` can linger on ports. Need one command that stops everything.

## Change
New `scripts/stop.sh` (chmod +x), same style as dev.sh (`set -euo pipefail`, `log()`):

```bash
#!/usr/bin/env bash
#
# DevDigest — stop everything dev.sh started: API (:3001), web (:3000), Postgres.
# Data volume is kept. Safe to re-run.
set -euo pipefail

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }

for port in 3001 3000; do
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN || true)"
  if [ -n "$pids" ]; then
    log "stopping :$port (PID $(echo $pids))"
    kill $pids 2>/dev/null || true
  fi
done

if [ "$(docker inspect -f '{{.State.Running}}' devdigest-postgres 2>/dev/null)" = "true" ]; then
  log "stopping Postgres container"
  docker stop devdigest-postgres >/dev/null
fi
log "stopped"
```

- `docker stop` by container name, not `compose down` — works even if container belongs to another compose project (same reason dev.sh reuses it). Volume + container kept → next dev.sh just `docker start`s it.
- `-sTCP:LISTEN` — only kills listeners, not browser connections to :3000.
- `scripts/dev.sh:99` log hint → `stop it with: ./scripts/stop.sh`.

Skipped: `--keep-db` flag, SIGKILL escalation — add if needed.

## Verify
1. `./scripts/dev.sh`, then close terminal / kill abruptly.
2. `./scripts/stop.sh` → `lsof -i :3000 -i :3001` empty, `docker ps` has no devdigest-postgres.
3. Re-run `./scripts/stop.sh` → only "stopped", exit 0.
