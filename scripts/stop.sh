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
