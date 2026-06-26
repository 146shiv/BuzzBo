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
        // #region agent log
        fetch('http://127.0.0.1:7812/ingest/bbb13829-4a4f-4b08-be95-693d0e6ccb9d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0ccc5'},body:JSON.stringify({sessionId:'e0ccc5',location:'ipcHandlers.ts:accounts:list',message:'ipc list start',data:{cachedCount:appContext.rawAccounts.length,hasToken:!!appContext.client?.getToken()},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        try {
            appContext.ensureClient();
            if (appContext.rawAccounts.length === 0) await appContext.refreshConfig();
            const rows = appContext.rawAccounts;
            // #region agent log
            fetch('http://127.0.0.1:7812/ingest/bbb13829-4a4f-4b08-be95-693d0e6ccb9d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0ccc5'},body:JSON.stringify({sessionId:'e0ccc5',location:'ipcHandlers.ts:accounts:list',message:'ipc list success',data:{count:rows.length,ids:rows.slice(0,5).map(r=>String(r.id)),usernames:rows.slice(0,5).map(r=>String(r.username))},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
            // #endregion
            return rows;
        } catch (err) {
            // #region agent log
            fetch('http://127.0.0.1:7812/ingest/bbb13829-4a4f-4b08-be95-693d0e6ccb9d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0ccc5'},body:JSON.stringify({sessionId:'e0ccc5',location:'ipcHandlers.ts:accounts:list',message:'ipc list error',data:{error:err instanceof Error?err.message:String(err)},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            throw err;
        }
    },

    async 'accounts:get'(_e: unknown, id: string) {
        // #region agent log
        fetch('http://127.0.0.1:7812/ingest/bbb13829-4a4f-4b08-be95-693d0e6ccb9d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0ccc5'},body:JSON.stringify({sessionId:'e0ccc5',location:'ipcHandlers.ts:accounts:get',message:'ipc handler start',data:{id,hasClient:!!appContext.client,hasToken:!!appContext.client?.getToken()},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        try {
            const client = appContext.ensureClient();
            const account = await client.getAccount(id);
            // #region agent log
            fetch('http://127.0.0.1:7812/ingest/bbb13829-4a4f-4b08-be95-693d0e6ccb9d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0ccc5'},body:JSON.stringify({sessionId:'e0ccc5',location:'ipcHandlers.ts:accounts:get',message:'ipc handler success',data:{id,hasAccount:account!=null},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            return account;
        } catch (err) {
            // #region agent log
            fetch('http://127.0.0.1:7812/ingest/bbb13829-4a4f-4b08-be95-693d0e6ccb9d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0ccc5'},body:JSON.stringify({sessionId:'e0ccc5',location:'ipcHandlers.ts:accounts:get',message:'ipc handler error',data:{id,error:err instanceof Error?err.message:String(err)},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            throw err;
        }
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
        const client = appContext.ensureClient();
        await appContext.refreshConfig();

        let account = appContext.rawAccounts.find(a => String(a.id) === payload.accountId);
        if (!account) {
            account = (await client.getAccount(payload.accountId)) as Record<string, unknown>;
        }
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
