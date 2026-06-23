import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser } from 'playwright';
import type { AccountConfig, SettingsConfig } from '@buzzbo/core/config';
import { InstagramBot } from '@buzzbo/instagram-bot';
import { generateFingerprint } from '@buzzbo/instagram-bot';
import { AICommentGenerator } from '@buzzbo/core/ai/genai';
import type { CommentHistoryAdapter } from '@buzzbo/core/comments';
import type { UiLogger } from './uiLogger';
import { getCookiesDir, getFingerprintsDir } from './paths';

const pauseState = { shouldPause: false };

export async function initializeBotSession(
    account: AccountConfig,
    settings: SettingsConfig,
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryAdapter,
    logger: UiLogger,
    skillsContent?: string,
    options: { headless?: boolean; forceManualLogin?: boolean } = {}
): Promise<{ browser: Browser; bot: InstagramBot } | null> {
    const cookiePath = path.join(getCookiesDir(), `${account.username}.json`);
    const fingerprintPath = path.join(getFingerprintsDir(), `${account.username}.json`);

    let fingerprint;
    if (fs.existsSync(fingerprintPath)) {
        fingerprint = JSON.parse(fs.readFileSync(fingerprintPath, 'utf-8'));
    } else {
        fingerprint = generateFingerprint();
        fs.writeFileSync(fingerprintPath, JSON.stringify(fingerprint, null, 2));
    }

    const headless = options.headless ?? settings.headless;
    const useManualLogin = options.forceManualLogin ?? account.loginMethod === 'manual';
    const browserChannel = settings.browserChannel ?? 'chrome';
    const browserViewport = settings.browserViewport ?? { width: 1440, height: 900 };

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
        headless,
        args: [
            '--autoplay-policy=no-user-gesture-required',
            `--window-size=${browserViewport.width},${browserViewport.height}`,
        ],
    };
    if (browserChannel !== 'chromium') {
        launchOptions.channel = browserChannel;
    }

    const browser = await chromium.launch(launchOptions);
    try {
        const context = await browser.newContext({
            storageState: fs.existsSync(cookiePath) ? cookiePath : undefined,
            userAgent: fingerprint.userAgent,
            viewport: browserViewport,
            locale: fingerprint.locale,
            timezoneId: fingerprint.timezoneId,
            colorScheme: fingerprint.colorScheme,
            reducedMotion: fingerprint.reducedMotion,
        });

        const bot = new InstagramBot(
            account,
            settings,
            pauseState,
            logger as unknown as import('@buzzbo/core/logger/logger').Logger,
            aiGenerator,
            commentHistory,
            skillsContent
        );

        if (useManualLogin) {
            await bot.initWithManualLogin(context, async () => {
                logger.info('Complete Instagram login in the browser, then continue in Buzzbo.');
                await new Promise<void>(resolve => setTimeout(resolve, 15000));
            });
        } else {
            await bot.init(context);
        }

        await context.storageState({ path: cookiePath });
        return { browser, bot };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Bot initialization failed: ${msg}`);
        await browser.close();
        return null;
    }
}
