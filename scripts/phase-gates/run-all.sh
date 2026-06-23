#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

for n in 1 2 3 4 5 6 7 8 9 10; do
  bash "scripts/phase-gates/phase-${n}.sh"
done

echo "All phase gates PASSED"
