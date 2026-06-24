---
name: bot-test
description: Run and interpret test-comment mode for a single account. Use when running /test-comment or verifying bot changes.
---

# Bot Test (test-comment mode)

## Run

```bash
# First enabled account, first target
npm test

# Specific account
npx ts-node src/main.ts test-comment <instagram_username>
```

## Prerequisites

- Account `enabled: true` in `config.ts`
- At least one `targets` entry
- Valid `googleAiApiKey`
- Cookies at `data/cookies/{username}.json` (or login will run)

## What it does

1. Launches browser for one account
2. Logs in (or uses saved cookies)
3. Opens first target's latest non-pinned post
4. Generates AI comment (caption + image/video if present)
5. Posts comment and logs to `interaction_log.csv`

## Results

| Result | Meaning |
|--------|---------|
| `SUCCESS` | Comment posted and verified in dialog |
| `SKIPPED` | Private profile, no post, or duplicate comment |
| `FAILED` | Error during flow; check logs and screenshots |

## Fast iteration

Set `developerMode: true` in config for shorter delays.

## After test

- Confirm row in `data/logs/interaction_log.csv`
- Check `data/logs/` for new error screenshots
- For login issues, use `npm run checker` instead
