import type { AccountConfig, HashtagSearchConfig, SettingsConfig } from '@buzzbo/core/config';

export interface ResolvedAccountSettings {
    hashtags: string[];
    hashtagSearch: HashtagSearchConfig;
}

function normalizeHashtags(hashtags: string[]): string[] {
    return hashtags
        .map(tag => tag.trim().replace(/^#/, '').toLowerCase())
        .filter(Boolean);
}

export function resolveAccountSettings(
    account: AccountConfig,
    settings: SettingsConfig
): ResolvedAccountSettings {
    const usesHashtags =
        account.sourceMode === 'hashtag_list' || account.sourceMode === 'hashtag_api';
    const hashtags =
        usesHashtags && account.hashtags
            ? normalizeHashtags(account.hashtags)
            : account.hashtags ?? [];

    return {
        hashtags,
        hashtagSearch: {
            ui_search: {
                ...settings.hashtagSearch.ui_search,
                ...account.hashtagSearch?.ui_search,
            },
            api_search: {
                ...settings.hashtagSearch.api_search,
                ...account.hashtagSearch?.api_search,
            },
        },
    };
}
