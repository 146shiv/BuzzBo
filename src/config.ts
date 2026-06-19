import * as fs from 'fs';
import * as path from 'path';

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
    /** Posts to fetch per API batch before ranking */
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

/** How @mentionUsername is applied to generated comments */
export type MentionPolicy = 'ai_only' | 'append_if_missing' | 'always';

export type PostSourceMode =
    | 'new_post_added_to_account'
    | 'url_list'
    | 'hashtag_list'
    | 'hashtag_api';

export interface AccountConfig {
    enabled: boolean;
    username: string;
    loginMethod?: LoginMethod;
    password?: string;
    sourceMode?: PostSourceMode;
    /** Per-account comment style/skills file (required when enabled) */
    skillsFile?: string;
    /** Per-account post URL list file (required for url_list) */
    postUrlsFile?: string;
    /** Per-account hashtags (required for hashtag_list / hashtag_api) */
    hashtags?: string[];
    hashtagSearch?: AccountHashtagSearchOverride;
    /** Instagram Graph API credentials (required for hashtag_api) */
    instagramApiAccessToken?: string;
    /** IG Business Account ID for Graph API (required for hashtag_api) */
    instagramApiUserId?: string;
    aiPromptHint?: string;
    actionDelaySeconds?: ActionDelayConfig;
    targets?: string[];
    /** Instagram handle to @tag in comments (without @), e.g. studyboapp */
    mentionUsername?: string;
    /**
     * ai_only: tag only when AI wrote @handle (uses IG autocomplete).
     * append_if_missing: add @mentionUsername if AI omitted it.
     * always: same as append_if_missing.
     */
    mentionPolicy?: MentionPolicy;
}

export type AiProvider = 'gemini' | 'groq' | 'local';

/** Playwright browser channel. Use `chrome` for Instagram video/reels (H.264 codecs). */
export type BrowserChannel = 'chrome' | 'chromium' | 'msedge';

export interface ViewportConfig {
    width: number;
    height: number;
}

