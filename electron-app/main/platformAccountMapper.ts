import type { AccountConfig } from '@buzzbo/core/config';

export function platformAccountToBotConfig(account: Record<string, unknown>): AccountConfig {
    const cfg = (account.config as Record<string, unknown>) || {};
    return {
        id: String(account.id),
        platform: Number(account.platform),
        enabled: Boolean(account.enabled),
        username: String(account.username),
        loginMethod: (cfg.loginMethod as AccountConfig['loginMethod']) ?? 'manual',
        password: cfg.password as string | undefined,
        sourceMode: cfg.sourceMode as AccountConfig['sourceMode'],
        hashtags: cfg.hashtags as string[] | undefined,
        hashtagSearch: cfg.hashtagSearch as AccountConfig['hashtagSearch'],
        instagramApiAccessToken: cfg.instagramApiAccessToken as string | undefined,
        instagramApiUserId: cfg.instagramApiUserId as string | undefined,
        aiPromptHint: cfg.aiPromptHint as string | undefined,
        actionDelaySeconds: cfg.actionDelaySeconds as AccountConfig['actionDelaySeconds'],
        targets: cfg.targets as string[] | undefined,
        mentionUsername: cfg.mentionUsername as string | undefined,
        mentionPolicy: cfg.mentionPolicy as AccountConfig['mentionPolicy'],
        skillsContent: String(account.skills_content || ''),
        postUrls: (account.post_urls as string[]) || [],
    };
}
