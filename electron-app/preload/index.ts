import { contextBridge, ipcRenderer } from 'electron';

const buzzbo = {
    auth: {
        session: () => ipcRenderer.invoke('auth:session'),
        login: (username: string, password: string) =>
            ipcRenderer.invoke('auth:login', { username, password }),
        logout: () => ipcRenderer.invoke('auth:logout'),
    },
    accounts: {
        list: () => ipcRenderer.invoke('accounts:list'),
        get: (id: string) => ipcRenderer.invoke('accounts:get', id),
        update: (id: string, patch: Record<string, unknown>) =>
            ipcRenderer.invoke('accounts:update', { id, patch }),
    },
    config: {
        global: () => ipcRenderer.invoke('config:global'),
    },
    comments: {
        list: (opts: { accountId: string; limit?: number; offset?: number }) =>
            ipcRenderer.invoke('comments:list', opts),
    },
    bot: {
        start: (accountId: string) => ipcRenderer.invoke('bot:start', { accountId }),
        stop: () => ipcRenderer.invoke('bot:stop'),
        status: () => ipcRenderer.invoke('bot:status'),
        testComment: (accountId: string, url: string) =>
            ipcRenderer.invoke('bot:test-comment', { accountId, url }),
        onStatus: (cb: (status: unknown) => void) => {
            const listener = (_: unknown, data: unknown) => cb(data);
            ipcRenderer.on('bot:status', listener);
            return () => ipcRenderer.removeListener('bot:status', listener);
        },
        onLog: (cb: (entry: unknown) => void) => {
            const listener = (_: unknown, data: unknown) => cb(data);
            ipcRenderer.on('bot:log', listener);
            return () => ipcRenderer.removeListener('bot:log', listener);
        },
        onComment: (cb: (entry: unknown) => void) => {
            const listener = (_: unknown, data: unknown) => cb(data);
            ipcRenderer.on('bot:comment', listener);
            return () => ipcRenderer.removeListener('bot:comment', listener);
        },
    },
    account: {
        sessionStatus: (username: string) => ipcRenderer.invoke('account:session-status', username),
        login: (username: string) => ipcRenderer.invoke('account:login', username),
    },
    shell: {
        openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    },
};

contextBridge.exposeInMainWorld('buzzbo', buzzbo);

export type BuzzboApi = typeof buzzbo;
