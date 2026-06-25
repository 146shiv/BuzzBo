---
description: Debug bot failures — logs, screenshots, root cause, fix, verify
---

Debug the bot for:

**Issue:** {{error message, FAILED result, symptom, or account/target}}

**Context:** {{when it happens, mode, recent changes}}

---

1. Read `.cursor/skills/bot-debug/SKILL.md`
2. Delegate to `bot-debugger` agent for root-cause analysis
3. If selectors/DOM: also delegate `playwright-explorer`
4. Apply minimal fix
5. Verify via Electron app (`npm run dev:electron`)

### Deliver
- Root cause and evidence (logs, screenshot paths)
- Fix applied
- Test result
- Prevention note if applicable

Do not commit unless asked.
