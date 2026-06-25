import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME, signToken, verifyPassword } from '@/lib/auth/jwt';
import { loginSchema } from '@/lib/validators/schemas';
import { badRequest } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const parsed = loginSchema.safeParse(body);
        if (!parsed.success) return badRequest('Invalid credentials');

        const { username, password } = parsed.data;
        const repos = getRepositories();
        const user = await repos.users.findByUsername(username);
        if (!user) return badRequest('Invalid username or password');
        if (user.is_disabled) return badRequest('Account is disabled');

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) return badRequest('Invalid username or password');

        const token = await signToken({
            sub: user.id,
            username: user.username,
            role: user.role,
        });

        const response = NextResponse.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                display_name: user.display_name,
                role: user.role,
            },
        });

        const cookieStore = await cookies();
        cookieStore.set(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
        });

        return response;
    } catch (e) {
        console.error('Login error:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
