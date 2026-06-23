import { NextResponse } from 'next/server';
import { requireAuth, badRequest, forbidden, notFound } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { platformAccountSchema } from '@/lib/validators/schemas';
import type { PlatformAccountConfig } from '@/lib/db/types';
import { Platform } from '@/lib/db/types';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
    const session = await requireAuth(_request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const account = await getRepositories().platformAccounts.findById(id);
    if (!account) return notFound();
    if (account.user_id !== session.sub) return forbidden();
    return NextResponse.json(account);
}

export async function PATCH(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const existing = await getRepositories().platformAccounts.findById(id);
    if (!existing) return notFound();
    if (existing.user_id !== session.sub) return forbidden();

    try {
        const body = await request.json();
        const parsed = platformAccountSchema.partial().safeParse(body);
        if (!parsed.success) return badRequest(parsed.error.issues[0]?.message || 'Invalid input');

        const patch: Record<string, unknown> = {};
        if (parsed.data.platform !== undefined) patch.platform = parsed.data.platform as Platform;
        if (parsed.data.username !== undefined) patch.username = parsed.data.username;
        if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;
        if (parsed.data.config !== undefined) patch.config = parsed.data.config as PlatformAccountConfig;
        if (parsed.data.skills_content !== undefined) patch.skills_content = parsed.data.skills_content;
        if (parsed.data.post_urls !== undefined) patch.post_urls = parsed.data.post_urls;

        const account = await getRepositories().platformAccounts.update(id, patch);
        await getRepositories().users.touchLastUsed(session.sub);
        return NextResponse.json(account);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to update account';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
