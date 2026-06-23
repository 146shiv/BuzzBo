import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';

export async function GET(request: Request) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const repos = getRepositories();
    const user = await repos.users.findById(session.sub);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json({
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        config_id: user.config_id,
        is_disabled: user.is_disabled,
    });
}
