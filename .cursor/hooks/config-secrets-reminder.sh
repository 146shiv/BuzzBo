#!/usr/bin/env bash
# Remind when config.ts may contain real credentials (reads stdin JSON from Cursor hook)
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path','') or d.get('path',''))" 2>/dev/null || true)

if [[ "$FILE_PATH" != *"config.ts" ]]; then
  exit 0
fi

CONTENT=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('new_string','') or d.get('content','') or '')" 2>/dev/null || true)

if echo "$CONTENT" | grep -qE 'AIza[0-9A-Za-z_-]{20,}'; then
  echo "WARNING: config.ts may contain a real Google AI API key. Use YOUR_GOOGLE_AI_API_KEY_HERE in committed files." >&2
fi

if echo "$CONTENT" | grep -qE 'password:\s*"[^Y][^"]{6,}"'; then
  echo "WARNING: config.ts may contain a real password. Never commit credentials." >&2
fi

exit 0
