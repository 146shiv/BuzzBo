"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankHashtagCandidates = rankHashtagCandidates;
exports.computeEngagementScore = computeEngagementScore;
exports.formatEngagementCounts = formatEngagementCounts;
function metricValue(value) {
    return value ?? 0;
}
function rankHashtagCandidates(candidates, searchConfig) {
    const qualifying = candidates.filter(c => {
        if (c.likes !== undefined && c.likes < searchConfig.minLikes)
            return false;
        if (c.comments !== undefined && c.comments < searchConfig.minComments)
            return false;
        return true;
    });
    qualifying.sort((a, b) => {
        if (b.engagementScore !== a.engagementScore)
            return b.engagementScore - a.engagementScore;
        const likesDiff = metricValue(b.likes) - metricValue(a.likes);
        if (likesDiff !== 0)
            return likesDiff;
        return metricValue(b.comments) - metricValue(a.comments);
    });
    return qualifying.slice(0, searchConfig.maxPostsToComment);
}
function computeEngagementScore(likes, comments, searchConfig) {
    let score = 0;
    if (likes !== undefined)
        score += likes * searchConfig.likeWeight;
    if (comments !== undefined)
        score += comments * searchConfig.commentWeight;
    return score;
}
function formatEngagementCounts(candidate) {
    const likes = candidate.likes !== undefined ? String(candidate.likes) : 'n/a';
    const comments = candidate.comments !== undefined ? String(candidate.comments) : 'n/a';
    return `likes: ${likes} | comments: ${comments}`;
}
