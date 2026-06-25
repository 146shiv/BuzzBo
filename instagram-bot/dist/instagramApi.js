"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchHashtagId = searchHashtagId;
exports.fetchRecentMediaBatch = fetchRecentMediaBatch;
exports.mapApiPostsToCandidates = mapApiPostsToCandidates;
const comments_1 = require("@buzzbo/core/comments");
const hashtagRanking_1 = require("./hashtagRanking");
const GRAPH_API_VERSION = 'v25.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const MAX_PAGE_LIMIT = 50;
function buildGraphUrl(path, params) {
    const url = new URL(`${GRAPH_API_BASE}/${path}`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}
async function graphGet(url) {
    const response = await fetch(url);
    const body = (await response.json());
    if (!response.ok || body.error) {
        const message = body.error?.message ?? `HTTP ${response.status}`;
        throw new Error(`Instagram Graph API error: ${message}`);
    }
    return body;
}
async function searchHashtagId(hashtag, credentials) {
    const normalizedTag = hashtag.replace(/^#/, '').toLowerCase();
    const url = buildGraphUrl('ig_hashtag_search', {
        q: normalizedTag,
        user_id: credentials.userId,
        access_token: credentials.accessToken,
    });
    const body = await graphGet(url);
    const hashtagId = body.data?.[0]?.id;
    if (!hashtagId) {
        throw new Error(`No hashtag ID found for #${normalizedTag}`);
    }
    return hashtagId;
}
async function fetchRecentMediaBatch(hashtagId, credentials, fetchBatchSize, after) {
    const posts = [];
    let cursor = after;
    while (posts.length < fetchBatchSize) {
        const limit = Math.min(MAX_PAGE_LIMIT, fetchBatchSize - posts.length);
        const params = {
            fields: 'id,caption,timestamp,permalink,like_count,comments_count',
            limit: String(limit),
            user_id: credentials.userId,
            access_token: credentials.accessToken,
        };
        if (cursor) {
            params.after = cursor;
        }
        const url = buildGraphUrl(`${hashtagId}/top_media`, params);
        const body = await graphGet(url);
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
function mapApiPostsToCandidates(posts, searchConfig, skipShortcodes) {
    const candidates = [];
    for (const post of posts) {
        if (!post.permalink) {
            continue;
        }
        const shortcode = (0, comments_1.extractPostShortcode)(post.permalink);
        if (!shortcode || skipShortcodes.has(shortcode)) {
            continue;
        }
        const likes = post.like_count;
        const comments = post.comments_count;
        const contentType = post.permalink.includes('/reel/') ? 'reel' : 'post';
        candidates.push({
            url: post.permalink,
            shortcode,
            likes,
            comments,
            engagementScore: (0, hashtagRanking_1.computeEngagementScore)(likes, comments, searchConfig),
            contentType,
        });
    }
    return candidates;
}
