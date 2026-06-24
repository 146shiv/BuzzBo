# Playwright Selectors — Reference

## Login flow locators

```typescript
// Cookie / save-info dialogs (dismiss if present)
page.getByRole('button', { name: 'Allow all cookies' })
page.getByRole('button', { name: 'Save Info' })  // or 'Save info'
page.getByRole('button', { name: 'Not Now' })
page.getByRole('button', { name: 'Log in', exact: true })
```

## Post modal structure

```
div[role="dialog"]
├── h1                    — caption
├── video                 — video post
├── img[src*="instagram"] — post image
├── textarea[aria-label*="Add a comment"]
└── form → button "Post"
```

## Image fallback chain (bot.ts)

```typescript
page.locator('div[role="dialog"] img[src*="instagram"]').first()
page.locator('div[role="dialog"] img[alt]').first()
page.locator('div[role="dialog"] article img').first()
```

## Video capture

- Intercept network for `.mp4` URLs during video load
- Error text: `Sorry, we're having trouble playing this video`
- Fallback: comment on caption only if video unavailable

## Profile stats (main.ts)

- Navigate to `https://www.instagram.com/{username}/`
- Parse post/follower counts from profile header
- Screenshot on failure: `stats_error_{username}.png`

## Recovery checklist

1. Confirm Instagram did not change aria-labels (inspect in browser)
2. Add `await locator.waitFor({ state: 'visible', timeout: 15000 })`
3. Retry with broader locator, then narrow
4. Check if account is logged out (login form visible)
5. Check rate limiting (unusual delays, challenge pages)

## Anti-detection notes

- Do not remove `HumanBehavior` delays when fixing selectors
- Keep fingerprint spoofing in `fingerprint.ts` intact
- Screenshot paths: `data/logs/{context}_error_{username}.png`
