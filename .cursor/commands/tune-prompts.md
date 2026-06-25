---
description: Tune Gemini comment prompts and per-account aiPromptHint
---

Tune comment generation for:

**Goal:** {{tone, length, specificity, or example bad/good comments}}

**Scope:** {{global genai.ts, specific account username, or both}}

---

1. Read `.cursor/skills/genai-comments/SKILL.md`
2. Delegate to `ai-prompt-tuner` agent
3. Edit `core/src/ai/genai.ts` `buildPrompt()` and/or `aiPromptHint` in admin account settings
4. Test via Electron app (`npm run dev:electron`)
5. Compare output in `interaction_log.csv`

### Deliver
- Prompt changes summary
- Sample before/after comments
- Test result

Do not commit unless asked.
