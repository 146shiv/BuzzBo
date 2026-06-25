import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth/jwt';

const adminPaths = ['/dashboard', '/users'];

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname === '/') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    const isAdminPage = adminPaths.some(p => pathname.startsWith(p));
    if (!isAdminPage) return NextResponse.next();

    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    const session = await verifyToken(token);
    if (!session || session.role !== 'admin') {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/dashboard/:path*', '/users/:path*'],
};
