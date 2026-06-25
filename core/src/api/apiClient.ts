export interface ApiClientOptions {
    baseUrl: string;
    username?: string;
    password?: string;
}

export interface LoginResponse {
    token: string;
    user: { id: string; username: string; role: string };
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
    imageData?: { data: string; mimeType: string };
}

export function resolveAdminApiBaseUrl(): string | null {
    const baseUrl =
        process.env.BUZZBO_ADMIN_API_URL?.trim() ||
        process.env.ADMIN_API_URL?.trim() ||
        'http://localhost:3000';
    return baseUrl ? baseUrl.replace(/\/$/, '') : null;
}

export class AdminApiClient {
    private token: string | null = null;

    constructor(private readonly options: ApiClientOptions) {}

    get baseUrl(): string {
        return this.options.baseUrl.replace(/\/$/, '');
    }

    getToken(): string | null {
        return this.token;
    }

    setToken(token: string | null): void {
        this.token = token;
    }

    async login(username?: string, password?: string): Promise<LoginResponse> {
        const user = username ?? this.options.username;
        const pass = password ?? this.options.password;
        if (!user || !pass) throw new Error('Username and password required');

        const res = await fetch(`${this.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass }),
        });
        const data = (await res.json()) as { error?: string; token?: string };
        if (!res.ok) throw new Error(data.error || 'Login failed');
        this.token = data.token!;
        return data as LoginResponse;
    }

    private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
        if (!this.token) {
            if (this.options.username && this.options.password) {
                await this.login();
            } else {
                throw new Error('Not authenticated');
            }
        }
        const res = await fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.token}`,
                ...init.headers,
            },
        });
        const data = (await res.json()) as T & { error?: string };
        if (!res.ok) throw new Error(data.error || `Request failed: ${path}`);
        return data as T;
    }

    async getMe(): Promise<MeResponse> {
        return this.request<MeResponse>('/api/auth/me');
    }

    async getBotConfig() {
        return this.request<{ settings: unknown; accounts: unknown[] }>('/api/bot/config');
    }

    async listAccounts() {
        return this.request<unknown[]>('/api/bot/accounts');
    }

    async getAccount(id: string) {
        return this.request<Record<string, unknown>>(`/api/bot/accounts/${id}`);
    }

    async updateAccount(id: string, patch: Record<string, unknown>) {
        return this.request<Record<string, unknown>>(`/api/bot/accounts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
        });
    }

    async heartbeat(): Promise<void> {
        await this.request('/api/bot/heartbeat', { method: 'POST', body: '{}' });
    }

    async checkCommented(accountId: string, platform: number, postId: string): Promise<boolean> {
        const params = new URLSearchParams({
            accountId,
            platform: String(platform),
            postId,
        });
        const data = await this.request<{ commented: boolean }>(
            `/api/bot/comments/check?${params}`
        );
        return data.commented;
    }

    async recordComment(
        accountId: string,
        platform: number,
        postId: string,
        options: { postUrl?: string; commentText?: string } = {}
    ): Promise<void> {
        await this.request('/api/bot/comments', {
            method: 'POST',
            body: JSON.stringify({
                accountId,
                platform,
                postId,
                postUrl: options.postUrl,
                commentText: options.commentText,
            }),
        });
    }

    async listCommentedPostIds(accountId: string): Promise<string[]> {
        const params = new URLSearchParams({ accountId });
        const data = await this.request<{ postIds: string[] }>(`/api/bot/comments?${params}`);
        return data.postIds;
    }

    async listCommentLog(
        accountId: string,
        opts: { limit?: number; offset?: number } = {}
    ): Promise<{ entries: CommentLogEntry[]; total: number }> {
        const params = new URLSearchParams({
            accountId,
            limit: String(opts.limit ?? 50),
            offset: String(opts.offset ?? 0),
        });
        return this.request<{ entries: CommentLogEntry[]; total: number; limit: number; offset: number }>(
            `/api/bot/comments?${params}`
        );
    }

    async generateComment(body: GenerateCommentRequest): Promise<{ comment: string }> {
        return this.request<{ comment: string }>('/api/bot/ai/generate-comment', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }
}

export function createApiClientFromEnv(): AdminApiClient | null {
    const baseUrl = resolveAdminApiBaseUrl();
    const username = process.env.BOT_USERNAME;
    const password = process.env.BOT_PASSWORD;
    if (!baseUrl || !username || !password) return null;
    return new AdminApiClient({ baseUrl, username, password });
}
