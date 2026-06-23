import { NextResponse } from 'next/server';
import type { JwtPayload } from './jwt';
import { getSessionFromRequest } from './jwt';
import type { UserRole } from '@/lib/db/types';

export function unauthorized(message = 'Unauthorized') {
    return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Forbidden') {
    return NextResponse.json({ error: message }, { status: 403 });
}

export function badRequest(message: string) {
    return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = 'Not found') {
    return NextResponse.json({ error: message }, { status: 404 });
}

export async function requireAuth(
    request: Request,
    roles?: UserRole[]
): Promise<JwtPayload | NextResponse> {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();
    if (roles && !roles.includes(session.role)) return forbidden();
    return session;
}
