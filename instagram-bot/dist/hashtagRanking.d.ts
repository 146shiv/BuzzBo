import { HashtagEngagementConfig } from '@buzzbo/core/config';
export interface HashtagPostCandidate {
    url: string;
    shortcode: string;
    likes?: number;
    comments?: number;
    engagementScore: number;
    contentType: 'post' | 'reel';
}
export declare function rankHashtagCandidates(candidates: HashtagPostCandidate[], searchConfig: HashtagEngagementConfig): HashtagPostCandidate[];
export declare function computeEngagementScore(likes: number | undefined, comments: number | undefined, searchConfig: HashtagEngagementConfig): number;
export declare function formatEngagementCounts(candidate: HashtagPostCandidate): string;
//# sourceMappingURL=hashtagRanking.d.ts.map