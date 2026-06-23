#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== Phase 1 gate: monorepo + core + instagram-bot =="

npm run build:core
npm run build:instagram-bot
npm run build:admin

node <<'NODE'
const path = require('path');
const root = process.cwd();
const core = require(path.join(root, 'core/dist/index.js'));
const ig = require(path.join(root, 'instagram-bot/dist/index.js'));
if (!core.Platform || !ig.InstagramBot) {
  console.error('Import smoke failed');
  process.exit(1);
}
console.log('Import smoke OK');
NODE

echo "Phase 1 gate PASSED"
