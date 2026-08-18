import type { DbPlatformAccount, Platform } from '@/lib/db/types';
import type { SettingsConfig } from '@shared/config-types';
import type { CreateCommentJobInput } from '@/lib/db/repository';

function randomDelaySeconds(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function getActionDelay(account: DbPlatformAccount, settings: SettingsConfig): { min: number; max: number } {
    const cfg = account.config || {};
    return cfg.actionDelaySeconds ?? settings.defaultActionDelaySeconds;
}

export function buildInitialJobsForCampaign(
    campaignId: string,
    accounts: DbPlatformAccount[],
    settings: SettingsConfig,
    startAt: Date = new Date()
): CreateCommentJobInput[] {
    const jobs: CreateCommentJobInput[] = [];
    let staggerOffset = 0;

    const enabled = accounts.filter(a => a.enabled && a.platform === 1);

    for (const account of enabled) {
        const delay = getActionDelay(account, settings);
        const scheduledAt = new Date(startAt.getTime() + staggerOffset * 1000);
        staggerOffset += randomDelaySeconds(delay.min, delay.max);

        const cfg = account.config || {};
        const sourceMode = cfg.sourceMode || 'hashtag_list';
        const hashtags = cfg.hashtags || [];
        const postUrls = account.post_urls || [];

        if (sourceMode === 'url_list' && postUrls.length > 0) {
            const url = postUrls[0];
            jobs.push({
                campaign_id: campaignId,
                platform_account_id: account.id,
                platform: account.platform as Platform,
                target_type: 'url',
                target_value: url,
                post_url: url,
                scheduled_at: scheduledAt.toISOString(),
            });
        } else if (
            (sourceMode === 'hashtag_list' || sourceMode === 'hashtag_api') &&
            hashtags.length > 0
        ) {
            jobs.push({
                campaign_id: campaignId,
                platform_account_id: account.id,
                platform: account.platform as Platform,
                target_type: 'hashtag',
                target_value: hashtags[0],
                post_url: null,
                scheduled_at: scheduledAt.toISOString(),
            });
        }
    }

    return jobs;
}

export function buildFollowUpJob(
    campaignId: string,
    account: DbPlatformAccount,
    settings: SettingsConfig,
    completedTarget: string,
    targetType: 'hashtag' | 'url'
): CreateCommentJobInput | null {
    const cfg = account.config || {};
    const sourceMode = cfg.sourceMode || 'hashtag_list';
    const delay = getActionDelay(account, settings);
    const scheduledAt = new Date(
        Date.now() + randomDelaySeconds(delay.min, delay.max) * 1000
    ).toISOString();

    if (targetType === 'url' || sourceMode === 'url_list') {
        const postUrls = account.post_urls || [];
        const idx = postUrls.indexOf(completedTarget);
        const nextUrl = idx >= 0 ? postUrls[idx + 1] : undefined;
        if (!nextUrl) return null;
        return {
            campaign_id: campaignId,
            platform_account_id: account.id,
            platform: account.platform as Platform,
            target_type: 'url',
            target_value: nextUrl,
            post_url: nextUrl,
            scheduled_at: scheduledAt,
        };
    }

    const hashtags = cfg.hashtags || [];
    const idx = hashtags.indexOf(completedTarget.replace(/^#/, ''));
    const nextTag = idx >= 0 ? hashtags[idx + 1] : hashtags[0];
    if (!nextTag) return null;

    return {
        campaign_id: campaignId,
        platform_account_id: account.id,
        platform: account.platform as Platform,
        target_type: 'hashtag',
        target_value: nextTag,
        post_url: null,
        scheduled_at: scheduledAt,
    };
}
