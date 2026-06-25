---
name: genai-comments
description: Tune AI comment generation in core/src/ai/genai.ts and per-account aiPromptHint. Use when editing genai.ts, comment quality issues, or /tune-prompts.
---

# GenAI Comments

## Model & config

- Model config in `core/src/ai/genai.ts` (Gemini/Groq/local via admin settings)
- `temperature: 0.9`, `maxOutputTokens: 80`
- Multimodal: sends image or video inline when URL captured from post

## Core prompt rules (do not remove without reason)

- Short (1 sentence), specific to post content
- No emojis, no hashtags, no exclamation marks
- No first-person ("I", "me")
- No generic praise ("Great post!", "Love this!")
- No questions; no personal opinions
- Per-account override via `aiPromptHint` in `config.ts`

## Tuning workflow

1. Identify failure mode (too generic, wrong tone, too long, off-topic)
2. Adjust `buildPrompt()` rules in `genai.ts` OR add `aiPromptHint` for one account
3. Test via Electron app (`npm run dev:electron`)
4. Compare output in `interaction_log.csv`

## Generation config tweaks

| Goal | Knob |
|------|------|
| More variety | Raise `temperature` slightly (max ~1.0) |
| Shorter comments | Lower `maxOutputTokens` |
| Stricter tone | Add rules to prompt; prefer `aiPromptHint` for per-account |

## Full rule list

See [reference.md](reference.md) for complete prompt constraints and tuning patterns.
