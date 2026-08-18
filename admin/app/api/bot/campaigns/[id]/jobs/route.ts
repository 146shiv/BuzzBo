import { NextResponse } from 'next/server';
import { requireAuth, forbidden, notFound, badRequest } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { buildFollowUpJob } from '@/lib/campaignService';
import { DEFAULT_SETTINGS } from '@shared/config-types';
import type { SettingsConfig } from '@shared/config-types';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;
    const { id } = await params;

    const campaign = await getRepositories().campaigns.findById(id);
    if (!campaign) return notFound();
    if (campaign.user_id !== session.sub) return forbidden();

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') || '50');
    const offset = Number(url.searchParams.get('offset') || '0');

    try {
        const result = await getRepositories().commentJobs.listByCampaign(id, { limit, offset });
        return NextResponse.json(result);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to list jobs';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/** Claim due jobs for Electron worker polling */
export async function POST(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;
    const { id } = await params;

    const repos = getRepositories();
    const campaign = await repos.campaigns.findById(id);
    if (!campaign) return notFound();
    if (campaign.user_id !== session.sub) return forbidden();
    if (campaign.status !== 'running') {
        return badRequest('Campaign is not running');
    }

    const body = await request.json().catch(() => ({}));
    const limit = typeof body.limit === 'number' ? body.limit : campaign.max_concurrency;

    try {
        const jobs = await repos.commentJobs.claimDueJobs(id, limit);
        return NextResponse.json({ jobs });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to claim jobs';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/** Complete a job and optionally enqueue follow-up */
export async function PATCH(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;
    const { id: campaignId } = await params;

    const repos = getRepositories();
    const campaign = await repos.campaigns.findById(campaignId);
    if (!campaign) return notFound();
    if (campaign.user_id !== session.sub) return forbidden();

    try {
        const body = await request.json();
        const jobId = body.jobId as string;
        const status = body.status as 'done' | 'failed';
        const error = body.error as string | undefined;
        const enqueueFollowUp = Boolean(body.enqueueFollowUp);

        if (!jobId || !status) return badRequest('jobId and status are required');

        const job = await repos.commentJobs.updateJob(jobId, {
            status,
            error: error ?? null,
        });

        if (enqueueFollowUp && status === 'done') {
            const account = await repos.platformAccounts.findById(job.platform_account_id);
            const user = await repos.users.findById(session.sub);
            let settings: SettingsConfig = { ...DEFAULT_SETTINGS };
            if (user?.config_id) {
                const cfg = await repos.configurations.findById(user.config_id);
                if (cfg) settings = cfg.settings;
            }
            if (account) {
                const followUp = buildFollowUpJob(
                    campaignId,
                    account,
                    settings,
                    job.target_value,
                    job.target_type
                );
                if (followUp) {
                    await repos.commentJobs.createMany([followUp]);
                }
            }
        }

        const progress = await repos.campaigns.getProgress(campaignId);
        const pending = progress.pending + progress.running;
        if (pending === 0 && campaign.status === 'running') {
            await repos.campaigns.updateStatus(campaignId, 'completed');
        }

        return NextResponse.json({ job, progress });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to update job';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
