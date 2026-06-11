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

export interface HashtagSearchConfig {
    maxPostsToScan: number;
    maxPostsToComment: number;
    minLikes: number;
    minComments: number;
    likeWeight: number;
    commentWeight: number;
    preferTopTab: boolean;
}

export type LoginMethod = 'credentials' | 'manual';

export type PostSourceMode =
    | 'new_post_added_to_account'
    | 'url_list'
    | 'hashtag_list';

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
    /** Per-account hashtags (required for hashtag_list) */
    hashtags?: string[];
    hashtagSearch?: Partial<HashtagSearchConfig>;
    aiPromptHint?: string;
    actionDelaySeconds?: ActionDelayConfig;
    targets?: string[];
}

export interface SettingsConfig {
    headless: boolean;
    developerMode: boolean;
    googleAiApiKey: string;
    mockAiComments: boolean;
    geminiMaxRequestsPerMinute: number;
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

    return {
        ...account,
        loginMethod,
        sourceMode,
        password: loginMethod === 'manual' ? account.password ?? '' : account.password,
        hashtags: account.hashtags ? normalizeHashtags(account.hashtags) : account.hashtags,
    };
}

export function resolveAccountSettings(account: AccountConfig): ResolvedAccountSettings {
    const normalized = normalizeAccount(account);
    return {
        skillsFile: normalized.skillsFile ?? '',
        postUrlsFile: normalized.postUrlsFile,
        hashtags: normalized.hashtags ?? [],
        hashtagSearch: {
            ...config.settings.hashtagSearch,
            ...normalized.hashtagSearch,
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
        googleAiApiKey: 'YOUR_GOOGLE_AI_API_KEY_HERE',
        mockAiComments: false,
        geminiMaxRequestsPerMinute: 15,
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
            maxPostsToScan: 24,
            maxPostsToComment: 3,
            minLikes: 0,
            minComments: 0,
            likeWeight: 1,
            commentWeight: 2,
            preferTopTab: true,
        },
    },
    accounts: [
        {
            enabled: false,
            username: 'studybo.app',
            loginMethod: 'manual',
            password: 'YOUR_PASSWORD_HERE',
            sourceMode: 'hashtag_list',
            hashtags: ['jee'],
            skillsFile: 'data/accounts/studybo.app/skills.txt',
            aiPromptHint: "Respond supportively to the post as a real student—helpful, relatable",
            actionDelaySeconds: { min: 80, max: 160 },
            targets: ['instagram', 'playwright'],
            // sourceMode filters where posts come from — same skillsFile for all modes:
            // url_list:       sourceMode: 'url_list', postUrlsFile: 'data/accounts/studybo.app/urls.txt'
            // hashtag_list:   sourceMode: 'hashtag_list', hashtags: ['studygram', 'productivity']
        },
    ],
};
