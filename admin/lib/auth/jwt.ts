import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import type { UserRole } from '@/lib/db/types';

export const COOKIE_NAME = 'buzzbo_token';

export interface JwtPayload {
    sub: string;
    username: string;
    role: UserRole;
}

function getSecret(): Uint8Array {
    const secret = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
    return new TextEncoder().encode(secret);
}

export async function signToken(payload: JwtPayload): Promise<string> {
    return new SignJWT({ username: payload.username, role: payload.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(payload.sub)
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getSecret());
        return {
            sub: payload.sub as string,
            username: payload.username as string,
            role: payload.role as UserRole,
        };
    } catch {
        return null;
    }
}

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export async function getSession(): Promise<JwtPayload | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
}

export function getTokenFromRequest(request: Request): string | null {
    const auth = request.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return null;
}

export async function getSessionFromRequest(request: Request): Promise<JwtPayload | null> {
    const bearer = getTokenFromRequest(request);
    if (bearer) return verifyToken(bearer);
    return getSession();
}
