import { EventEmitter } from 'events';
import type { SettingsConfig } from '@buzzbo/core/config';
import { DEFAULT_SETTINGS } from '@buzzbo/core/config';
import { AdminApiClient, resolveAdminApiBaseUrl } from '@buzzbo/core/api/apiClient';
import { AICommentGenerator } from '@buzzbo/core/ai/genai';
import { RemoteCommentHistoryStore } from '@buzzbo/core/comments';
import { Platform } from '@buzzbo/core/config';
import { loadConfigFromApi } from './configLoader';
import { BotRunner } from './botRunner';
import { clearSession, loadSession, saveSession, type StoredSession } from './session';
import * as fs from 'fs';
import * as path from 'path';
import { getCookiesDir } from './paths';

export class AppContext extends EventEmitter {
    session: StoredSession | null = null;
    client: AdminApiClient | null = null;
    settings: SettingsConfig = DEFAULT_SETTINGS;
    rawAccounts: Record<string, unknown>[] = [];
    commentHistory = new RemoteCommentHistoryStore(new AdminApiClient({ baseUrl: 'http://localhost' }));
    aiGenerator = new AICommentGenerator({ provider: 'gemini', mockComments: true });
    botRunner: BotRunner;

    constructor() {
        super();
        this.botRunner = new BotRunner(
            this.commentHistory,
            this.aiGenerator,
            async () => {
                await this.client?.heartbeat();
            }
        );
        this.forwardBotEvents();
    }

    private forwardBotEvents(): void {
        for (const event of ['bot:status', 'bot:log', 'bot:comment'] as const) {
            this.botRunner.on(event, payload => this.emit(event, payload));
        }
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
            this.botRunner = new BotRunner(
                this.commentHistory,
                this.aiGenerator,
                async () => {
                    await this.client?.heartbeat();
                }
            );
            this.forwardBotEvents();
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
        await this.refreshConfig();
        return session;
    }

    logout(): void {
        clearSession();
        this.session = null;
        this.client?.setToken(null);
        this.rawAccounts = [];
        this.settings = DEFAULT_SETTINGS;
    }

    async refreshConfig(): Promise<void> {
        const client = this.ensureClient();
        const loaded = await loadConfigFromApi(client);
        this.settings = loaded.settings;
        this.rawAccounts = loaded.rawAccounts;
        this.aiGenerator = new AICommentGenerator({
            provider: loaded.settings.aiProvider ?? 'gemini',
            googleAiApiKey: loaded.settings.googleAiApiKey,
            groqApiKey: loaded.settings.groqApiKey,
            groqModel: loaded.settings.groqModel,
            groqVisionModel: loaded.settings.groqVisionModel,
            localLlmBaseUrl: loaded.settings.localLlmBaseUrl,
            localLlmModel: loaded.settings.localLlmModel,
            mockComments: loaded.settings.mockAiComments ?? false,
            maxRequestsPerMinute: loaded.settings.aiMaxRequestsPerMinute,
        });
        this.botRunner = new BotRunner(
            this.commentHistory,
            this.aiGenerator,
            async () => {
                await client.heartbeat();
            }
        );
        this.forwardBotEvents();
        for (const account of this.rawAccounts) {
            this.commentHistory.registerAccount(
                String(account.username),
                String(account.id),
                Number(account.platform ?? Platform.Instagram)
            );
        }
    }

    getSessionStatus(username: string): { hasCookies: boolean } {
        const cookiePath = path.join(getCookiesDir(), `${username}.json`);
        return { hasCookies: fs.existsSync(cookiePath) };
    }
}

export const appContext = new AppContext();
