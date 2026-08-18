import { EventEmitter } from 'events';
import type { AdminApiClient, CampaignProgress, CampaignRecord } from '@buzzbo/core/api/apiClient';
import type { AICommentGeneratorAdapter } from '@buzzbo/core/ai/genai';
import type { CommentHistoryAdapter } from '@buzzbo/core/comments';
import { RemoteCommentHistoryStore } from '@buzzbo/core/comments';
import { extractPostShortcode } from '@buzzbo/core/comments';
import type { SettingsConfig } from '@buzzbo/core/config';
import { executeCommentJob } from './commentJobExecutor';
import { SessionSync } from './sessionSync';
import { browserPool } from './browserPool';
import { UiLogger } from './uiLogger';
import { buildRunConfigFromAccount } from './botRunner';

export interface CampaignStatus {
    running: boolean;
    campaignId?: string;
    campaign?: CampaignRecord;
    progress?: CampaignProgress;
    currentAccount?: string;
    currentJobId?: string;
}

export class CampaignRunner extends EventEmitter {
    private running = false;
    private stopRequested = false;
    private campaignId: string | null = null;
    private status: CampaignStatus = { running: false };
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private sessionSync: SessionSync | null = null;

    constructor(
        private readonly client: AdminApiClient,
        private readonly commentHistory: CommentHistoryAdapter,
        private readonly aiGenerator: AICommentGeneratorAdapter,
        private readonly getSettings: () => SettingsConfig,
        private readonly getAccounts: () => Record<string, unknown>[],
        private readonly onHeartbeat: () => Promise<void>
    ) {
        super();
    }

    getStatus(): CampaignStatus {
        return { ...this.status };
    }

    private updateStatus(partial: Partial<CampaignStatus>): void {
        this.status = { ...this.status, running: true, ...partial };
        this.emit('campaign:status', this.getStatus());
    }

    private emitLog(account: string | undefined, message: string, level: 'info' | 'warn' | 'error' = 'info') {
        this.emit('bot:log', {
            level,
            message,
            account,
            at: new Date().toISOString(),
        });
    }

    async start(opts: { name?: string; maxConcurrency?: number } = {}): Promise<void> {
        if (this.running) throw new Error('Campaign is already running');

        this.sessionSync = new SessionSync(this.client);
        const accounts = this.getAccounts().filter(
            a => a.enabled && Number(a.platform ?? 1) === 1
        );
        await this.sessionSync.syncAllAccounts(
            accounts.map(a => ({
                id: String(a.id),
                username: String(a.username),
                platform: Number(a.platform ?? 1),
            }))
        );

        const { campaign, progress, jobsCreated } = await this.client.createCampaign(opts);
        this.campaignId = campaign.id;
        this.running = true;
        this.stopRequested = false;

        this.updateStatus({ campaignId: campaign.id, campaign, progress });
        this.emitLog(undefined, `Campaign started with ${jobsCreated} job(s).`, 'info');

        this.pollTimer = setInterval(() => {
            void this.pollOnce().catch(err => {
                const msg = err instanceof Error ? err.message : String(err);
                this.emitLog(undefined, `Campaign poll error: ${msg}`, 'error');
            });
        }, 4000);

        void this.onHeartbeat();
        void this.pollOnce();
    }

    async stop(): Promise<void> {
        this.stopRequested = true;
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        if (this.campaignId) {
            try {
                const result = await this.client.stopCampaign(this.campaignId);
                this.status.progress = result.progress;
                this.status.campaign = result.campaign;
            } catch {
                /* ignore */
            }
        }
        await browserPool.release();
        this.running = false;
        this.campaignId = null;
        this.status = { running: false };
        this.emit('campaign:status', this.getStatus());
        this.emitLog(undefined, 'Campaign stopped.', 'warn');
    }

    private async pollOnce(): Promise<void> {
        if (!this.running || this.stopRequested || !this.campaignId) return;

        const campaignState = await this.client.getCampaign(this.campaignId);
        if (campaignState.campaign.status !== 'running') {
            if (campaignState.campaign.status === 'completed') {
                this.emitLog(undefined, 'Campaign completed.', 'info');
                await this.stop();
            }
            return;
        }

        this.status.progress = campaignState.progress;
        this.status.campaign = campaignState.campaign;
        this.emit('campaign:status', this.getStatus());

        const { jobs } = await this.client.claimCampaignJobs(
            this.campaignId,
            campaignState.campaign.max_concurrency
        );
        if (jobs.length === 0) return;

        for (const job of jobs) {
            if (this.stopRequested) break;

            const rawAccount = this.getAccounts().find(a => String(a.id) === job.platform_account_id);
            if (!rawAccount) {
                await this.client.completeCampaignJob(this.campaignId, {
                    jobId: job.id,
                    status: 'failed',
                    error: 'Account not found',
                });
                continue;
            }

            const username = String(rawAccount.username);
            const runConfig = buildRunConfigFromAccount(this.getSettings(), rawAccount);
            const logger = new UiLogger(username, this);

            this.updateStatus({
                currentAccount: username,
                currentJobId: job.id,
            });

            logger.header(
                `Job ${job.target_type === 'hashtag' ? '#' + job.target_value : job.target_value}`
            );

            if (this.commentHistory instanceof RemoteCommentHistoryStore) {
                await this.commentHistory.preloadAccount(username);
            }

            const result = await executeCommentJob(job, {
                aiGenerator: this.aiGenerator,
                commentHistory: this.commentHistory,
                sessionSync: this.sessionSync!,
                logger,
                settings: runConfig.settings,
                rawAccount,
                aiPromptHint: runConfig.aiPromptHint,
                skillsContent: runConfig.skillsContent,
            });

            if (result.success && result.postUrl) {
                this.emit('bot:comment', {
                    account: username,
                    postUrl: result.postUrl,
                    postId: extractPostShortcode(result.postUrl),
                    commentText: 'Comment posted',
                    commentedAt: new Date().toISOString(),
                    status: 'success',
                });
            }

            const complete = await this.client.completeCampaignJob(this.campaignId, {
                jobId: job.id,
                status: result.success ? 'done' : 'failed',
                error: result.error,
                enqueueFollowUp: result.success,
            });
            this.status.progress = complete.progress;

            if (result.sessionExpired) {
                this.emitLog(username, 'Session expired — reconnect Instagram.', 'warn');
            }
        }

        this.emit('campaign:status', this.getStatus());
    }
}
