import { shell } from 'electron';
import { Platform } from '@buzzbo/core/config';
import { platformAccountToBotConfig } from './platformAccountMapper';
import { buildRunConfigFromAccount, type RunConfig } from './botRunner';
import { initializeBotSession } from './botSession';
import { UiLogger } from './uiLogger';
import { appContext } from './appContext';

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
        return { ok: true };
    },

    async 'bot:start'(_e: unknown, payload: { accountId: string }) {
        const account = appContext.rawAccounts.find(a => String(a.id) === payload.accountId);
        if (!account) throw new Error('Account not found');
        if (!account.enabled) throw new Error('Account is disabled');
        const platform = Number(account.platform ?? Platform.Instagram);
        if (platform === Platform.YouTube) throw new Error('YouTube bot is not implemented yet');
        if (platform !== Platform.Instagram) throw new Error(`Unsupported platform: ${platform}`);

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

    async 'account:session-status'(_e: unknown, username: string) {
        return appContext.getSessionStatus(username);
    },

    async 'account:login'(_e: unknown, username: string) {
        const account = appContext.rawAccounts.find(a => String(a.username) === username);
        if (!account) return { ok: false, error: 'Account not found' };
        const cfg = platformAccountToBotConfig(account);
        const logger = new UiLogger(username, appContext.botRunner);
        const session = await initializeBotSession(
            { ...cfg, loginMethod: 'manual' },
            appContext.settings,
            appContext.aiGenerator,
            appContext.commentHistory,
            logger,
            String(account.skills_content || ''),
            { headless: false, forceManualLogin: true }
        );
        if (!session) return { ok: false, error: 'Could not open browser session' };
        await session.browser.close();
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
