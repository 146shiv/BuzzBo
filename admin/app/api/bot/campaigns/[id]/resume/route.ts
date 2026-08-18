import { NextResponse } from 'next/server';
import { requireAuth, forbidden, notFound } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import type { CampaignStatus } from '@/lib/db/types';

type Params = { params: Promise<{ id: string }> };

async function setStatus(campaignId: string, userId: string, status: CampaignStatus) {
    const campaign = await getRepositories().campaigns.findById(campaignId);
    if (!campaign) return notFound();
    if (campaign.user_id !== userId) return forbidden();

    const repos = getRepositories();
    const updated = await repos.campaigns.updateStatus(campaignId, status);
    const progress = await repos.campaigns.getProgress(campaignId);
    return NextResponse.json({ campaign: updated, progress });
}

export async function POST(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;
    const { id } = await params;
    return setStatus(id, session.sub, 'running');
}
