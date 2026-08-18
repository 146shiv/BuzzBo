import { NextResponse } from 'next/server';
import { requireAuth, badRequest } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { buildInitialJobsForCampaign } from '@/lib/campaignService';
import { DEFAULT_SETTINGS } from '@shared/config-types';
import type { SettingsConfig } from '@shared/config-types';

export async function POST(request: Request) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    try {
        const body = await request.json().catch(() => ({}));
        const name = typeof body.name === 'string' ? body.name : 'Campaign';
        const maxConcurrency =
            typeof body.maxConcurrency === 'number' ? body.maxConcurrency : 1;

        const repos = getRepositories();
        const accounts = await repos.platformAccounts.listByUserId(session.sub);
        const enabledInstagram = accounts.filter(a => a.enabled && a.platform === 1);

        if (enabledInstagram.length === 0) {
            return badRequest('No enabled Instagram accounts found');
        }

        const statuses = await repos.accountSessions.listStatusesByUserId(session.sub);
        const statusMap = new Map(statuses.map(s => [s.platform_account_id, s.status]));
        const missing = enabledInstagram.filter(
            a => statusMap.get(a.id) !== 'valid'
        );
        if (missing.length > 0) {
            return badRequest(
                `Accounts need Instagram connect: ${missing.map(a => `@${a.username}`).join(', ')}`
            );
        }

        const user = await repos.users.findById(session.sub);
        let settings: SettingsConfig = { ...DEFAULT_SETTINGS };
        if (user?.config_id) {
            const config = await repos.configurations.findById(user.config_id);
            if (config) settings = config.settings;
        }

        const campaign = await repos.campaigns.create({
            user_id: session.sub,
            name,
            max_concurrency: maxConcurrency,
        });

        const jobs = buildInitialJobsForCampaign(campaign.id, accounts, settings);
        if (jobs.length === 0) {
            await repos.campaigns.updateStatus(campaign.id, 'completed');
            return badRequest('No comment jobs could be created. Check account source modes and hashtags/URLs.');
        }

        await repos.commentJobs.createMany(jobs);
        await repos.users.touchLastUsed(session.sub);

        const progress = await repos.campaigns.getProgress(campaign.id);
        return NextResponse.json({ campaign, progress, jobsCreated: jobs.length }, { status: 201 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to create campaign';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    try {
        const campaigns = await getRepositories().campaigns.listByUserId(session.sub);
        return NextResponse.json({ campaigns });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to list campaigns';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
