import { NextResponse } from 'next/server';
import { requireAuth, forbidden, notFound } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
    const session = await requireAuth(_request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const campaign = await getRepositories().campaigns.findById(id);
    if (!campaign) return notFound();
    if (campaign.user_id !== session.sub) return forbidden();

    try {
        const progress = await getRepositories().campaigns.getProgress(id);
        return NextResponse.json({ campaign, progress });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load campaign';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
