import { NextResponse } from 'next/server';
import { requireAuth, badRequest, forbidden } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { Platform } from '@/lib/db/types';

export async function GET(request: Request) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const platform = searchParams.get('platform');
    const postId = searchParams.get('postId');

    if (!accountId || !platform || !postId) {
        return badRequest('accountId, platform, and postId are required');
    }

    const account = await getRepositories().platformAccounts.findById(accountId);
    if (!account || account.user_id !== session.sub) return forbidden();

    const commented = await getRepositories().comments.hasCommented(
        accountId,
        Number(platform) as Platform,
        postId
    );
    return NextResponse.json({ commented });
}
