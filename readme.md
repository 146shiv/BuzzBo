# Buzzbo

Instagram AI commenter — Electron desktop client + Next.js admin panel.

## Monorepo layout

| Package | Path | Role |
|---------|------|------|
| `@buzzbo/core` | `core/` | Shared types, API client, AI, comment history, account-settings UI |
| `@buzzbo/instagram-bot` | `instagram-bot/` | Playwright Instagram automation |
| `@buzzbo/electron-app` | `electron-app/` | Buzzbo desktop app (login, dashboard, bot control) |
| `@buzzbo/admin` | `admin/` | Admin web UI + REST APIs |

## Quick start

1. Copy `.env.example` → `.env` and set `BUZZBO_ADMIN_API_URL` (default `http://localhost:3000`).
2. Configure `admin/.env` with Supabase credentials (see admin README).
3. Install dependencies:

```bash
npm install
```

4. Start the admin API:

```bash
npm run dev:admin
```

5. Start the Electron app:

```bash
npm run dev
```

Sign in with your Buzzbo bot-user credentials. Select a handle, configure settings in the drawer, then Start/Stop the bot.

## Build & distribute

```bash
npm run build          # core + instagram-bot + electron-app
npm run dist           # electron-builder (output in release/)
```

## Phase gates

Automated verification scripts for each migration phase:

```bash
npm run gate:phase-N   # N = 1..10
npm run gate:all
```

Set `TEST_BOT_USER` / `TEST_BOT_PASS` in `.env` for IPC/API gate tests.

## ⚠️ Disclaimer

Educational use only. Automating Instagram violates their Terms of Service and may result in account restrictions.
