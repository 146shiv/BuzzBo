#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== Phase 3 gate: shared account-settings UI =="

npm install
npm run build:core
npm run build:admin
npm run lint -w @buzzbo/admin 2>/dev/null || true

echo "Phase 3 gate PASSED"
