# Buzzbo — Agent Workflow

Agent guide for developing, debugging, and improving this Playwright + AI comment bot.

## Stack

- Monorepo: `core/`, `instagram-bot/`, `electron-app/`, `admin/`
- Electron desktop client + Next.js admin API
- Playwright bot in `@buzzbo/instagram-bot`; AI via admin API (`POST /api/bot/ai/generate-comment`)

## Module map

| Package / path | Role |
|----------------|------|
| `electron-app/` | Desktop UI, bot runner, session/cookies |
| `instagram-bot/` | Instagram login, post detection, commenting |
| `core/src/ai/genai.ts` | AI comment generation (server-side) |
| `core/src/ai/remoteAiCommentGenerator.ts` | Electron → admin AI proxy client |
| `admin/app/api/bot/` | Bot config, comments, AI endpoints |
| `core/src/config/` | Shared settings types |

## Data paths (Electron)

- `~/Library/Application Support/Buzzbo/cookies/` — session cookies (prod)
- `~/Library/Application Support/Buzzbo/logs/` — error screenshots (prod)
- Admin API — comment history (no local CSV in prod; CSV only when `developerMode: true`)

## Commands

| Command | Phases |
|---------|--------|
| `/improve-workflow` | Bot improve **or** `.cursor` maintain (mode from scope) |
| `/full-workflow` | Assess → plan → implement → test → verify |
| `/debug-bot` | Logs/screenshots → root cause → fix → test-comment |
| `/test-comment` | Test comment via Electron app |
| `/add-account` | Admin panel account + cookie setup |
| `/tune-prompts` | Tune `core/src/ai/genai.ts` / per-account `aiPromptHint` |

## npm scripts

```bash
npm run dev              # admin API (localhost:3000)
npm run dev:electron     # Electron app (dev admin URL)
npm run dev:electron:prod  # Electron app (prod admin URL)
npm run dist:mac:prod    # Production macOS build
```

## Subagent hints

| Agent | Delegate when |
|-------|---------------|
| `bot-debugger` | FAILED results, exceptions, error screenshots |
| `playwright-explorer` | Broken selectors, Instagram UI changes |
| `ai-prompt-tuner` | Comment quality, tone, `aiPromptHint` tuning |

## Conventions

1. Read target module before editing; keep diffs minimal
2. AI keys live in admin configuration (Supabase), never in Electron client
3. Use `developerMode: true` in admin settings for fast local iteration
4. Never commit real API keys or passwords
5. Do not commit unless the user asks
