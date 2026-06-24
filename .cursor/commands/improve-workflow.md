---
description: Improve bot code or maintain the .cursor workflow stack
---

Run the **improve** pipeline for:

**Scope:** {{file path(s), feature area, or `.cursor` to maintain workflows}}

**Goal:** {{bug, feature, detection evasion, AI quality, or sync .cursor tooling}}

---

## Mode detection

| If scope includes… | Mode |
|--------------------|------|
| `.cursor/`, `workflows`, `commands`, `skills`, `rules`, `agents`, `hooks` | **Workflow maintain** → skill §Workflow maintain |
| `src/`, a file path, or a feature goal | **Bot improve** → skill §Bot improve |

Do not mix modes unless the user explicitly asks for both.

Read `.cursor/skills/improve-workflow/SKILL.md` and execute phases in order.

Load toolchain from `.cursor/`:

| Asset | Use |
|-------|-----|
| `.cursor/AGENTS.md` | Phase order, module map |
| `.cursor/rules/*.mdc` | Auto-apply when editing matching files |
| `.cursor/skills/bot-debug/SKILL.md` | Failures, logs, screenshots |
| `.cursor/skills/bot-test/SKILL.md` | test-comment verification |
| `.cursor/skills/genai-comments/SKILL.md` | AI/prompt changes |
| `.cursor/skills/playwright-selectors/SKILL.md` | Selector fixes |

Do not commit unless asked.
