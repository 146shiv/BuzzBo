import type { AccountConfig, SettingsConfig } from '@buzzbo/core/config';
import type { AICommentGeneratorAdapter } from '@buzzbo/core/ai/genai';
import type { CommentHistoryAdapter } from '@buzzbo/core/comments';
import type { CommentJobRecord } from '@buzzbo/core/api/apiClient';
import {
    fetchRecentMediaBatch,
    mapApiPostsToCandidates,
    rankHashtagCandidates,
    searchHashtagId,
} from '@buzzbo/instagram-bot';
import { initializeBotSession } from './botSession';
import { Platform } from '@buzzbo/core/config';
import { InstagramBot } from '@buzzbo/instagram-bot';
import { resolveAccountSettings } from './resolveAccountSettings';
import { platformAccountToBotConfig } from './platformAccountMapper';
import type { UiLogger } from './uiLogger';
import type { SessionSync } from './sessionSync';
import { browserPool } from './browserPool';

export interface JobExecutorDeps {
    aiGenerator: AICommentGeneratorAdapter;
    commentHistory: CommentHistoryAdapter;
    sessionSync: SessionSync;
    logger: UiLogger;
    settings: SettingsConfig;
    rawAccount: Record<string, unknown>;
    aiPromptHint?: string;
    skillsContent?: string;
}

export async function executeCommentJob(
    job: CommentJobRecord,
    deps: JobExecutorDeps
): Promise<{ success: boolean; postUrl?: string; error?: string; sessionExpired?: boolean }> {
    const account = platformAccountToBotConfig(deps.rawAccount);
    const accountId = String(deps.rawAccount.id);

    if (job.platform !== 1) {
        return { success: false, error: 'Only Instagram jobs are supported' };
    }

    const storageState =
        deps.sessionSync.readLocalStorageState(
            account.platform ?? Platform.Instagram,
            account.username
        ) ?? undefined;
    const session = await initializeBotSession(
        account,
        deps.settings,
        deps.aiGenerator,
        deps.commentHistory,
        deps.logger,
        deps.skillsContent,
        {
            headless: deps.settings.headless,
            storageState,
            releaseBrowserOnClose: false,
        }
    );

    if (!session) {
        return { success: false, error: 'Failed to open browser session', sessionExpired: true };
    }

    try {
        const cfg = (deps.rawAccount.config as Record<string, unknown>) || {};
        const sourceMode = String(cfg.sourceMode || 'hashtag_list');
        const resolved = resolveAccountSettings(account, deps.settings);
        let postUrl = job.post_url || undefined;

        if (job.target_type === 'hashtag' && !postUrl) {
            if (sourceMode === 'hashtag_api') {
                const userId = account.instagramApiUserId?.trim();
                const accessToken = account.instagramApiAccessToken?.trim();
                if (!userId || !accessToken) {
                    return { success: false, error: 'Instagram API credentials required' };
                }
                const credentials = { userId, accessToken };
                const hashtagId = await searchHashtagId(job.target_value, credentials);
                const batch = await fetchRecentMediaBatch(
                    hashtagId,
                    credentials,
                    resolved.hashtagSearch.api_search.fetchBatchSize
                );
                const commented = deps.commentHistory.getCommentedShortcodes(account.username);
                const candidates = mapApiPostsToCandidates(
                    batch.posts,
                    resolved.hashtagSearch.api_search,
                    commented
                );
                const ranked = rankHashtagCandidates(
                    candidates,
                    resolved.hashtagSearch.api_search
                );
                if (ranked.length === 0) {
                    return { success: false, error: `No posts found for #${job.target_value}` };
                }
                postUrl = ranked[0].url;
            } else {
                const commented = deps.commentHistory.getCommentedShortcodes(account.username);
                const igBot = session.bot as InstagramBot;
                const ranked = await igBot.discoverAndRankHashtagPosts(
                    job.target_value,
                    resolved.hashtagSearch.ui_search,
                    commented
                );
                if (ranked.length === 0) {
                    return { success: false, error: `No posts found for #${job.target_value}` };
                }
                postUrl = ranked[0].url;
            }
        }

        if (!postUrl) {
            return { success: false, error: 'No post URL to comment on' };
        }

        if (deps.commentHistory.hasCommented(account.username, extractShortcode(postUrl))) {
            return { success: false, error: 'Already commented on this post' };
        }

        const result = await session.bot.runCommentTaskOnUrl(postUrl, deps.aiPromptHint);
        await browserPool.persistContextState(account, session.context);

        try {
            await deps.sessionSync.uploadFromLocal(
                accountId,
                account.platform ?? Platform.Instagram,
                account.username
            );
        } catch {
            /* local upload optional */
        }

        if (result !== 'SUCCESS') {
            const expired = result.toLowerCase().includes('login');
            if (expired) {
                await deps.sessionSync.markExpired(accountId);
            }
            return {
                success: false,
                postUrl,
                error: result,
                sessionExpired: expired,
            };
        }

        return { success: true, postUrl };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        const expired = msg.toLowerCase().includes('login');
        if (expired) {
            await deps.sessionSync.markExpired(accountId);
        }
        return { success: false, error: msg, sessionExpired: expired };
    } finally {
        await session.close();
    }
}

function extractShortcode(url: string): string {
    const match = url.match(/\/(p|reel|reels)\/([^/?#]+)/i);
    return match?.[2] ?? url;
}
