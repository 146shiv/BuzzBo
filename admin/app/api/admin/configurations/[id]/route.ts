import { NextResponse } from 'next/server';
import { requireAuth, badRequest, notFound } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { configurationSchema } from '@/lib/validators/schemas';
import type { SettingsConfig } from '@shared/config-types';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
    const session = await requireAuth(_request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const config = await getRepositories().configurations.findById(id);
    if (!config) return notFound();
    return NextResponse.json(config);
}

export async function PATCH(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    try {
        const body = await request.json();
        const parsed = configurationSchema.partial().safeParse(body);
        if (!parsed.success) return badRequest(parsed.error.issues[0]?.message || 'Invalid input');

        const patch: { name?: string; settings?: SettingsConfig } = {};
        if (parsed.data.name !== undefined) patch.name = parsed.data.name;
        if (parsed.data.settings !== undefined) patch.settings = parsed.data.settings as unknown as SettingsConfig;

        const config = await getRepositories().configurations.update(id, patch);
        return NextResponse.json(config);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to update configuration';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    try {
        await getRepositories().configurations.delete(id);
        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to delete configuration';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
