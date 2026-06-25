import type {
    DashboardStats,
    DbCommentedPost,
    DbConfiguration,
    DbPlatformAccount,
    DbUser,
    Platform,
    UserPublic,
    UserRole,
} from './types';
import type { SettingsConfig } from '@shared/config-types';
import type { PlatformAccountConfig } from './types';

export interface UserListOptions {
    search?: string;
    sortBy?: 'last_used_at' | 'created_at' | 'username';
    sortDir?: 'asc' | 'desc';
    role?: UserRole;
}

export interface CreateUserInput {
    username: string;
    password: string;
    display_name?: string;
    role?: UserRole;
    config_id?: string | null;
}

export interface UpdateUserInput {
    username?: string;
    password?: string;
    display_name?: string | null;
    role?: UserRole;
    is_disabled?: boolean;
    config_id?: string | null;
}

export interface CreateConfigurationInput {
    name: string;
    settings: SettingsConfig;
}

export interface UpdateConfigurationInput {
    name?: string;
    settings?: SettingsConfig;
}

export interface CreatePlatformAccountInput {
    user_id: string;
    platform: Platform;
    username: string;
    enabled?: boolean;
    config?: PlatformAccountConfig;
    skills_content?: string;
    post_urls?: string[];
}

export interface UpdatePlatformAccountInput {
    platform?: Platform;
    username?: string;
    enabled?: boolean;
    config?: PlatformAccountConfig;
    skills_content?: string;
    post_urls?: string[];
}

export interface UserRepository {
    findById(id: string): Promise<DbUser | null>;
    findByUsername(username: string): Promise<DbUser | null>;
    list(opts?: UserListOptions): Promise<UserPublic[]>;
    create(input: CreateUserInput): Promise<DbUser>;
    update(id: string, input: UpdateUserInput): Promise<DbUser>;
    delete(id: string): Promise<void>;
    touchLastUsed(id: string): Promise<void>;
    countByRole(role?: UserRole): Promise<number>;
}

export interface ConfigurationRepository {
    findById(id: string): Promise<DbConfiguration | null>;
    list(): Promise<DbConfiguration[]>;
    create(input: CreateConfigurationInput): Promise<DbConfiguration>;
    update(id: string, input: UpdateConfigurationInput): Promise<DbConfiguration>;
    delete(id: string): Promise<void>;
}

export interface PlatformAccountRepository {
    findById(id: string): Promise<DbPlatformAccount | null>;
    listByUserId(userId: string): Promise<DbPlatformAccount[]>;
    create(input: CreatePlatformAccountInput): Promise<DbPlatformAccount>;
    update(id: string, input: UpdatePlatformAccountInput): Promise<DbPlatformAccount>;
    delete(id: string): Promise<void>;
    countAll(): Promise<number>;
}

export interface CommentHistoryRepository {
    hasCommented(accountId: string, platform: Platform, postId: string): Promise<boolean>;
    recordComment(
        userId: string,
        accountId: string,
        platform: Platform,
        postId: string,
        options?: { postUrl?: string; commentText?: string }
    ): Promise<void>;
    listByAccount(accountId: string): Promise<DbCommentedPost[]>;
    listByAccountPaginated(
        accountId: string,
        limit: number,
        offset: number
    ): Promise<{ entries: DbCommentedPost[]; total: number }>;
    countAll(): Promise<number>;
}

export interface Repositories {
    users: UserRepository;
    configurations: ConfigurationRepository;
    platformAccounts: PlatformAccountRepository;
    comments: CommentHistoryRepository;
    getStats(): Promise<DashboardStats>;
}
