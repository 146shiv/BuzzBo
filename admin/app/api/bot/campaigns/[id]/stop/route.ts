import { NextResponse } from 'next/server';
import { requireAuth, forbidden, notFound } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;
    const { id } = await params;

    const campaign = await getRepositories().campaigns.findById(id);
    if (!campaign) return notFound();
    if (campaign.user_id !== session.sub) return forbidden();

    const repos = getRepositories();
    await repos.commentJobs.cancelPending(id);
    const updated = await repos.campaigns.updateStatus(id, 'stopped');
    const progress = await repos.campaigns.getProgress(id);
    return NextResponse.json({ campaign: updated, progress });
}
