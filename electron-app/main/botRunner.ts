import { EventEmitter } from 'events';
import type { Browser } from 'playwright';
import type { AccountConfig, SettingsConfig } from '@buzzbo/core/config';
import { AICommentGenerator } from '@buzzbo/core/ai/genai';
import type { CommentHistoryAdapter } from '@buzzbo/core/comments';
import { RemoteCommentHistoryStore, extractPostShortcode } from '@buzzbo/core/comments';
import {
    fetchRecentMediaBatch,
    formatEngagementCounts,
    mapApiPostsToCandidates,
    rankHashtagCandidates,
    searchHashtagId,
} from '@buzzbo/instagram-bot';
import { platformAccountToBotConfig } from './platformAccountMapper';
import { initializeBotSession } from './botSession';
import { resolveAccountSettings } from './resolveAccountSettings';
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
    private delayAbort: (() => void) | null = null;

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
        const wasRunning = this.running;
        const account = this.status.accountUsername;
        this.stopRequested = true;
        this.interruptDelay();
        this.clearHeartbeat();
        if (this.browser) {
            try {
                await this.browser.close();
            } catch {
                /* ignore */
            }
            this.browser = null;
        }
        if (wasRunning) {
            this.emit('bot:log', {
                level: 'warn',
                message: 'Commenting job stopped.',
                account,
                at: new Date().toISOString(),
            });
        }
        this.running = false;
        this.status = { running: false };
        this.emit('bot:status', this.getStatus());
    }

    private interruptibleDelay(ms: number): Promise<void> {
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                this.delayAbort = null;
                resolve();
            }, ms);
            this.delayAbort = () => {
                clearTimeout(timer);
                this.delayAbort = null;
                resolve();
            };
        });
    }

    private interruptDelay(): void {
        this.delayAbort?.();
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
            switch (runConfig.sourceMode) {
                case 'url_list':
                    await this.runUrlList(runConfig, logger, skills);
                    break;
                case 'hashtag_list':
                    await this.runHashtagList(runConfig, logger, skills);
                    break;
                case 'hashtag_api':
                    await this.runHashtagApi(runConfig, logger, skills);
                    break;
                default:
                    logger.error(`Source mode "${runConfig.sourceMode}" is not supported yet.`);
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

    private async preloadCommentHistory(username: string): Promise<void> {
        if (this.commentHistory instanceof RemoteCommentHistoryStore) {
            await this.commentHistory.preloadAccount(username);
        }
    }

    private async runHashtagList(
        runConfig: RunConfig,
        logger: UiLogger,
        skills?: string
    ): Promise<void> {
        const resolved = resolveAccountSettings(runConfig.account, runConfig.settings);
        const hashtags = resolved.hashtags;

        if (hashtags.length === 0) {
            logger.error('No hashtags configured for Hashtag (UI) source mode.');
            return;
        }

        logger.info(
            `Using ${hashtags.length} hashtag(s): ${hashtags.map(tag => `#${tag}`).join(', ')}`
        );

        await this.preloadCommentHistory(runConfig.accountUsername);

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
        const searchConfig = resolved.hashtagSearch.ui_search;
        const commentedShortcodes = this.commentHistory.getCommentedShortcodes(
            runConfig.accountUsername
        );

        try {
            for (let h = 0; h < hashtags.length; h++) {
                if (this.stopRequested) break;

                const hashtag = hashtags[h];
                let postedInHashtag = false;
                logger.header(`Hashtag ${h + 1}/${hashtags.length}: #${hashtag}`);

                let rankedPosts;
                try {
                    rankedPosts = await bot.discoverAndRankHashtagPosts(
                        hashtag,
                        searchConfig,
                        commentedShortcodes
                    );
                } catch (error: unknown) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logger.error(`Failed to discover posts for #${hashtag}: ${msg}`);
                    continue;
                }

                for (let i = 0; i < rankedPosts.length; i++) {
                    if (this.stopRequested) break;

                    const candidate = rankedPosts[i];
                    this.updateStatus({
                        mode: 'hashtag_list',
                        currentUrl: candidate.url,
                        accountUsername: runConfig.accountUsername,
                    });
                    logger.header(
                        `#${hashtag} post ${i + 1}/${rankedPosts.length}: ${candidate.url}`
                    );

                    if (this.commentHistory.hasCommented(runConfig.accountUsername, candidate.shortcode)) {
                        logger.warn(`Already commented on ${candidate.shortcode}. Skipping.`);
                        continue;
                    }

                    const result = await bot.runCommentTaskOnUrl(
                        candidate.url,
                        runConfig.aiPromptHint
                    );
                    this.emitComment(
                        runConfig.accountUsername,
                        candidate.url,
                        result === 'SUCCESS' ? 'Comment posted' : result,
                        result === 'SUCCESS' ? 'success' : result.toLowerCase()
                    );

                    if (result === 'SUCCESS') {
                        commentedShortcodes.add(candidate.shortcode);
                        postedInHashtag = true;
                    }

                    if (result === 'SUCCESS' && i < rankedPosts.length - 1 && !this.stopRequested) {
                        const waitMs = bot.getRandomActionDelayMs();
                        logger.info(`Waiting for ~${Math.round(waitMs / 1000)}s before next post...`);
                        await this.interruptibleDelay(waitMs);
                    }
                }

                if (postedInHashtag && h < hashtags.length - 1 && !this.stopRequested) {
                    const waitMs = bot.getRandomActionDelayMs();
                    logger.info(`Waiting for ~${Math.round(waitMs / 1000)}s before next hashtag...`);
                    await this.interruptibleDelay(waitMs);
                }
            }
        } finally {
            await browser.close();
            this.browser = null;
        }
    }

    private async runHashtagApi(
        runConfig: RunConfig,
        logger: UiLogger,
        skills?: string
    ): Promise<void> {
        const resolved = resolveAccountSettings(runConfig.account, runConfig.settings);
        const hashtags = resolved.hashtags;
        const apiSearchConfig = resolved.hashtagSearch.api_search;

        if (hashtags.length === 0) {
            logger.error('No hashtags configured for Hashtag (API) source mode.');
            return;
        }

        const userId = runConfig.account.instagramApiUserId?.trim();
        const accessToken = runConfig.account.instagramApiAccessToken?.trim();
        if (!userId || !accessToken) {
            logger.error('Instagram API credentials are required for Hashtag (API) source mode.');
            return;
        }

        const credentials = { userId, accessToken };
        logger.info(
            `API hashtag scan for ${hashtags.length} tag(s): ${hashtags.map(tag => `#${tag}`).join(', ')}`
        );

        await this.preloadCommentHistory(runConfig.accountUsername);

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
        const commentedShortcodes = this.commentHistory.getCommentedShortcodes(
            runConfig.accountUsername
        );

        try {
            for (let h = 0; h < hashtags.length; h++) {
                if (this.stopRequested) break;

                const hashtag = hashtags[h];
                let postedInHashtag = false;
                logger.header(`API Hashtag ${h + 1}/${hashtags.length}: #${hashtag}`);

                let hashtagId: string;
                try {
                    hashtagId = await searchHashtagId(hashtag, credentials);
                    logger.info(`Resolved #${hashtag} → hashtag ID ${hashtagId}`);
                } catch (error: unknown) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logger.error(`Failed to resolve hashtag ID for #${hashtag}: ${msg}`);
                    continue;
                }

                let after: string | undefined;
                let batchIndex = 0;

                while (!this.stopRequested) {
                    batchIndex++;
                    let batch;
                    try {
                        batch = await fetchRecentMediaBatch(
                            hashtagId,
                            credentials,
                            apiSearchConfig.fetchBatchSize,
                            after
                        );
                    } catch (error: unknown) {
                        const msg = error instanceof Error ? error.message : String(error);
                        logger.error(`API fetch failed for #${hashtag} batch ${batchIndex}: ${msg}`);
                        break;
                    }

                    if (batch.posts.length === 0) {
                        logger.info(`No more posts for #${hashtag} (batch ${batchIndex}).`);
                        break;
                    }

                    logger.info(
                        `Fetched ${batch.posts.length} post(s) for #${hashtag} (batch ${batchIndex}).`
                    );

                    const candidates = mapApiPostsToCandidates(
                        batch.posts,
                        apiSearchConfig,
                        commentedShortcodes
                    );
                    const rankedPosts = rankHashtagCandidates(candidates, apiSearchConfig);

                    if (rankedPosts.length === 0) {
                        logger.warn(`No qualifying posts in batch ${batchIndex} for #${hashtag}.`);
                    } else {
                        logger.header(`Ranked posts for #${hashtag} (batch ${batchIndex}):`);
                        rankedPosts.forEach((candidate, index) => {
                            logger.info(
                                `${index + 1}. ${candidate.url} | ${formatEngagementCounts(candidate)} | score: ${candidate.engagementScore}`
                            );
                        });
                    }

                    for (let i = 0; i < rankedPosts.length; i++) {
                        if (this.stopRequested) break;

                        const candidate = rankedPosts[i];
                        this.updateStatus({
                            mode: 'hashtag_api',
                            currentUrl: candidate.url,
                            accountUsername: runConfig.accountUsername,
                        });
                        logger.header(
                            `#${hashtag} batch ${batchIndex} post ${i + 1}/${rankedPosts.length}: ${candidate.url}`
                        );

                        if (this.commentHistory.hasCommented(runConfig.accountUsername, candidate.shortcode)) {
                            logger.warn(`Already commented on ${candidate.shortcode}. Skipping.`);
                            continue;
                        }

                        const result = await bot.runCommentTaskOnUrl(
                            candidate.url,
                            runConfig.aiPromptHint
                        );
                        this.emitComment(
                            runConfig.accountUsername,
                            candidate.url,
                            result === 'SUCCESS' ? 'Comment posted' : result,
                            result === 'SUCCESS' ? 'success' : result.toLowerCase()
                        );

                        if (result === 'SUCCESS') {
                            commentedShortcodes.add(candidate.shortcode);
                            postedInHashtag = true;
                        }

                        if (result === 'SUCCESS' && i < rankedPosts.length - 1 && !this.stopRequested) {
                            const waitMs = bot.getRandomActionDelayMs();
                            logger.info(`Waiting for ~${Math.round(waitMs / 1000)}s before next post...`);
                            await this.interruptibleDelay(waitMs);
                        }
                    }

                    if (!batch.nextAfter) {
                        logger.info(`Reached end of #${hashtag} media pages.`);
                        break;
                    }

                    after = batch.nextAfter;
                }

                if (postedInHashtag && h < hashtags.length - 1 && !this.stopRequested) {
                    const waitMs = bot.getRandomActionDelayMs();
                    logger.info(`Waiting for ~${Math.round(waitMs / 1000)}s before next hashtag...`);
                    await this.interruptibleDelay(waitMs);
                }
            }
        } finally {
            await browser.close();
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
                    await this.interruptibleDelay(delayMs);
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
        sourceMode: String(cfg.sourceMode || 'hashtag_list'),
        postUrls: (rawAccount.post_urls as string[]) || [],
        skillsContent: String(rawAccount.skills_content || ''),
        aiPromptHint: cfg.aiPromptHint as string | undefined,
        settings,
        account,
    };
}
