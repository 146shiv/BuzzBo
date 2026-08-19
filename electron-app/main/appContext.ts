import { EventEmitter } from 'events';
import type { SettingsConfig } from '@buzzbo/core/config';
import { DEFAULT_SETTINGS } from '@buzzbo/core/config';
import { AdminApiClient, resolveAdminApiBaseUrl } from '@buzzbo/core/api/apiClient';
import type { AccountSessionStatusRow } from '@buzzbo/core/api/apiClient';
import type { AICommentGeneratorAdapter } from '@buzzbo/core/ai/genai';
import { RemoteAICommentGenerator } from '@buzzbo/core/ai/remoteAiCommentGenerator';
import { RemoteCommentHistoryStore } from '@buzzbo/core/comments';
import { Platform } from '@buzzbo/core/config';
import { loadConfigFromApi } from './configLoader';
import { BotRunner } from './botRunner';
import { CampaignRunner } from './campaignRunner';
import { SessionSync } from './sessionSync';
import { clearSession, loadSession, saveSession, type StoredSession } from './session';
import { resolveSessionFilePath } from './sessionPaths';
import * as fs from 'fs';
import { getCookiesDir } from './paths';

export class AppContext extends EventEmitter {
    session: StoredSession | null = null;
    client: AdminApiClient | null = null;
    settings: SettingsConfig = DEFAULT_SETTINGS;
    rawAccounts: Record<string, unknown>[] = [];
    sessionStatuses: AccountSessionStatusRow[] = [];
    commentHistory = new RemoteCommentHistoryStore(new AdminApiClient({ baseUrl: 'http://localhost' }));
    aiGenerator: AICommentGeneratorAdapter = new RemoteAICommentGenerator(
        new AdminApiClient({ baseUrl: 'http://localhost' }),
        { aiProvider: 'gemini' }
    );
    botRunner: BotRunner;
    campaignRunner: CampaignRunner;

    constructor() {
        super();
        this.botRunner = this.createBotRunner();
        this.campaignRunner = this.createCampaignRunner();
        this.forwardRunnerEvents();
    }

    private createBotRunner(): BotRunner {
        return new BotRunner(
            this.commentHistory,
            this.aiGenerator,
            async () => {
                await this.client?.heartbeat();
            }
        );
    }

    private createCampaignRunner(): CampaignRunner {
        return new CampaignRunner(
            this.ensureClient(),
            this.commentHistory,
            this.aiGenerator,
            () => this.settings,
            () => this.rawAccounts,
            async () => {
                await this.client?.heartbeat();
            }
        );
    }

    private forwardRunnerEvents(): void {
        for (const event of ['bot:status', 'bot:log', 'bot:comment'] as const) {
            this.botRunner.on(event, payload => this.emit(event, payload));
            this.campaignRunner.on(event, payload => this.emit(event, payload));
        }
        this.campaignRunner.on('campaign:status', payload => this.emit('campaign:status', payload));
    }

    getApiBaseUrl(): string {
        const base = resolveAdminApiBaseUrl();
        if (!base) {
            throw new Error(
                'BUZZBO_ADMIN_API_URL is not configured. Set it in the repo .env file (see .env.example).'
            );
        }
        return base;
    }

    ensureClient(): AdminApiClient {
        if (!this.client) {
            this.client = new AdminApiClient({ baseUrl: this.getApiBaseUrl() });
            this.commentHistory = new RemoteCommentHistoryStore(this.client);
            this.aiGenerator = new RemoteAICommentGenerator(this.client, {
                aiProvider: this.settings.aiProvider ?? 'gemini',
            });
            this.botRunner = this.createBotRunner();
            this.campaignRunner = this.createCampaignRunner();
            this.forwardRunnerEvents();
        }
        return this.client;
    }

    async restoreSession(): Promise<StoredSession | null> {
        const stored = loadSession();
        if (!stored?.token) return null;
        const client = this.ensureClient();
        client.setToken(stored.token);
        try {
            await client.getMe();
            this.session = stored;
            await this.refreshConfig();
            return stored;
        } catch {
            clearSession();
            client.setToken(null);
            this.session = null;
            return null;
        }
    }

    async login(username: string, password: string): Promise<StoredSession> {
        const client = this.ensureClient();
        const result = await client.login(username, password);
        const session: StoredSession = {
            token: result.token,
            username: result.user.username,
            userId: result.user.id,
        };
        saveSession(session);
        this.session = session;
        try {
            await this.refreshConfig();
        } catch (err) {
            clearSession();
            this.session = null;
            client.setToken(null);
            const detail = err instanceof Error ? err.message : 'Failed to load config';
            throw new Error(
                `Signed in but could not load your bot config from the admin API (${detail}). ` +
                    'Check Vercel env (SUPABASE_*, ENCRYPTION_KEY) and that this user has a configuration assigned.'
            );
        }
        return session;
    }

    logout(): void {
        clearSession();
        this.session = null;
        this.client?.setToken(null);
        this.rawAccounts = [];
        this.sessionStatuses = [];
        this.settings = DEFAULT_SETTINGS;
    }

    async refreshConfig(): Promise<void> {
        const client = this.ensureClient();
        const loaded = await loadConfigFromApi(client);
        this.settings = loaded.settings;
        this.rawAccounts = loaded.rawAccounts;
        this.aiGenerator = new RemoteAICommentGenerator(client, {
            aiProvider: loaded.settings.aiProvider ?? 'gemini',
        });
        this.botRunner = this.createBotRunner();
        this.campaignRunner = this.createCampaignRunner();
        this.forwardRunnerEvents();
        for (const account of this.rawAccounts) {
            this.commentHistory.registerAccount(
                String(account.username),
                String(account.id),
                Number(account.platform ?? Platform.Instagram)
            );
        }
        await this.refreshSessionStatuses();
        const sync = new SessionSync(client);
        await sync.syncAllAccounts(
            this.rawAccounts.map(a => ({
                id: String(a.id),
                username: String(a.username),
                platform: Number(a.platform ?? Platform.Instagram),
            }))
        );
    }

    async refreshSessionStatuses(): Promise<AccountSessionStatusRow[]> {
        const client = this.ensureClient();
        try {
            this.sessionStatuses = await client.listSessionStatuses();
        } catch {
            this.sessionStatuses = this.rawAccounts.map(a => ({
                platform_account_id: String(a.id),
                username: String(a.username),
                status: this.getSessionStatus(
                    Number(a.platform ?? Platform.Instagram),
                    String(a.username)
                ).hasCookies
                    ? 'valid'
                    : 'needs_login',
                last_synced_at: null,
                last_validated_at: null,
            }));
        }
        return this.sessionStatuses;
    }

    getSessionStatus(platform: number, username: string): { hasCookies: boolean } {
        const cookiePath = resolveSessionFilePath(getCookiesDir(), platform, username);
        return { hasCookies: fs.existsSync(cookiePath) };
    }

    getSessionStatusForAccount(accountId: string): AccountSessionStatusRow | undefined {
        return this.sessionStatuses.find(s => s.platform_account_id === accountId);
    }
}

export const appContext = new AppContext();
