#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== Phase 2 gate: API extensions =="

npm run build:core
npm run build:admin

# Load .env if present
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE_URL="${BUZZBO_ADMIN_API_URL:-${ADMIN_API_URL:-http://localhost:3000}}"
export BUZZBO_ADMIN_API_URL="$BASE_URL"

node scripts/phase-gates/test-api-phase-2.cjs

echo "Phase 2 gate PASSED"
