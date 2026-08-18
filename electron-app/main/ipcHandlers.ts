import { shell } from 'electron';
import { Platform } from '@buzzbo/core/config';
import { platformAccountToBotConfig } from './platformAccountMapper';
import { buildRunConfigFromAccount, type RunConfig } from './botRunner';
import { initializeBotSession } from './botSession';
import { UiLogger } from './uiLogger';
import { appContext } from './appContext';
import { SessionSync } from './sessionSync';

export function registerIpcHandlers(): typeof handlers {
    return handlers;
}

export const handlers = {
    async 'auth:session'() {
        if (appContext.session) return appContext.session;
        return appContext.restoreSession();
    },

    async 'auth:login'(_e: unknown, payload: { username: string; password: string }) {
        return appContext.login(payload.username, payload.password);
    },

    async 'auth:logout'() {
        appContext.logout();
        return { ok: true };
    },

    async 'accounts:list'() {
        appContext.ensureClient();
        if (appContext.rawAccounts.length === 0) await appContext.refreshConfig();
        return appContext.rawAccounts;
    },

    async 'accounts:get'(_e: unknown, id: string) {
        const client = appContext.ensureClient();
        return client.getAccount(id);
    },

    async 'accounts:update'(_e: unknown, payload: { id: string; patch: Record<string, unknown> }) {
        const client = appContext.ensureClient();
        const updated = await client.updateAccount(payload.id, payload.patch);
        await appContext.refreshConfig();
        return updated;
    },

    async 'config:global'() {
        appContext.ensureClient();
        if (!appContext.settings) await appContext.refreshConfig();
        return appContext.settings;
    },

    async 'comments:list'(_e: unknown, opts: { accountId: string; limit?: number; offset?: number }) {
        const client = appContext.ensureClient();
        return client.listCommentLog(opts.accountId, {
            limit: opts.limit,
            offset: opts.offset,
        });
    },

    async 'bot:status'() {
        return appContext.botRunner.getStatus();
    },

    async 'bot:stop'() {
        await appContext.botRunner.stop();
        await appContext.campaignRunner.stop();
        return { ok: true };
    },

    async 'bot:start'(_e: unknown, payload: { accountId: string }) {
        const client = appContext.ensureClient();
        await appContext.refreshConfig();

        let account = appContext.rawAccounts.find(a => String(a.id) === payload.accountId);
        if (!account) {
            account = (await client.getAccount(payload.accountId)) as Record<string, unknown>;
        }
        if (!account) throw new Error('Account not found');
        if (!account.enabled) throw new Error('Account is disabled');
        const platform = Number(account.platform ?? Platform.Instagram);
        if (platform !== Platform.Instagram && platform !== Platform.YouTube) {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        const cfg = (account.config as Record<string, unknown>) || {};
        const sourceMode = String(cfg.sourceMode || (platform === Platform.YouTube ? 'url_list' : 'hashtag_list'));
        if (platform === Platform.YouTube && sourceMode !== 'url_list') {
            throw new Error('YouTube accounts only support URL List source mode');
        }

        const runConfig = buildRunConfigFromAccount(appContext.settings, account);
        void appContext.botRunner.start(runConfig);
        return { ok: true };
    },

    async 'bot:test-comment'(
        _e: unknown,
        payload: { accountId: string; url: string }
    ) {
        const account = appContext.rawAccounts.find(a => String(a.id) === payload.accountId);
        if (!account) throw new Error('Account not found');
        const runConfig = buildRunConfigFromAccount(appContext.settings, account);
        return appContext.botRunner.testComment(runConfig, payload.url);
    },

    async 'account:session-status'(_e: unknown, payload: { username: string; platform?: number }) {
        const platform = Number(payload.platform ?? Platform.Instagram);
        return appContext.getSessionStatus(platform, payload.username);
    },

    async 'accounts:session-statuses'() {
        return appContext.refreshSessionStatuses();
    },

    async 'account:login'(_e: unknown, username: string) {
        const account = appContext.rawAccounts.find(a => String(a.username) === username);
        if (!account) return { ok: false, error: 'Account not found' };
        return handlers['account:connect'](_e, { accountId: String(account.id) });
    },

    async 'account:connect'(_e: unknown, payload: { accountId: string }) {
        const account = appContext.rawAccounts.find(a => String(a.id) === payload.accountId);
        if (!account) return { ok: false, error: 'Account not found' };
        const username = String(account.username);
        const platform = Number(account.platform ?? Platform.Instagram);
        const cfg = platformAccountToBotConfig(account);
        const logger = new UiLogger(username, appContext.botRunner);
        const session = await initializeBotSession(
            { ...cfg, loginMethod: 'manual' },
            appContext.settings,
            appContext.aiGenerator,
            appContext.commentHistory,
            logger,
            String(account.skills_content || ''),
            { headless: false, forceManualLogin: true, releaseBrowserOnClose: true }
        );
        if (!session) return { ok: false, error: 'Could not open browser session' };
        await session.close();
        try {
            const sync = new SessionSync(appContext.ensureClient());
            await sync.uploadFromLocal(payload.accountId, platform, username);
            await appContext.refreshSessionStatuses();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { ok: false, error: msg };
        }
        return { ok: true };
    },

    async 'campaign:status'() {
        return appContext.campaignRunner.getStatus();
    },

    async 'campaign:start'(_e: unknown, payload: { name?: string; maxConcurrency?: number } = {}) {
        if (appContext.botRunner.getStatus().running) {
            throw new Error('Stop the single-account bot before starting a campaign');
        }
        await appContext.refreshConfig();
        void appContext.campaignRunner.start(payload);
        return { ok: true };
    },

    async 'campaign:stop'() {
        await appContext.campaignRunner.stop();
        return { ok: true };
    },

    async 'shell:open-external'(_e: unknown, url: string) {
        await shell.openExternal(url);
        return { ok: true };
    },
};

export async function invokeIpc(channel: keyof typeof handlers, ...args: unknown[]) {
    const handler = handlers[channel];
    if (!handler) throw new Error(`Unknown IPC channel: ${channel}`);
    return (handler as (...a: unknown[]) => unknown)(null, ...args);
}
