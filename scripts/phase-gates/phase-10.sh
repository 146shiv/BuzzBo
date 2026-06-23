#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== Phase 10 gate: E2E smoke =="

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export BUZZBO_ADMIN_API_URL="${BUZZBO_ADMIN_API_URL:-${ADMIN_API_URL:-http://localhost:3000}}"

node scripts/phase-gates/test-e2e-smoke.mjs

echo "Phase 10 gate PASSED"
