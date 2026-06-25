import { NextResponse } from 'next/server';
import { requireAuth, badRequest } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { platformAccountSchema } from '@/lib/validators/schemas';
import type { PlatformAccountConfig } from '@/lib/db/types';
import { Platform } from '@/lib/db/types';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
    const session = await requireAuth(_request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { id: userId } = await params;
    try {
        const accounts = await getRepositories().platformAccounts.listByUserId(userId);
        return NextResponse.json(accounts);
    } catch (e) {
        console.error('List accounts error:', e);
        return NextResponse.json({ error: 'Failed to list accounts' }, { status: 500 });
    }
}

export async function POST(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { id: userId } = await params;
    try {
        const body = await request.json();
        const parsed = platformAccountSchema.safeParse(body);
        if (!parsed.success) return badRequest(parsed.error.issues[0]?.message || 'Invalid input');

        const account = await getRepositories().platformAccounts.create({
            user_id: userId,
            platform: parsed.data.platform as Platform,
            username: parsed.data.username,
            enabled: parsed.data.enabled,
            config: (parsed.data.config || {}) as PlatformAccountConfig,
            skills_content: parsed.data.skills_content,
            post_urls: parsed.data.post_urls,
        });
        return NextResponse.json(account, { status: 201 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to create account';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
