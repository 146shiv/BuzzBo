import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';

export async function GET(request: Request) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    try {
        const accounts = await getRepositories().platformAccounts.listByUserId(session.sub);
        return NextResponse.json(accounts);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to list accounts';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