export interface SettingsConfig {
    headless: boolean;
    developerMode: boolean;
    /** Installed Chrome/Edge for media codecs; bundled Chromium cannot play Instagram H.264 video */
    browserChannel: BrowserChannel;
    /** Viewport for Instagram — small heights clip reel comment UI below the fold */
    browserViewport: ViewportConfig;
    /** Which LLM backend to use for comment generation */
    aiProvider: AiProvider;
    googleAiApiKey: string;
    groqApiKey: string;
    groqModel: string;
    groqVisionModel: string;
    /** OpenAI-compatible base URL, e.g. http://localhost:11434/v1 for Ollama */
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

export interface ResolvedAccountSettings {
    skillsFile: string;
    postUrlsFile?: string;
    hashtags: string[];
    hashtagSearch: HashtagSearchConfig;
}

const baseDir = path.join(__dirname, '..');

function resolveFilePath(relativeOrAbsolutePath: string): string {
    return path.isAbsolute(relativeOrAbsolutePath)
        ? relativeOrAbsolutePath
        : path.join(baseDir, relativeOrAbsolutePath);
}

const HASHTAG_PATTERN = /^[a-zA-Z0-9_]+$/;

export function normalizeHashtags(tags: string[] | undefined): string[] {
    if (!tags) return [];

    const normalized: string[] = [];
    for (const raw of tags) {
        const tag = raw.trim().replace(/^#/, '').trim();
        if (!tag) continue;
        if (!HASHTAG_PATTERN.test(tag)) {
            throw new Error(`Invalid hashtag: "${raw}" (use letters, numbers, underscore only).`);
        }
        normalized.push(tag.toLowerCase());
    }

    return normalized;
}

export function normalizeAccount(account: AccountConfig): AccountConfig {
    const loginMethod: LoginMethod = account.loginMethod ?? 'credentials';
    let sourceMode: PostSourceMode = account.sourceMode ?? 'new_post_added_to_account';

    if (!account.sourceMode && account.targets && account.targets.length > 0) {
        sourceMode = 'new_post_added_to_account';
    }

    const usesHashtags = sourceMode === 'hashtag_list' || sourceMode === 'hashtag_api';

    return {
        ...account,
        loginMethod,
        sourceMode,
        password: loginMethod === 'manual' ? account.password ?? '' : account.password,
        hashtags:
            usesHashtags && account.hashtags ? normalizeHashtags(account.hashtags) : account.hashtags,
    };
}

export function resolveAccountSettings(account: AccountConfig): ResolvedAccountSettings {
    const normalized = normalizeAccount(account);
    return {
        skillsFile: normalized.skillsFile ?? '',
        postUrlsFile: normalized.postUrlsFile,
        hashtags: normalized.hashtags ?? [],
        hashtagSearch: {
            ui_search: {
                ...config.settings.hashtagSearch.ui_search,
                ...normalized.hashtagSearch?.ui_search,
            },
            api_search: {
                ...config.settings.hashtagSearch.api_search,
                ...normalized.hashtagSearch?.api_search,
            },
        },
    };
}

export function validateAccounts(accounts: AccountConfig[]): void {
    const errors: string[] = [];

    accounts.forEach((rawAccount, index) => {
        const account = normalizeAccount(rawAccount);
        const label = `@${account.username || `account[${index}]`}`;

        if (!account.username?.trim()) {
            errors.push(`${label}: username is required.`);
            return;
        }

        if (account.loginMethod === 'credentials' && !account.password?.trim()) {
            errors.push(`${label}: password is required when loginMethod is 'credentials'.`);
        }

        if (!account.skillsFile?.trim()) {
            errors.push(`${label}: skillsFile is required (per-account comment style file).`);
        } else {
            const skillsPath = resolveFilePath(account.skillsFile);
            if (!fs.existsSync(skillsPath)) {
                errors.push(`${label}: skills file not found at ${account.skillsFile}.`);
            }
        }

        const resolved = resolveAccountSettings(account);

        switch (account.sourceMode) {
            case 'new_post_added_to_account':
                if (!account.targets || account.targets.length === 0) {
                    errors.push(
                        `${label}: targets must be a non-empty array when sourceMode is 'new_post_added_to_account'.`
                    );
                }
                break;
            case 'url_list': {
                if (!account.postUrlsFile?.trim()) {
                    errors.push(`${label}: postUrlsFile is required when sourceMode is 'url_list'.`);
                    break;
                }
                const urlsPath = resolveFilePath(resolved.postUrlsFile!);
                if (!fs.existsSync(urlsPath)) {
                    errors.push(
                        `${label}: post URLs file not found at ${account.postUrlsFile} (sourceMode: url_list).`
                    );
                }
                break;
            }
            case 'hashtag_list': {
                if (!account.hashtags || account.hashtags.length === 0) {
                    errors.push(
                        `${label}: hashtags must be a non-empty array when sourceMode is 'hashtag_list'.`
                    );
                }
                break;
            }
            case 'hashtag_api': {
                if (!account.hashtags || account.hashtags.length === 0) {
                    errors.push(
                        `${label}: hashtags must be a non-empty array when sourceMode is 'hashtag_api'.`
                    );
                }
                if (!account.instagramApiAccessToken?.trim()) {
                    errors.push(
                        `${label}: instagramApiAccessToken is required when sourceMode is 'hashtag_api'.`
                    );
                }
                if (!account.instagramApiUserId?.trim()) {
                    errors.push(
                        `${label}: instagramApiUserId is required when sourceMode is 'hashtag_api'.`
                    );
                }
                break;
            }
            default:
                errors.push(`${label}: unknown sourceMode '${account.sourceMode}'.`);
        }
    });

    if (errors.length > 0) {
        throw new Error(`Account config validation failed:\n  - ${errors.join('\n  - ')}`);
    }
}

export function validateEnabledAccounts(accounts: AccountConfig[]): void {
    validateAccounts(accounts.filter(acc => acc.enabled));
}

export const config: Config = {
    settings: {
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
    },
    accounts: [
        {
            enabled: true,
            username: 'studyboapp',
            // username: '_reviewbo',
            loginMethod: 'manual',
            password: 'YOUR_PASSWORD_HERE',
            // sourceMode: 'url_list',
            // postUrlsFile: 'data/accounts/studybo.app/urls.txt',
            // postUrlsFile: 'data/accounts/reviewbo.app/urls.txt',
            sourceMode: 'hashtag_list',
            // sourceMode: 'hashtag_api',
            hashtags: [
                'studytracking',
                'studytracker',
                'studygoals',
                'studyroutine',
                'studystreak',
                'dailystudy',
                'smartstudy',
                'focusedstudy',
                'studyjourney',
                'studyprogress',
                'studentproductivity',
                'studydiscipline',
                'examready',
                'examstrategy',
                'studentgrowth',
                'learnbetter',
                'focussession',
                'deepwork',
                'goalachievement',
                'academicsuccess',
                'selfimprovement',
                'studentcommunity'
            ],
            // hashtags:[
            //      'google reviews',
            //      'google business profile',
            //      'google my business',
            //      'restaurant marketing',
            //      'local seo',
            //      'customer reviews',
            //      'customer feedback'            ,
            //      'small business marketing',
            //     'online reputation',
            //       'restaurant owner',
            //       'gym owner',
            //     'salon owner',
            //    'clinic owner',
            //    'hotel owner'    ,
            // ],
            instagramApiAccessToken: 'EAAfZCptW4g1gBRpvyNF4kPGtZBCj88v4CeWCIi1tvZCtEk2opu56ZAaYLkqS3JJX1oFzmKgKAI1YK6eKaWn8Q6ZCgtFL2cdTNV4XH0RHkHPNXZCzZBRiP4ZC2lOWfg0pnhMCDIwH0u7tICTZCxF6Yy3MCCrk0AgADGGbBtSUiQulkVHUMtuPXeFRerc9QNnZBxnX4k54XWaLVeib7ljLN0hUI0NnLSjOZC6aUIlizLn6rRNMZAdY0IUX6iqCrXJwEZC4nrb5yEuG91aqQJXNtIfkYnVvX1AOY',
            instagramApiUserId: '17841473789521517',
            hashtagSearch: {
               api_search: { fetchBatchSize: 5, maxPostsToComment: 5 },
            },
            skillsFile: 'data/accounts/studybo.app/skills.txt',
            mentionUsername: 'studyboapp',
            // mentionUsername: '_reviewbo',
            mentionPolicy: 'append_if_missing',
            aiPromptHint:
                'Sarcastic witty comment anchored to the post topic. Roast the struggle, slip @studyboapp in as the punchline — make scrollers curious enough to check the profile.',
            actionDelaySeconds: { min: 80, max: 160 },
            targets: ['instagram', 'playwright'],
            // sourceMode filters where posts come from — same skillsFile for all modes:
            // url_list:       sourceMode: 'url_list', postUrlsFile: 'data/accounts/studybo.app/urls.txt'
            // hashtag_list:   sourceMode: 'hashtag_list', hashtags: ['studygram', 'productivity']
        },
    ],
};
