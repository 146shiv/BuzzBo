import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';

export async function GET(request: Request) {
    const session = await requireAuth(request, ['admin']);
    if (session instanceof NextResponse) return session;

    try {
        const stats = await getRepositories().getStats();
        return NextResponse.json(stats);
    } catch (e) {
        console.error('Stats error:', e);
        return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
    }
}
