---
name: bot-debug
description: Debug Instagram bot failures using logs and screenshots. Use when errors occur, result is FAILED, or when running /debug-bot.
---

# Bot Debug

## Quick triage

1. Read latest error screenshots in Electron userData logs dir
2. Check Bot Logs panel in Electron for AI/backend errors
3. Confirm account enabled and configured in admin panel
4. Verify AI keys set in admin configuration (not exposed to client)

## By symptom

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Login loop | Expired cookies, CAPTCHA, 2FA | Re-login via Electron account login flow |
| Selector timeout | Instagram UI change | Delegate `playwright-explorer`; read `playwright-selectors/reference.md` |
| AI generation failed | Invalid key, Groq/Gemini error | Check admin AI settings; Bot Logs shows backend error |
| SKIPPED | Private profile, no posts, already commented | Expected |
| Video play error | "trouble playing this video" | Set `browserChannel: 'chrome'` in admin settings |
| CSV ENOTDIR | Legacy path in asar | Fixed: CSV only when `developerMode: true` |

## Debug settings

In admin global settings:

- `headless: false` — see browser
- `developerMode: true` — short delays + local CSV log

## Verify fix

Run Electron app (`npm run dev:electron`) and test comment on one post.

Report: root cause, evidence, fix applied, test result.
