#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== Phase 9 gate: Legacy removal + packaging =="

test ! -d src || { echo "FAIL: src/ still exists"; exit 1; }
test ! -d shared || { echo "FAIL: shared/ still exists"; exit 1; }

npm run build:core
npm run build:instagram-bot
npm run build:electron
npm run build:admin
npm run dist -w @buzzbo/electron-app

echo "Phase 9 gate PASSED"
