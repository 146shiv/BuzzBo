---
description: End-to-end workflow for new bot features — assess, plan, implement, test, verify
---

Run the full bot feature workflow for:

**Requirement:** {{feature goal, affected modules, account/target if relevant}}

Execute phases in order. Pause only if blocked.

### Phase 1 — Assess
Read related modules per `.cursor/AGENTS.md` module map. Check `data/logs/` if behavior-related.

### Phase 2 — Plan
Prioritize P0/P1/P2. For non-trivial work, save brief to `doc/bot-tasks/{slug}-improvements-brief.md` using `doc/bot-tasks/_improve-template.md`.

### Phase 3 — Implement
Minimal diff. Follow `.cursor/rules/`. Read skills only when relevant (`playwright-selectors`, `genai-comments`).

### Phase 4 — Test
Apply `/test-comment` logic. Read `.cursor/skills/bot-test/SKILL.md`.

```bash
Test via Electron app (`npm run dev:electron`).
```

### Phase 5 — Verify
Check `interaction_log.csv`, error screenshots, no regressions in monitor path if applicable.

### Deliver
- Files changed
- Brief path (if saved)
- Test result
- Remaining manual tasks (monitor run, rate limits, login check)

Do not commit unless asked.
