import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';

export async function POST(request: Request) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    try {
        await getRepositories().users.touchLastUsed(session.sub);
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error('Heartbeat error:', e);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
