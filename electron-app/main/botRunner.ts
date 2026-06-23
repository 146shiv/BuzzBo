import { EventEmitter } from 'events';
import type { Browser } from 'playwright';
import type { AccountConfig, SettingsConfig } from '@buzzbo/core/config';
import { AICommentGenerator } from '@buzzbo/core/ai/genai';
import type { CommentHistoryAdapter } from '@buzzbo/core/comments';
import { extractPostShortcode } from '@buzzbo/core/comments';
import { platformAccountToBotConfig } from './platformAccountMapper';
import { initializeBotSession } from './botSession';
import { UiLogger } from './uiLogger';

export interface BotStatus {
    running: boolean;
    mode?: string;
    currentUrl?: string;
    accountUsername?: string;
}

export interface RunConfig {
    accountId: string;
    accountUsername: string;
    sourceMode: string;
    postUrls?: string[];
    skillsContent?: string;
    aiPromptHint?: string;
    settings: SettingsConfig;
    account: AccountConfig;
}

export class BotRunner extends EventEmitter {
    private running = false;
    private stopRequested = false;
    private browser: Browser | null = null;
    private status: BotStatus = { running: false };
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly commentHistory: CommentHistoryAdapter,
        private readonly aiGenerator: AICommentGenerator,
        private readonly onHeartbeat: () => Promise<void>
    ) {
        super();
    }

    getStatus(): BotStatus {
        return { ...this.status };
    }

    async stop(): Promise<void> {
        this.stopRequested = true;
        this.clearHeartbeat();
        if (this.browser) {
            try {
                await this.browser.close();
            } catch {
                /* ignore */
            }
            this.browser = null;
        }
        this.running = false;
        this.status = { running: false };
        this.emit('bot:status', this.getStatus());
    }

    private clearHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private startHeartbeat(): void {
        this.clearHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            void this.onHeartbeat().catch(() => {});
        }, 3 * 60 * 1000);
    }

    private updateStatus(partial: Partial<BotStatus>): void {
        this.status = { ...this.status, running: true, ...partial };
        this.emit('bot:status', this.getStatus());
    }

    private emitComment(
        account: string,
        postUrl: string,
        commentText: string,
        status: string
    ): void {
        const event = {
            account,
            postUrl,
            postId: extractPostShortcode(postUrl),
            commentText,
            commentedAt: new Date().toISOString(),
            status,
        };
        this.emit('bot:comment', event);
    }

    async start(runConfig: RunConfig): Promise<void> {
        if (this.running) throw new Error('Bot is already running');
        this.running = true;
        this.stopRequested = false;
        this.startHeartbeat();
        this.updateStatus({
            mode: runConfig.sourceMode,
            accountUsername: runConfig.accountUsername,
        });

        const logger = new UiLogger(runConfig.accountUsername, this);
        const skills = runConfig.skillsContent?.trim() || runConfig.account.skillsContent;

        try {
            if (runConfig.sourceMode === 'url_list') {
                await this.runUrlList(runConfig, logger, skills);
            } else {
                logger.warn(`Mode ${runConfig.sourceMode} — running url_list fallback for now`);
                await this.runUrlList(runConfig, logger, skills);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`Run failed: ${msg}`);
        } finally {
            this.clearHeartbeat();
            this.running = false;
            this.status = { running: false };
            this.emit('bot:status', this.getStatus());
        }
    }

    async testComment(runConfig: RunConfig, url: string): Promise<string> {
        const logger = new UiLogger(runConfig.accountUsername, this);
        const skills = runConfig.skillsContent?.trim() || runConfig.account.skillsContent;
        const session = await initializeBotSession(
            runConfig.account,
            runConfig.settings,
            this.aiGenerator,
            this.commentHistory,
            logger,
            skills,
            { headless: runConfig.settings.headless }
        );
        if (!session) return 'FAILED';
        this.browser = session.browser;
        try {
            const result = await session.bot.runCommentTaskOnUrl(url, runConfig.aiPromptHint);
            this.emitComment(
                runConfig.accountUsername,
                url,
                result === 'SUCCESS' ? 'Comment posted' : result,
                result.toLowerCase()
            );
            return result;
        } finally {
            await session.browser.close();
            this.browser = null;
        }
    }

    private async runUrlList(
        runConfig: RunConfig,
        logger: UiLogger,
        skills?: string
    ): Promise<void> {
        const postUrls = runConfig.postUrls ?? runConfig.account.postUrls ?? [];
        if (postUrls.length === 0) {
            logger.error('No URLs to process.');
            return;
        }

        const session = await initializeBotSession(
            runConfig.account,
            runConfig.settings,
            this.aiGenerator,
            this.commentHistory,
            logger,
            skills,
            { headless: runConfig.settings.headless }
        );
        if (!session) return;

        const { browser, bot } = session;
        this.browser = browser;

        try {
            for (let i = 0; i < postUrls.length; i++) {
                if (this.stopRequested) break;
                const postUrl = postUrls[i];
                this.updateStatus({
                    mode: 'url_list',
                    currentUrl: postUrl,
                    accountUsername: runConfig.accountUsername,
                });
                logger.header(`URL ${i + 1}/${postUrls.length}: ${postUrl}`);
                const result = await bot.runCommentTaskOnUrl(postUrl, runConfig.aiPromptHint);
                this.emitComment(
                    runConfig.accountUsername,
                    postUrl,
                    result,
                    result === 'SUCCESS' ? 'success' : result.toLowerCase()
                );
                if (i < postUrls.length - 1 && !this.stopRequested) {
                    const delayMs =
                        (runConfig.account.actionDelaySeconds?.min ??
                            runConfig.settings.defaultActionDelaySeconds.min) * 1000;
                    await new Promise(r => setTimeout(r, delayMs));
                }
            }
        } finally {
            await browser.close();
            this.browser = null;
        }
    }
}

export function buildRunConfigFromAccount(
    settings: SettingsConfig,
    rawAccount: Record<string, unknown>
): RunConfig {
    const account = platformAccountToBotConfig(rawAccount);
    const cfg = (rawAccount.config as Record<string, unknown>) || {};
    return {
        accountId: String(rawAccount.id),
        accountUsername: account.username,
        sourceMode: String(cfg.sourceMode || 'url_list'),
        postUrls: (rawAccount.post_urls as string[]) || [],
        skillsContent: String(rawAccount.skills_content || ''),
        aiPromptHint: cfg.aiPromptHint as string | undefined,
        settings,
        account,
    };
}
