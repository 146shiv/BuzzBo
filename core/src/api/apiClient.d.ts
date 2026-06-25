export interface ApiClientOptions {
    baseUrl: string;
    username: string;
    password: string;
}
export interface LoginResponse {
    token: string;
    user: {
        id: string;
        username: string;
        role: string;
    };
}
export declare class AdminApiClient {
    private readonly options;
    private token;
    constructor(options: ApiClientOptions);
    get baseUrl(): string;
    getToken(): string | null;
    login(): Promise<LoginResponse>;
    private request;
    getBotConfig(): Promise<{
        settings: unknown;
        accounts: unknown[];
    }>;
    heartbeat(): Promise<void>;
    checkCommented(accountId: string, platform: number, postId: string): Promise<boolean>;
    recordComment(accountId: string, platform: number, postId: string): Promise<void>;
    listCommentedPostIds(accountId: string): Promise<string[]>;
}
export declare function createApiClientFromEnv(): AdminApiClient | null;
export declare function parseCliApiArgs(argv: string[]): AdminApiClient | null;
//# sourceMappingURL=apiClient.d.ts.map