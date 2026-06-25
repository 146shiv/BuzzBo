---
name: bot-test
description: Run and interpret test-comment mode for a single account. Use when running /test-comment or verifying bot changes.
---

# Bot Test (Electron test-comment)

## Run

```bash
# Terminal 1 — admin API
npm run dev

# Terminal 2 — Electron app
npm run dev:electron
```

In the Electron app: log in → select account → use **Test comment** on a post URL (or start a url_list run).

## Prerequisites

- Account enabled in admin panel
- Valid AI keys saved in admin configuration (Groq/Gemini)
- Cookies saved via in-app login flow

## What it does

1. Launches browser for one account
2. Logs in (or uses saved cookies)
3. Opens target post URL
4. Calls admin API for AI comment generation
5. Posts comment and records to admin comment history

## Results

| Result | Meaning |
|--------|---------|
| `SUCCESS` | Comment posted and verified in dialog |
| `SKIPPED` | Private profile, no post, or duplicate comment |
| `FAILED` | Error during flow; check Bot Logs and screenshots |

## Fast iteration

Set `developerMode: true` in admin global settings for shorter delays and local CSV logging.

## After test

- Check Bot Logs panel in Electron for AI errors (backend returns detailed messages)
- Error screenshots: `~/Library/Application Support/Buzzbo/logs/` (prod) or app userData in dev
- Comment history: admin panel / Electron Comment Activity panel
