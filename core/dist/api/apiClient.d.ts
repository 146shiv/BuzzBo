export interface ApiClientOptions {
    baseUrl: string;
    username?: string;
    password?: string;
}
export interface LoginResponse {
    token: string;
    user: {
        id: string;
        username: string;
        role: string;
    };
}
export interface MeResponse {
    id: string;
    username: string;
    display_name: string | null;
    role: string;
    config_id: string | null;
    is_disabled: boolean;
}
export interface CommentLogEntry {
    postId: string;
    postUrl: string | null;
    commentText: string | null;
    commentedAt: string;
}
export interface GenerateCommentRequest {
    postText: string;
    targetUsername: string;
    promptHint?: string;
    imageUrl?: string;
    videoUrl?: string;
    channelSkillsContext?: string;
    mentionHandle?: string;
    imageData?: {
        data: string;
        mimeType: string;
    };
}
export declare function resolveAdminApiBaseUrl(): string | null;
export declare class AdminApiClient {
    private readonly options;
    private token;
    constructor(options: ApiClientOptions);
    get baseUrl(): string;
    getToken(): string | null;
    setToken(token: string | null): void;
    login(username?: string, password?: string): Promise<LoginResponse>;
    private request;
    getMe(): Promise<MeResponse>;
    getBotConfig(): Promise<{
        settings: unknown;
        accounts: unknown[];
    }>;
    listAccounts(): Promise<unknown[]>;
    getAccount(id: string): Promise<Record<string, unknown>>;
    updateAccount(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>>;
    heartbeat(): Promise<void>;
    checkCommented(accountId: string, platform: number, postId: string): Promise<boolean>;
    recordComment(accountId: string, platform: number, postId: string, options?: {
        postUrl?: string;
        commentText?: string;
    }): Promise<void>;
    listCommentedPostIds(accountId: string): Promise<string[]>;
    listCommentLog(accountId: string, opts?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        entries: CommentLogEntry[];
        total: number;
    }>;
    generateComment(body: GenerateCommentRequest): Promise<{
        comment: string;
    }>;
}
export declare function createApiClientFromEnv(): AdminApiClient | null;
//# sourceMappingURL=apiClient.d.ts.map