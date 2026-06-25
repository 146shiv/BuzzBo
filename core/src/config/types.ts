/** Shared config types — kept in sync with src/config.ts (types only, no runtime). */

export enum Platform {
    Instagram = 1,
    YouTube = 2,
}

export const PLATFORM_LABELS: Record<Platform, string> = {
    [Platform.Instagram]: 'Instagram',
    [Platform.YouTube]: 'YouTube',
};

export interface DelayConfig {
    base: number;
    variance: number;
}

export interface ActionDelayConfig {
    min: number;
    max: number;
}

export interface BehaviorConfig {
    shortWaitMs: DelayConfig;
    navigationWaitMs: DelayConfig;
    typingDelayMs: DelayConfig;
}

export interface HashtagEngagementConfig {
    maxPostsToComment: number;
    minLikes: number;
    minComments: number;
    likeWeight: number;
    commentWeight: number;
}

export interface UiHashtagSearchConfig extends HashtagEngagementConfig {
    maxPostsToScan: number;
    preferTopTab: boolean;
}

export interface ApiHashtagSearchConfig extends HashtagEngagementConfig {
    fetchBatchSize: number;
}

export interface HashtagSearchConfig {
    ui_search: UiHashtagSearchConfig;
    api_search: ApiHashtagSearchConfig;
}

export interface AccountHashtagSearchOverride {
    ui_search?: Partial<UiHashtagSearchConfig>;
    api_search?: Partial<ApiHashtagSearchConfig>;
}

export type LoginMethod = 'credentials' | 'manual';
export type MentionPolicy = 'ai_only' | 'append_if_missing' | 'always';
export type PostSourceMode =
    | 'new_post_added_to_account'
    | 'url_list'
    | 'hashtag_list'
    | 'hashtag_api';
export type AiProvider = 'gemini' | 'groq' | 'local';
export type BrowserChannel = 'chrome' | 'chromium' | 'msedge';

export interface ViewportConfig {
    width: number;
    height: number;
}

export interface AccountConfig {
    enabled: boolean;
    username: string;
    loginMethod?: LoginMethod;
    password?: string;
    sourceMode?: PostSourceMode;
    skillsFile?: string;
    postUrlsFile?: string;
    hashtags?: string[];
    hashtagSearch?: AccountHashtagSearchOverride;
    instagramApiAccessToken?: string;
    instagramApiUserId?: string;
    aiPromptHint?: string;
    actionDelaySeconds?: ActionDelayConfig;
    targets?: string[];
    mentionUsername?: string;
    mentionPolicy?: MentionPolicy;
    /** Remote-only: inline skills content from DB */
    skillsContent?: string;
    /** Remote-only: inline post URLs from DB */
    postUrls?: string[];
    /** Remote-only: platform account UUID */
    id?: string;
    /** Remote-only: platform enum value */
    platform?: number;
}

export interface SettingsConfig {
    headless: boolean;
    developerMode: boolean;
    browserChannel: BrowserChannel;
    browserViewport: ViewportConfig;
    aiProvider: AiProvider;
    googleAiApiKey: string;
    groqApiKey: string;
    groqModel: string;
    groqVisionModel: string;
    localLlmBaseUrl: string;
    localLlmModel: string;
    mockAiComments: boolean;
    aiMaxRequestsPerMinute: number;
    behavior: BehaviorConfig;
    defaultActionDelaySeconds: ActionDelayConfig;
    monitoringIntervalSeconds: ActionDelayConfig;
    hashtagSearch: HashtagSearchConfig;
}

export interface Config {
    settings: SettingsConfig;
    accounts: AccountConfig[];
}

export const DEFAULT_SETTINGS: SettingsConfig = {
    headless: true,
    developerMode: false,
    browserChannel: 'chrome',
    browserViewport: { width: 1440, height: 900 },
    aiProvider: 'groq',
    googleAiApiKey: 'YOUR_GOOGLE_AI_API_KEY_HERE',
    groqApiKey: 'YOUR_GROQ_API_KEY_HERE',
    groqModel: 'llama-3.3-70b-versatile',
    groqVisionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    localLlmBaseUrl: 'http://localhost:11434/v1',
    localLlmModel: 'llama3.2',
    mockAiComments: false,
    aiMaxRequestsPerMinute: 15,
    monitoringIntervalSeconds: { min: 360, max: 600 },
    behavior: {
        shortWaitMs: { base: 1200, variance: 2000 },
        navigationWaitMs: { base: 3500, variance: 4500 },
        typingDelayMs: { base: 140, variance: 220 },
    },
    defaultActionDelaySeconds: { min: 90, max: 180 },
    hashtagSearch: {
        ui_search: {
            maxPostsToScan: 2,
            maxPostsToComment: 3,
            minLikes: 0,
            minComments: 0,
            likeWeight: 1,
            commentWeight: 2,
            preferTopTab: true,
        },
        api_search: {
            fetchBatchSize: 100,
            maxPostsToComment: 5,
            minLikes: 0,
            minComments: 0,
            likeWeight: 1,
            commentWeight: 2,
        },
    },
};
