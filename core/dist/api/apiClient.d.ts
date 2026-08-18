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
export interface AssessRelevanceRequest {
    postText: string;
    skillsContext: string;
    authorUsername?: string;
    imageUrl?: string;
    videoUrl?: string;
    imageData?: {
        data: string;
        mimeType: string;
    };
}
export type AccountSessionStatus = 'needs_login' | 'valid' | 'expired' | 'challenged';
export interface AccountSessionStatusRow {
    platform_account_id: string;
    username?: string;
    status: AccountSessionStatus;
    last_synced_at: string | null;
    last_validated_at: string | null;
}
export interface AccountSessionPayload {
    platform_account_id: string;
    status: AccountSessionStatus;
    storageState: Record<string, unknown> | null;
    fingerprint: Record<string, unknown> | null;
    last_synced_at: string | null;
    last_validated_at: string | null;
}
export type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'stopped';
export interface CampaignRecord {
    id: string;
    user_id: string;
    name: string;
    status: CampaignStatus;
    max_concurrency: number;
    created_at: string;
    updated_at: string;
}
export interface CampaignProgress {
    pending: number;
    running: number;
    done: number;
    failed: number;
    cancelled: number;
}
export interface CommentJobRecord {
    id: string;
    campaign_id: string;
    platform_account_id: string;
    platform: number;
    target_type: 'hashtag' | 'url';
    target_value: string;
    post_url: string | null;
    scheduled_at: string;
    status: string;
    attempts: number;
    error: string | null;
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
    assessRelevance(body: AssessRelevanceRequest): Promise<{
        relevant: boolean;
        score: number;
        reason: string;
    }>;
    listSessionStatuses(): Promise<AccountSessionStatusRow[]>;
    getAccountSession(accountId: string): Promise<AccountSessionPayload>;
    putAccountSession(accountId: string, payload: {
        storageState: Record<string, unknown>;
        fingerprint?: Record<string, unknown>;
    }): Promise<{
        platform_account_id: string;
        status: AccountSessionStatus;
    }>;
    patchAccountSessionStatus(accountId: string, status: AccountSessionStatus): Promise<{
        platform_account_id: string;
        status: AccountSessionStatus;
    }>;
    createCampaign(opts?: {
        name?: string;
        maxConcurrency?: number;
    }): Promise<{
        campaign: CampaignRecord;
        progress: CampaignProgress;
        jobsCreated: number;
    }>;
    getCampaign(campaignId: string): Promise<{
        campaign: CampaignRecord;
        progress: CampaignProgress;
    }>;
    listCampaigns(): Promise<{
        campaigns: CampaignRecord[];
    }>;
    pauseCampaign(campaignId: string): Promise<{
        campaign: CampaignRecord;
        progress: CampaignProgress;
    }>;
    resumeCampaign(campaignId: string): Promise<{
        campaign: CampaignRecord;
        progress: CampaignProgress;
    }>;
    stopCampaign(campaignId: string): Promise<{
        campaign: CampaignRecord;
        progress: CampaignProgress;
    }>;
    claimCampaignJobs(campaignId: string, limit?: number): Promise<{
        jobs: CommentJobRecord[];
    }>;
    completeCampaignJob(campaignId: string, payload: {
        jobId: string;
        status: 'done' | 'failed';
        error?: string;
        enqueueFollowUp?: boolean;
    }): Promise<{
        job: CommentJobRecord;
        progress: CampaignProgress;
    }>;
    listCampaignJobs(campaignId: string, opts?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        jobs: CommentJobRecord[];
        total: number;
    }>;
}
export declare function createApiClientFromEnv(): AdminApiClient | null;
//# sourceMappingURL=apiClient.d.ts.map