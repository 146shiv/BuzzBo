import './loadEnv';
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { appContext } from './appContext';
import { handlers } from './ipcHandlers';
import { runElectronTestMode } from './testHarness';

const isTestMode = process.env.ELECTRON_TEST_MODE === '1';

function createWindow(): BrowserWindow {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Buzzbo',
        show: !isTestMode,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (process.env.ELECTRON_RENDERER_URL) {
        win.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        win.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return win;
}

function registerIpc(): void {
    for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.handle(channel, handler as Parameters<typeof ipcMain.handle>[1]);
    }

    for (const event of ['bot:status', 'bot:log', 'bot:comment'] as const) {
        appContext.on(event, payload => {
            for (const win of BrowserWindow.getAllWindows()) {
                win.webContents.send(event, payload);
            }
        });
    }
}

app.whenReady().then(async () => {
    registerIpc();

    if (isTestMode) {
        await runElectronTestMode();
        app.quit();
        return;
    }

    await appContext.restoreSession();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
