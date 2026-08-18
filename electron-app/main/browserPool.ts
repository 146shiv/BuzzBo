import { chromium, type Browser, type BrowserContext, type BrowserContextOptions } from 'playwright';
import type { AccountConfig, SettingsConfig } from '@buzzbo/core/config';
import { generateFingerprint } from '@buzzbo/instagram-bot';
import * as fs from 'fs';
import * as path from 'path';
import { getCookiesDir, getFingerprintsDir } from './paths';
import { resolveSessionFilePath } from './sessionPaths';
import { Platform } from '@buzzbo/core/config';

function accountPlatform(account: AccountConfig): number {
    return account.platform ?? Platform.Instagram;
}

export class BrowserPool {
    private browser: Browser | null = null;

    async acquire(settings: SettingsConfig): Promise<Browser> {
        if (this.browser?.isConnected()) return this.browser;

        const browserChannel = settings.browserChannel ?? 'chrome';
        const browserViewport = settings.browserViewport ?? { width: 1440, height: 900 };
        const launchOptions: Parameters<typeof chromium.launch>[0] = {
            headless: settings.headless,
            args: [
                '--autoplay-policy=no-user-gesture-required',
                `--window-size=${browserViewport.width},${browserViewport.height}`,
            ],
        };
        if (browserChannel !== 'chromium') {
            launchOptions.channel = browserChannel;
        }

        this.browser = await chromium.launch(launchOptions);
        return this.browser;
    }

    async release(): Promise<void> {
        if (!this.browser) return;
        try {
            await this.browser.close();
        } catch {
            /* ignore */
        }
        this.browser = null;
    }

    resolveFingerprint(account: AccountConfig): Record<string, unknown> {
        const fingerprintPath = resolveSessionFilePath(
            getFingerprintsDir(),
            accountPlatform(account),
            account.username
        );
        if (fs.existsSync(fingerprintPath)) {
            return JSON.parse(fs.readFileSync(fingerprintPath, 'utf-8'));
        }
        const fingerprint = generateFingerprint();
        fs.mkdirSync(getFingerprintsDir(), { recursive: true });
        fs.writeFileSync(fingerprintPath, JSON.stringify(fingerprint, null, 2));
        return fingerprint as unknown as Record<string, unknown>;
    }

    async createAccountContext(
        account: AccountConfig,
        settings: SettingsConfig,
        options: {
            headless?: boolean;
            storageState?: string | Record<string, unknown>;
        } = {}
    ): Promise<BrowserContext> {
        const browser = await this.acquire({
            ...settings,
            headless: options.headless ?? settings.headless,
        });

        const fingerprint = this.resolveFingerprint(account);
        const browserViewport = settings.browserViewport ?? { width: 1440, height: 900 };
        const cookiePath = resolveSessionFilePath(getCookiesDir(), accountPlatform(account), account.username);

        let storageState: string | Record<string, unknown> | undefined = options.storageState;
        if (!storageState && fs.existsSync(cookiePath)) {
            storageState = cookiePath;
        }

        const context = await browser.newContext({
            storageState: storageState as BrowserContextOptions['storageState'],
            userAgent: fingerprint.userAgent as string,
            viewport: browserViewport,
            locale: fingerprint.locale as string,
            timezoneId: fingerprint.timezoneId as string,
            colorScheme: fingerprint.colorScheme as 'light' | 'dark',
            reducedMotion: fingerprint.reducedMotion as 'no-preference' | 'reduce',
        });

        return context;
    }

    async persistContextState(account: AccountConfig, context: BrowserContext): Promise<void> {
        const cookiePath = resolveSessionFilePath(getCookiesDir(), accountPlatform(account), account.username);
        fs.mkdirSync(getCookiesDir(), { recursive: true });
        await context.storageState({ path: cookiePath });
    }
}

export const browserPool = new BrowserPool();
