# Buzzbo — Agent Workflow

Agent guide for developing, debugging, and improving this Playwright + Gemini bot.

## Stack

- TypeScript, ts-node, Playwright, `@google/genai`, chalk
- Entry: `src/main.ts`
- Modes: `monitor` (default), `test-comment`, `check-accounts`

## Module map

| File | Role |
|------|------|
| `src/main.ts` | Orchestration, monitoring loop, CLI modes |
| `src/bot.ts` | Instagram login, post detection, commenting |
| `src/genai.ts` | Gemini comment generation (text/image/video) |
| `src/humanBehavior.ts` | Mouse, typing, scroll emulation |
| `src/fingerprint.ts` | Per-account browser fingerprint |
| `src/config.ts` | Accounts, API key, delays, behavior |
| `src/logger.ts` | Chalk console logging |

## Data paths

- `data/cookies/{username}.json` — session cookies
- `data/logs/interaction_log.csv` — comment history
- `data/logs/profile_stats.csv` — post/follower counts per target
- `data/logs/*_error_*.png` — error screenshots

## Commands

| Command | Phases |
|---------|--------|
| `/improve-workflow` | Bot improve **or** `.cursor` maintain (mode from scope) |
| `/full-workflow` | Assess → plan → implement → test → verify |
| `/debug-bot` | Logs/screenshots → root cause → fix → test-comment |
| `/test-comment` | Scoped single-comment test run |
| `/add-account` | Config entry + cookie setup via check-accounts |
| `/tune-prompts` | Tune `genai.ts` / per-account `aiPromptHint` |

## `/improve-workflow` inputs

- **Bot improve:** `Scope: src/bot.ts` or feature area + goal (bug, detection, AI quality)
- **Workflow maintain:** `Scope: .cursor` — sync commands, skills, rules, agents, hooks

## npm scripts

```bash
npm start          # monitor mode
npm test           # test-comment (first enabled account)
npm run checker    # check-accounts (non-headless login)
```

## Subagent hints

| Agent | Delegate when |
|-------|---------------|
| `bot-debugger` | FAILED results, exceptions, error screenshots |
| `playwright-explorer` | Broken selectors, Instagram UI changes |
| `ai-prompt-tuner` | Comment quality, tone, `aiPromptHint` tuning |

## Reference files

- Improvement briefs: `doc/bot-tasks/*-improvements-brief.md` (template: `_improve-template.md`)
- Selector deep-dive: `.cursor/skills/playwright-selectors/reference.md`
- Prompt rules: `.cursor/skills/genai-comments/reference.md`

## Conventions

1. Read target module before editing; keep diffs minimal
2. Rules in `.cursor/rules/` apply automatically by glob
3. Read skills only when a command references them
4. Use `developerMode: true` in config for fast local iteration
5. Never commit real API keys or passwords
6. Do not commit unless the user asks
