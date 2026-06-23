#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== Phase 4 gate: Electron scaffold =="

npm run build:core
npm run build:instagram-bot
npm run build:electron

node scripts/phase-gates/electron-smoke-launch.mjs

echo "Phase 4 gate PASSED"
