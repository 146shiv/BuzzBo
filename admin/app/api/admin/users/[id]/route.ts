import { NextResponse } from 'next/server';
import { requireAuth, badRequest, notFound } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { updateUserSchema } from '@/lib/validators/schemas';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
    const session = await requireAuth(_request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const user = await getRepositories().users.findById(id);
    if (!user) return notFound();
    const { password_hash: _, ...publicUser } = user;
    return NextResponse.json(publicUser);
}

export async function PATCH(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    try {
        const body = await request.json();
        const parsed = updateUserSchema.safeParse(body);
        if (!parsed.success) return badRequest(parsed.error.issues[0]?.message || 'Invalid input');

        const user = await getRepositories().users.update(id, parsed.data);
        const { password_hash: _, ...publicUser } = user;
        return NextResponse.json(publicUser);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to update user';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    try {
        await getRepositories().users.delete(id);
        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to delete user';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
