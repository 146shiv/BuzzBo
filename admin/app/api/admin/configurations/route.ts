import { NextResponse } from 'next/server';
import { requireAuth, badRequest } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { configurationSchema } from '@/lib/validators/schemas';
import type { SettingsConfig } from '@shared/config-types';

export async function GET(request: Request) {
    const session = await requireAuth(request, ['admin']);
    if (session instanceof NextResponse) return session;

    try {
        const configs = await getRepositories().configurations.list();
        return NextResponse.json(configs);
    } catch (e) {
        console.error('List configs error:', e);
        return NextResponse.json({ error: 'Failed to list configurations' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const session = await requireAuth(request, ['admin']);
    if (session instanceof NextResponse) return session;

    try {
        const body = await request.json();
        const parsed = configurationSchema.safeParse(body);
        if (!parsed.success) return badRequest(parsed.error.issues[0]?.message || 'Invalid input');

        const config = await getRepositories().configurations.create({
            name: parsed.data.name,
            settings: parsed.data.settings as unknown as SettingsConfig,
        });
        return NextResponse.json(config, { status: 201 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to create configuration';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
