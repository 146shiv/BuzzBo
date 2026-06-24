---
name: bot-debug
description: Debug Instagram bot failures using logs and screenshots. Use when errors occur, result is FAILED, or when running /debug-bot.
---

# Bot Debug

## Quick triage

1. Read latest `data/logs/*_error_*.png` screenshots
2. Read `data/logs/interaction_log.csv` for recent attempts
3. Check terminal output / chalk logger messages for account prefix
4. Confirm account `enabled: true` and has `targets` in `config.ts`

## By symptom

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Login loop | Expired cookies, CAPTCHA, 2FA | `npm run checker`, `headless: false` |
| Selector timeout | Instagram UI change | Delegate `playwright-explorer`; read `playwright-selectors/reference.md` |
| Empty AI comment | API key, Gemini error | Check `googleAiApiKey`; read `[AI_ERROR]` logs |
| SKIPPED | Private profile, no posts, already commented | Expected; verify `profile_stats.csv` |
| Video play error | "trouble playing this video" | Check video capture in `bot.ts` |

## Debug settings

```typescript
// config.ts — local debug
settings: {
  headless: false,
  developerMode: true,
  // ...
}
```

## Playwright Inspector

- Press `i` in terminal during run → pauses at next `checkForPause()`
- Or add `await page.pause()` temporarily (remove before commit)

## Verify fix

```bash
npx ts-node src/main.ts test-comment <username>
```

Report: root cause, evidence, fix applied, test result.
