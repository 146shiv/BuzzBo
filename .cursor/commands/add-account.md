---
description: Add a new Instagram account to config and set up session cookies
---

Add account:

**Username:** {{instagram username}}

**Login method:** {{credentials | manual}}

**Source mode:** {{new_post_added_to_account | url_list | hashtag_list}}

**skillsFile:** {{data/accounts/{username}/skills.txt}}

**Mode-specific:** {{targets for monitor, postUrlsFile for url_list, hashtags array for hashtag_list}}

**Optional:** {{aiPromptHint, actionDelaySeconds, hashtagSearch, enabled}}

---

### Phase 1 — Config
1. Read `src/config.ts` and `.cursor/rules/config-secrets.mdc`
2. Add account block to `accounts` array with `loginMethod` and `sourceMode`
3. Use placeholders for password when `loginMethod: 'credentials'`
4. Set `enabled: true` only when user confirms credentials/session are ready

### Phase 2 — Cookie setup
1. For `loginMethod: 'manual'`: set `headless: false`, run `npm run checker`, log in in browser
2. For `loginMethod: 'credentials'`: run `npm run checker` to verify login and save cookies
3. Confirm `data/cookies/{username}.json` created

### Phase 3 — Verify
Run `npx ts-node src/main.ts test-comment <username>`

### Deliver
- Config changes summary
- Cookie file status
- Test result

Never commit real passwords. Do not commit unless asked.
