import type { SettingsConfig } from '@shared/config-types';
export { Platform, PLATFORM_LABELS } from '@shared/config-types';
import type { Platform } from '@shared/config-types';

export type UserRole = 'admin' | 'user';

export interface DbUser {
    id: string;
    username: string;
    password_hash: string;
    display_name: string | null;
    role: UserRole;
    is_disabled: boolean;
    config_id: string | null;
    last_used_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface UserPublic {
    id: string;
    username: string;
    display_name: string | null;
    role: UserRole;
    is_disabled: boolean;
    config_id: string | null;
    config_name?: string | null;
    last_used_at: string | null;
    account_count?: number;
    created_at: string;
    updated_at: string;
}

export interface DbConfiguration {
    id: string;
    name: string;
    settings: SettingsConfig;
    created_at: string;
    updated_at: string;
}

export interface PlatformAccountConfig {
    loginMethod?: 'credentials' | 'manual';
    password?: string;
    sourceMode?: string;
    hashtags?: string[];
    hashtagSearch?: Record<string, unknown>;
    instagramApiAccessToken?: string;
    instagramApiUserId?: string;
    aiPromptHint?: string;
    actionDelaySeconds?: { min: number; max: number };
    targets?: string[];
    mentionUsername?: string;
    mentionPolicy?: string;
}

export interface DbPlatformAccount {
    id: string;
    user_id: string;
    platform: Platform;
    username: string;
    enabled: boolean;
    config: PlatformAccountConfig;
    skills_content: string;
    post_urls: string[];
    created_at: string;
    updated_at: string;
}

export interface DbCommentedPost {
    id: number;
    user_id: string;
    platform_account_id: string;
    platform: Platform;
    post_id: string;
    post_url: string | null;
    comment_text: string | null;
    commented_at: string;
}

export interface DashboardStats {
    totalUsers: number;
    activeUsers: number;
    totalPlatformAccounts: number;
    totalComments: number;
}
