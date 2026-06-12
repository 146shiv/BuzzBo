import { ApiHashtagSearchConfig } from './config';
import { extractPostShortcode } from './commentHistory';
import { computeEngagementScore, HashtagPostCandidate } from './hashtagRanking';

const GRAPH_API_VERSION = 'v25.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const MAX_PAGE_LIMIT = 50;

export interface ApiMediaPost {
    id: string;
    permalink?: string;
    caption?: string;
    like_count?: number;
    comments_count?: number;
    timestamp?: string;
}

export interface InstagramApiCredentials {
    userId: string;
    accessToken: string;
}

export interface RecentMediaBatch {
    posts: ApiMediaPost[];
    nextAfter?: string;
}

interface GraphPaging {
    cursors?: { after?: string };
    next?: string;
}

interface HashtagSearchResponse {
    data?: Array<{ id: string }>;
    error?: { message: string; code?: number };
}

interface RecentMediaResponse {
    data?: ApiMediaPost[];
    paging?: GraphPaging;
    error?: { message: string; code?: number };
}

function buildGraphUrl(path: string, params: Record<string, string>): string {
    const url = new URL(`${GRAPH_API_BASE}/${path}`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}

async function graphGet<T>(url: string): Promise<T> {
    const response = await fetch(url);
    const body = (await response.json()) as T & { error?: { message: string } };

    if (!response.ok || body.error) {
        const message = body.error?.message ?? `HTTP ${response.status}`;
        throw new Error(`Instagram Graph API error: ${message}`);
    }

    return body;
}

export async function searchHashtagId(
    hashtag: string,
    credentials: InstagramApiCredentials
): Promise<string> {
    const normalizedTag = hashtag.replace(/^#/, '').toLowerCase();
    const url = buildGraphUrl('ig_hashtag_search', {
        q: normalizedTag,
        user_id: credentials.userId,
        access_token: credentials.accessToken,
    });

    const body = await graphGet<HashtagSearchResponse>(url);
    const hashtagId = body.data?.[0]?.id;

    if (!hashtagId) {
        throw new Error(`No hashtag ID found for #${normalizedTag}`);
    }

    return hashtagId;
}

export async function fetchRecentMediaBatch(
    hashtagId: string,
    credentials: InstagramApiCredentials,
    fetchBatchSize: number,
    after?: string
): Promise<RecentMediaBatch> {
    const posts: ApiMediaPost[] = [];
    let cursor = after;

    while (posts.length < fetchBatchSize) {
        const limit = Math.min(MAX_PAGE_LIMIT, fetchBatchSize - posts.length);
        const params: Record<string, string> = {
            fields: 'id,caption,timestamp,permalink,like_count,comments_count',
            limit: String(limit),
            user_id: credentials.userId,
            access_token: credentials.accessToken,
        };
        if (cursor) {
            params.after = cursor;
        }

        const url = buildGraphUrl(`${hashtagId}/top_media`, params);
        const body = await graphGet<RecentMediaResponse>(url);
        const pagePosts = body.data ?? [];

        if (pagePosts.length === 0) {
            return { posts, nextAfter: undefined };
        }

        posts.push(...pagePosts);
        cursor = body.paging?.cursors?.after;

        if (!cursor || !body.paging?.next) {
            return { posts, nextAfter: undefined };
        }

        if (posts.length >= fetchBatchSize) {
            return { posts: posts.slice(0, fetchBatchSize), nextAfter: cursor };
        }
    }

    return { posts, nextAfter: cursor };
}

export function mapApiPostsToCandidates(
    posts: ApiMediaPost[],
    searchConfig: ApiHashtagSearchConfig,
    skipShortcodes: Set<string>
): HashtagPostCandidate[] {
    const candidates: HashtagPostCandidate[] = [];

    for (const post of posts) {
        if (!post.permalink) {
            continue;
        }

        const shortcode = extractPostShortcode(post.permalink);
        if (!shortcode || skipShortcodes.has(shortcode)) {
            continue;
        }

        const likes = post.like_count;
        const comments = post.comments_count;
        const contentType: 'post' | 'reel' = post.permalink.includes('/reel/') ? 'reel' : 'post';

        candidates.push({
            url: post.permalink,
            shortcode,
            likes,
            comments,
            engagementScore: computeEngagementScore(likes, comments, searchConfig),
            contentType,
        });
    }

    return candidates;
}
