import { NextResponse } from 'next/server';
import { requireAuth, badRequest, forbidden } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { recordCommentSchema } from '@/lib/validators/schemas';
import { Platform } from '@/lib/db/types';

function mapEntry(post: {
    post_id: string;
    post_url: string | null;
    comment_text: string | null;
    commented_at: string;
}) {
    return {
        postId: post.post_id,
        postUrl: post.post_url,
        commentText: post.comment_text,
        commentedAt: post.commented_at,
    };
}

export async function GET(request: Request) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const platform = searchParams.get('platform');
    const postId = searchParams.get('postId');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    if (accountId && platform && postId) {
        const account = await getRepositories().platformAccounts.findById(accountId);
        if (!account || account.user_id !== session.sub) return forbidden();
        const commented = await getRepositories().comments.hasCommented(
            accountId,
            Number(platform) as Platform,
            postId
        );
        return NextResponse.json({ commented });
    }

    if (!accountId) return badRequest('accountId is required');

    const account = await getRepositories().platformAccounts.findById(accountId);
    if (!account || account.user_id !== session.sub) return forbidden();

    if (limitParam !== null) {
        const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200);
        const offset = Math.max(Number(offsetParam) || 0, 0);
        const { entries, total } = await getRepositories().comments.listByAccountPaginated(
            accountId,
            limit,
            offset
        );
        return NextResponse.json({
            entries: entries.map(mapEntry),
            total,
            limit,
            offset,
        });
    }

    const posts = await getRepositories().comments.listByAccount(accountId);
    return NextResponse.json({
        postIds: posts.map(p => p.post_id),
        entries: posts.map(mapEntry),
    });
}

export async function POST(request: Request) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    try {
        const body = await request.json();
        const parsed = recordCommentSchema.safeParse(body);
        if (!parsed.success) return badRequest(parsed.error.issues[0]?.message || 'Invalid input');

        const { accountId, platform, postId, postUrl, commentText } = parsed.data;
        const account = await getRepositories().platformAccounts.findById(accountId);
        if (!account || account.user_id !== session.sub) return forbidden();

        await getRepositories().comments.recordComment(
            session.sub,
            accountId,
            platform as Platform,
            postId,
            { postUrl, commentText }
        );
        await getRepositories().users.touchLastUsed(session.sub);

        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to record comment';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
