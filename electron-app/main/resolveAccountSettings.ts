import type { AccountConfig, FeedBrowseConfig, FeedBrowseSurface, HashtagSearchConfig, SettingsConfig } from '@buzzbo/core/config';
import { DEFAULT_SETTINGS } from '@buzzbo/core/config';

export interface ResolvedAccountSettings {
    hashtags: string[];
    hashtagSearch: HashtagSearchConfig;
    feedBrowse: FeedBrowseConfig;
}

const FALLBACK_FEED_BROWSE: FeedBrowseConfig = {
    maxItemsToScan: 30,
    maxCommentsPerRun: 5,
    minRelevanceScore: 0.55,
    watchItemSeconds: { min: 3, max: 8 },
    surfaces: ['reels', 'home'],
};

export function resolveFeedBrowseConfig(
    account: AccountConfig,
    settings: SettingsConfig
): FeedBrowseConfig {
    const defaults = DEFAULT_SETTINGS.feedBrowse ?? FALLBACK_FEED_BROWSE;
    const merged: FeedBrowseConfig = {
        ...defaults,
        ...settings.feedBrowse,
        ...account.feedBrowse,
    };

    const rawSurfaces = merged.surfaces;
    const surfaces: FeedBrowseSurface[] =
        Array.isArray(rawSurfaces) && rawSurfaces.length > 0
            ? (rawSurfaces.filter(s => s === 'reels' || s === 'home') as FeedBrowseSurface[])
            : [...defaults.surfaces];

    return {
        ...merged,
        surfaces: surfaces.length > 0 ? surfaces : [...defaults.surfaces],
        watchItemSeconds: merged.watchItemSeconds ?? defaults.watchItemSeconds,
    };
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
        feedBrowse: resolveFeedBrowseConfig(account, settings),
    };
}
