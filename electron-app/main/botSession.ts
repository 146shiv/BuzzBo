import type { Browser, BrowserContext } from 'playwright';
import type { AccountConfig, SettingsConfig } from '@buzzbo/core/config';
import { Platform } from '@buzzbo/core/config';
import { InstagramBot } from '@buzzbo/instagram-bot';
import { YouTubeBot } from '@buzzbo/youtube-bot';
import type { AICommentGeneratorAdapter } from '@buzzbo/core/ai/genai';
import type { CommentHistoryAdapter } from '@buzzbo/core/comments';
import type { UiLogger } from './uiLogger';
import { getLogsDir } from './paths';
import { browserPool } from './browserPool';
import { resolveSessionFilePath } from './sessionPaths';
import { getCookiesDir } from './paths';

const pauseState = { shouldPause: false };

export type PlatformBotInstance = InstagramBot | YouTubeBot;

export interface BotSessionHandle {
    browser: Browser;
    context: BrowserContext;
    bot: PlatformBotInstance;
    close: () => Promise<void>;
}

function platformLabel(platform: number): string {
    return platform === Platform.YouTube ? 'YouTube' : 'Instagram';
}

export async function initializeBotSession(
    account: AccountConfig,
    settings: SettingsConfig,
    aiGenerator: AICommentGeneratorAdapter,
    commentHistory: CommentHistoryAdapter,
    logger: UiLogger,
    skillsContent?: string,
    options: {
        headless?: boolean;
        forceManualLogin?: boolean;
        storageState?: Record<string, unknown>;
        releaseBrowserOnClose?: boolean;
    } = {}
): Promise<BotSessionHandle | null> {
    const loginMethod = account.loginMethod ?? 'manual';
    const useManualLogin = options.forceManualLogin ?? loginMethod === 'manual';
    const headless = useManualLogin ? false : (options.headless ?? settings.headless);
    const releaseBrowserOnClose = options.releaseBrowserOnClose ?? false;
    const cookiePath = resolveSessionFilePath(
        getCookiesDir(),
        account.platform ?? Platform.Instagram,
        account.username
    );
    const label = platformLabel(account.platform ?? Platform.Instagram);

    let context: BrowserContext | null = null;
    try {
        context = await browserPool.createAccountContext(account, settings, {
            headless,
            storageState: options.storageState,
        });

        const runtimePaths = {
            cookiePath,
            logsDir: getLogsDir(),
            enableCsvLog: settings.developerMode,
        };
        const coreLogger = logger as unknown as import('@buzzbo/core/logger/logger').Logger;

        const bot: PlatformBotInstance =
            (account.platform ?? Platform.Instagram) === Platform.YouTube
                ? new YouTubeBot(
                      account,
                      settings,
                      pauseState,
                      coreLogger,
                      aiGenerator,
                      commentHistory,
                      skillsContent,
                      runtimePaths
                  )
                : new InstagramBot(
                      account,
                      settings,
                      pauseState,
                      coreLogger,
                      aiGenerator,
                      commentHistory,
                      skillsContent,
                      runtimePaths
                  );

        let loggedIn: boolean;
        if (useManualLogin) {
            loggedIn = await bot.initWithManualLogin(context, async () => {
                logger.info(`Complete ${label} login in the browser window.`);
                const maxWaitMs = 10 * 60 * 1000;
                const started = Date.now();
                while (Date.now() - started < maxWaitMs) {
                    await new Promise<void>(resolve => setTimeout(resolve, 2000));
                }
            });
        } else {
            loggedIn = await bot.init(context);
        }

        if ((account.platform ?? Platform.Instagram) === Platform.YouTube && !loggedIn) {
            throw new Error('YouTube session is not logged in. Use Connect YouTube first.');
        }

        await browserPool.persistContextState(account, context);
        const browser = await browserPool.acquire(settings);

        return {
            browser,
            context,
            bot,
            close: async () => {
                try {
                    await browserPool.persistContextState(account, context!);
                } catch {
                    /* ignore */
                }
                try {
                    await context!.close();
                } catch {
                    /* ignore */
                }
                if (releaseBrowserOnClose) {
                    await browserPool.release();
                }
            },
        };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Bot initialization failed: ${msg}`);
        if (context) {
            try {
                await context.close();
            } catch {
                /* ignore */
            }
        }
        return null;
    }
}
