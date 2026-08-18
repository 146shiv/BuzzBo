import { NextResponse } from 'next/server';
import { requireAuth, forbidden } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';

export async function GET(request: Request) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    try {
        const statuses = await getRepositories().accountSessions.listStatusesByUserId(session.sub);
        return NextResponse.json({ statuses });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to list session statuses';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
