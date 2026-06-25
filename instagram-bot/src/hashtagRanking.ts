import { HashtagEngagementConfig } from '@buzzbo/core/config';

export interface HashtagPostCandidate {
    url: string;
    shortcode: string;
    likes?: number;
    comments?: number;
    engagementScore: number;
    contentType: 'post' | 'reel';
}

function metricValue(value: number | undefined): number {
    return value ?? 0;
}

export function rankHashtagCandidates(
    candidates: HashtagPostCandidate[],
    searchConfig: HashtagEngagementConfig
): HashtagPostCandidate[] {
    const qualifying = candidates.filter(c => {
        if (c.likes !== undefined && c.likes < searchConfig.minLikes) return false;
        if (c.comments !== undefined && c.comments < searchConfig.minComments) return false;
        return true;
    });

    qualifying.sort((a, b) => {
        if (b.engagementScore !== a.engagementScore) return b.engagementScore - a.engagementScore;
        const likesDiff = metricValue(b.likes) - metricValue(a.likes);
        if (likesDiff !== 0) return likesDiff;
        return metricValue(b.comments) - metricValue(a.comments);
    });

    return qualifying.slice(0, searchConfig.maxPostsToComment);
}

export function computeEngagementScore(
    likes: number | undefined,
    comments: number | undefined,
    searchConfig: HashtagEngagementConfig
): number {
    let score = 0;
    if (likes !== undefined) score += likes * searchConfig.likeWeight;
    if (comments !== undefined) score += comments * searchConfig.commentWeight;
    return score;
}

export function formatEngagementCounts(candidate: HashtagPostCandidate): string {
    const likes = candidate.likes !== undefined ? String(candidate.likes) : 'n/a';
    const comments = candidate.comments !== undefined ? String(candidate.comments) : 'n/a';
    return `likes: ${likes} | comments: ${comments}`;
}
