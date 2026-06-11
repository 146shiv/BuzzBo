---
name: improve-workflow
description: Improve bot code or maintain the .cursor workflow stack. Use when running /improve-workflow or when scope includes .cursor maintenance.
disable-model-invocation: true
---

# Improve Workflow

Two modes — detect from scope before starting.

## Bot improve (default)

Scope is `src/`, a file path, or a feature goal (not `.cursor`).

### Phase 1 — Assess

1. Read target module(s) and nearest callers (e.g. `bot.ts` → `main.ts`).
2. Check `data/logs/` for `*_error_*.png`, `interaction_log.csv`, `profile_stats.csv`.
3. List gaps: correctness, selectors, AI quality, delays, error handling, config.

### Phase 2 — Plan

1. Prioritize: P0 (blockers), P1 (reliability/quality), P2 (polish).
2. For non-trivial scope, save brief to `doc/bot-tasks/{slug}-improvements-brief.md` using `doc/bot-tasks/_improve-template.md`.
3. Reference skills as needed: `bot-debug`, `genai-comments`, `playwright-selectors`.

### Phase 3 — Implement

1. Minimal diff; follow `.cursor/rules/`.
2. No unrelated edits; no new deps without approval.

### Phase 4 — Test

```bash
npx ts-node src/main.ts test-comment <username>
```

Use `developerMode: true` for faster iteration. Use `npm run checker` for login/CAPTCHA issues.

### Phase 5 — Verify

- Check `interaction_log.csv` for new entry
- Confirm no new error screenshots
- Note any deferred manual checks (headless monitor run, rate limits)

### Deliver (bot improve)

- Files changed
- Brief path (if saved)
- P0/P1 fixes applied vs deferred
- Test result (SUCCESS/SKIPPED/FAILED)
- Remaining manual tasks

---

## Workflow maintain

Scope includes `.cursor`, `commands`, `skills`, `rules`, `agents`, or `hooks`.

### Phase W1 — Inventory

Read:

- `.cursor/AGENTS.md`
- `.cursor/commands/*.md`
- `.cursor/skills/**/SKILL.md` and `reference.md` files
- `.cursor/rules/*.mdc`
- `.cursor/agents/*.md`
- `.cursor/hooks.json` + `.cursor/hooks/*.sh`
- `doc/bot-tasks/README.md`, `_improve-template.md`

### Phase W2 — Cross-check

| Check | Fix if drift |
|-------|--------------|
| Commands in `AGENTS.md` exist under `commands/` | Add missing or fix table |
| Commands reference real skill/rule paths | Update references |
| Skills exist; descriptions match usage | Fix frontmatter |
| Rule globs cover edited file types | Adjust globs |
| Hooks paths and matchers valid | Fix `hooks.json` or script |
| `doc/bot-tasks/` matches command brief naming | Sync docs |

### Phase W3 — Improve

1. Align phase order with `/full-workflow` vs `/improve-workflow`.
2. Remove dead references; tighten `{{placeholders}}`.
3. Keep rules under ~50 lines; skills under ~80 lines.
4. Do not rename commands or delete rules without user approval.

### Phase W4 — Validate

Output **workflow map**: command → skills → rules → agents → hooks for both pipelines.

Do not commit unless asked.
