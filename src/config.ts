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

export interface HashtagSearchConfig {
    maxPostsToScan: number;
    maxPostsToComment: number;
    minLikes: number;
    minComments: number;
    likeWeight: number;
    commentWeight: number;
    preferTopTab: boolean;
}

export interface AccountConfig {
    enabled: boolean;
    username: string;
    password: string;
    aiPromptHint?: string;
    actionDelaySeconds?: ActionDelayConfig;
    targets: string[];
}

export interface SettingsConfig {
    headless: boolean;
    developerMode: boolean;
    googleAiApiKey: string;
    mockAiComments: boolean;
    behavior: BehaviorConfig;
    defaultActionDelaySeconds: ActionDelayConfig;
    monitoringIntervalSeconds: ActionDelayConfig;
    commentUrlsFile: string;
    hashtagsFile: string;
    hashtagSearch: HashtagSearchConfig;
    manualSessionCookieName: string;
    manualLoginAiPromptHint?: string;
}

export interface Config {
    settings: SettingsConfig;
    accounts: AccountConfig[];
}

export const config: Config = {
    settings: {
        headless: true,
        developerMode: false,
        googleAiApiKey: "YOUR_GOOGLE_AI_API_KEY_HERE",
        mockAiComments: true,
        monitoringIntervalSeconds: {
            min: 360,
            max: 600,
        },
        behavior: {
            shortWaitMs: { base: 1200, variance: 2000 },
            navigationWaitMs: { base: 3500, variance: 4500 },
            typingDelayMs: { base: 140, variance: 220 },
        },
        defaultActionDelaySeconds: {
            min: 90,
            max: 180,
        },
        commentUrlsFile: 'data/post_urls.txt',
        hashtagsFile: 'data/hashtags.txt',
        hashtagSearch: {
            maxPostsToScan: 24,
            maxPostsToComment: 3,
            minLikes: 0,
            minComments: 0,
            likeWeight: 1,
            commentWeight: 2,
            preferTopTab: true,
        },
        manualSessionCookieName: 'manual_session',
        manualLoginAiPromptHint: 'Write a supportive, authentic comment related to the post content.',
    },
    accounts: [
        {
            enabled: false,
            username: 'your_instagram_username_1',
            password: 'your_instagram_password_1',
            aiPromptHint: 'Write a supportive comment related to fitness and personal growth.',
            actionDelaySeconds: { min: 80, max: 160 },
            targets: [ 
                // Add target usernames here, for example:
                'instagram', 
                'playwright'
            ],
        },
        {
            enabled: false,
            username: 'your_instagram_username_2',
            password: 'your_instagram_password_2',
            aiPromptHint: 'Write a curious and engaging comment about technology or art.',
            actionDelaySeconds: { min: 80, max: 160 },
            targets: [ 
                // Add target usernames here
                'nasa',
                'google'
             ],
        },
    ],
};