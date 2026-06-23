import { NextResponse } from 'next/server';
import { requireAuth, badRequest } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { z } from 'zod';

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
    config_id: z.string().uuid().nullable(),
});

export async function PATCH(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    try {
        const body = await request.json();
        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) return badRequest('Invalid config_id');

        const user = await getRepositories().users.update(id, {
            config_id: parsed.data.config_id,
        });
        const { password_hash: _, ...publicUser } = user;
        return NextResponse.json(publicUser);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to assign config';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
