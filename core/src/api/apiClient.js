"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminApiClient = void 0;
exports.createApiClientFromEnv = createApiClientFromEnv;
exports.parseCliApiArgs = parseCliApiArgs;
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
    async login() {
        const res = await fetch(`${this.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: this.options.username,
                password: this.options.password,
            }),
        });
        const data = (await res.json());
        if (!res.ok)
            throw new Error(data.error || 'Login failed');
        this.token = data.token;
        return data;
    }
    async request(path, init = {}) {
        if (!this.token)
            await this.login();
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
    async getBotConfig() {
        return this.request('/api/bot/config');
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
    async recordComment(accountId, platform, postId) {
        await this.request('/api/bot/comments', {
            method: 'POST',
            body: JSON.stringify({ accountId, platform, postId }),
        });
    }
    async listCommentedPostIds(accountId) {
        const params = new URLSearchParams({ accountId });
        const data = await this.request(`/api/bot/comments?${params}`);
        return data.postIds;
    }
}
exports.AdminApiClient = AdminApiClient;
function createApiClientFromEnv() {
    const baseUrl = process.env.ADMIN_API_URL;
    const username = process.env.BOT_USERNAME;
    const password = process.env.BOT_PASSWORD;
    if (!baseUrl || !username || !password)
        return null;
    return new AdminApiClient({ baseUrl, username, password });
}
function parseCliApiArgs(argv) {
    let baseUrl = process.env.ADMIN_API_URL;
    let username = process.env.BOT_USERNAME;
    let password = process.env.BOT_PASSWORD;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--api-url' && argv[i + 1])
            baseUrl = argv[i + 1];
        if (argv[i] === '--bot-user' && argv[i + 1])
            username = argv[i + 1];
        if (argv[i] === '--bot-pass' && argv[i + 1])
            password = argv[i + 1];
    }
    if (!baseUrl || !username || !password)
        return null;
    return new AdminApiClient({ baseUrl, username, password });
}
