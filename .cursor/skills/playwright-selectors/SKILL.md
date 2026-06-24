---
name: playwright-selectors
description: Instagram Playwright selector strategy and recovery. Use when selectors break, UI changes, or editing bot.ts/main.ts automation.
---

# Playwright Selectors

## Strategy

1. Prefer role/text/aria: `getByRole('button', { name: 'Post' })`
2. Scope to modal: `page.locator('div[role="dialog"]')`
3. Chain locators; avoid page-wide single selectors
4. Use `.first()` only when multiple matches expected
5. Wait for visibility before interact; use existing `HumanBehavior` delays

## Key selectors in bot.ts

| Action | Locator pattern |
|--------|-----------------|
| Logged in | `a[href="/{username}/"]` or `svg[aria-label="Home"]` |
| Login form | `input[name="username"]` |
| Post links | `main a[href*="/p/"], main a[href*="/reel/"]` |
| Caption | `div[role="dialog"] h1` |
| Comment box | `textarea[aria-label*="Add a comment"]` |
| Post button | `form` → `getByRole('button', { name: 'Post' })` |
| Private profile | `getByText('This Account Is Private')` |

## Pinned posts

Exclude pinned: `hasNot: page.locator('svg[aria-label="Pinned post icon"]')`

## When selectors break

1. Run `headless: false`, reproduce manually
2. Delegate `playwright-explorer` for DOM inspection
3. Update locators in `bot.ts` only; minimal diff
4. Verify with `test-comment`

## Deep reference

See [reference.md](reference.md) for dialog structure, image/video capture, and recovery steps.
