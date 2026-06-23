#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== Phase 5 gate: Auth + IPC =="

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export BUZZBO_ADMIN_API_URL="${BUZZBO_ADMIN_API_URL:-${ADMIN_API_URL:-http://localhost:3000}}"

# Start admin if not reachable
if ! curl -sf "${BUZZBO_ADMIN_API_URL}/api/auth/me" -o /dev/null 2>/dev/null; then
  echo "Starting admin dev server..."
  npm run admin:dev &
  ADMIN_PID=$!
  trap 'kill $ADMIN_PID 2>/dev/null || true' EXIT
  for _ in $(seq 1 60); do
    if curl -sf "${BUZZBO_ADMIN_API_URL}/api/auth/me" -o /dev/null 2>/dev/null; then
      break
    fi
    sleep 1
  done
fi

npm run build:electron
node scripts/phase-gates/test-electron-ipc.mjs

echo "Phase 5 gate PASSED"
