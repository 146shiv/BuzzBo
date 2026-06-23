#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== Phase 7 gate: Settings PATCH round-trip =="

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export BUZZBO_ADMIN_API_URL="${BUZZBO_ADMIN_API_URL:-${ADMIN_API_URL:-http://localhost:3000}}"

npm run build:electron
node scripts/phase-gates/test-handle-patch-roundtrip.mjs

echo "Phase 7 gate PASSED"
