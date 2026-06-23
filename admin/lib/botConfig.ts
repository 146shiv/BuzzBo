import type { AccountConfig, Config } from '@shared/config-types';
import type { DbPlatformAccount } from '@/lib/db/types';
import { Platform } from '@/lib/db/types';

export function platformAccountToBotConfig(account: DbPlatformAccount): AccountConfig {
    const cfg = account.config;
    return {
        id: account.id,
        platform: account.platform,
        enabled: account.enabled,
        username: account.username,
        loginMethod: cfg.loginMethod,
        password: cfg.password,
        sourceMode: cfg.sourceMode as AccountConfig['sourceMode'],
        hashtags: cfg.hashtags,
        hashtagSearch: cfg.hashtagSearch as AccountConfig['hashtagSearch'],
        instagramApiAccessToken: cfg.instagramApiAccessToken,
        instagramApiUserId: cfg.instagramApiUserId,
        aiPromptHint: cfg.aiPromptHint,
        actionDelaySeconds: cfg.actionDelaySeconds,
        targets: cfg.targets,
        mentionUsername: cfg.mentionUsername,
        mentionPolicy: cfg.mentionPolicy as AccountConfig['mentionPolicy'],
        skillsContent: account.skills_content,
        postUrls: account.post_urls,
        skillsFile: `remote://${account.id}/skills.txt`,
        postUrlsFile: account.post_urls.length
            ? `remote://${account.id}/urls.txt`
            : undefined,
    };
}

export function botConfigFromDb(
    settings: Config['settings'],
    accounts: DbPlatformAccount[]
): Config {
    return {
        settings,
        accounts: accounts.map(platformAccountToBotConfig),
    };
}

export function platformLabel(platform: Platform): string {
    return platform === Platform.YouTube ? 'YouTube' : 'Instagram';
}
