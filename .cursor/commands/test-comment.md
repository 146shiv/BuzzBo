---
description: Run scoped test-comment for one account and interpret results
---

Test comment flow for:

**Account:** {{instagram username, or "first enabled"}}

**Target:** {{optional target username; defaults to first in config}}

---

1. Read `.cursor/skills/bot-test/SKILL.md`
2. Confirm account `enabled: true` with targets in `src/config.ts`
3. Run:

```bash
Use Electron app test comment flow (`npm run dev:electron`).
```

4. Report result: SUCCESS / SKIPPED / FAILED
5. Check `data/logs/interaction_log.csv` and any new `*_error_*.png`

For login/CAPTCHA issues, suggest `npm run checker` instead.

Do not commit unless asked.
