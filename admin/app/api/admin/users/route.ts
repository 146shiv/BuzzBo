import { NextResponse } from 'next/server';
import { requireAuth, badRequest } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { createUserSchema } from '@/lib/validators/schemas';

export async function GET(request: Request) {
    const session = await requireAuth(request, ['admin']);
    if (session instanceof NextResponse) return session;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const sortBy = (searchParams.get('sortBy') as 'last_used_at' | 'created_at' | 'username') || 'last_used_at';
    const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc';

    try {
        const users = await getRepositories().users.list({
            search,
            sortBy,
            sortDir,
            role: 'user',
        });
        return NextResponse.json(users);
    } catch (e) {
        console.error('List users error:', e);
        return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const session = await requireAuth(request, ['admin']);
    if (session instanceof NextResponse) return session;

    try {
        const body = await request.json();
        const parsed = createUserSchema.safeParse(body);
        if (!parsed.success) return badRequest(parsed.error.issues[0]?.message || 'Invalid input');

        const user = await getRepositories().users.create({
            ...parsed.data,
            role: 'user',
        });
        const { password_hash: _, ...publicUser } = user;
        return NextResponse.json(publicUser, { status: 201 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to create user';
        console.error('Create user error:', e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
