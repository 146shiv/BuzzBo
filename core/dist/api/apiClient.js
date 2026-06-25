"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminApiClient = void 0;
exports.resolveAdminApiBaseUrl = resolveAdminApiBaseUrl;
exports.createApiClientFromEnv = createApiClientFromEnv;
function resolveAdminApiBaseUrl() {
    const baseUrl = process.env.BUZZBO_ADMIN_API_URL?.trim() ||
        process.env.ADMIN_API_URL?.trim() ||
        'http://localhost:3000';
    return baseUrl ? baseUrl.replace(/\/$/, '') : null;
}
class AdminApiClient {
    constructor(options) {
        this.options = options;
        this.token = null;
    }
    get baseUrl() {
        return this.options.baseUrl.replace(/\/$/, '');
    }
    getToken() {
        return this.token;
    }
    setToken(token) {
        this.token = token;
    }
    async login(username, password) {
        const user = username ?? this.options.username;
        const pass = password ?? this.options.password;
        if (!user || !pass)
            throw new Error('Username and password required');
        const res = await fetch(`${this.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass }),
        });
        const data = (await res.json());
        if (!res.ok)
            throw new Error(data.error || 'Login failed');
        this.token = data.token;
        return data;
    }
    async request(path, init = {}) {
        if (!this.token) {
            if (this.options.username && this.options.password) {
                await this.login();
            }
            else {
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
        const data = (await res.json());
        if (!res.ok)
            throw new Error(data.error || `Request failed: ${path}`);
        return data;
    }
    async getMe() {
        return this.request('/api/auth/me');
    }
    async getBotConfig() {
        return this.request('/api/bot/config');
    }
    async listAccounts() {
        return this.request('/api/bot/accounts');
    }
    async getAccount(id) {
        return this.request(`/api/bot/accounts/${id}`);
    }
    async updateAccount(id, patch) {
        return this.request(`/api/bot/accounts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
        });
    }
    async heartbeat() {
        await this.request('/api/bot/heartbeat', { method: 'POST', body: '{}' });
    }
    async checkCommented(accountId, platform, postId) {
        const params = new URLSearchParams({
            accountId,
            platform: String(platform),
            postId,
        });
        const data = await this.request(`/api/bot/comments/check?${params}`);
        return data.commented;
    }
    async recordComment(accountId, platform, postId, options = {}) {
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
    async listCommentedPostIds(accountId) {
        const params = new URLSearchParams({ accountId });
        const data = await this.request(`/api/bot/comments?${params}`);
        return data.postIds;
    }
    async listCommentLog(accountId, opts = {}) {
        const params = new URLSearchParams({
            accountId,
            limit: String(opts.limit ?? 50),
            offset: String(opts.offset ?? 0),
        });
        return this.request(`/api/bot/comments?${params}`);
    }
    async generateComment(body) {
        return this.request('/api/bot/ai/generate-comment', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }
}
exports.AdminApiClient = AdminApiClient;
function createApiClientFromEnv() {
    const baseUrl = resolveAdminApiBaseUrl();
    const username = process.env.BOT_USERNAME;
    const password = process.env.BOT_PASSWORD;
    if (!baseUrl || !username || !password)
        return null;
    return new AdminApiClient({ baseUrl, username, password });
}
