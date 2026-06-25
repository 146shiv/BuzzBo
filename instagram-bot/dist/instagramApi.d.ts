import { ApiHashtagSearchConfig } from '@buzzbo/core/config';
import { HashtagPostCandidate } from './hashtagRanking';
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
export declare function searchHashtagId(hashtag: string, credentials: InstagramApiCredentials): Promise<string>;
export declare function fetchRecentMediaBatch(hashtagId: string, credentials: InstagramApiCredentials, fetchBatchSize: number, after?: string): Promise<RecentMediaBatch>;
export declare function mapApiPostsToCandidates(posts: ApiMediaPost[], searchConfig: ApiHashtagSearchConfig, skipShortcodes: Set<string>): HashtagPostCandidate[];
//# sourceMappingURL=instagramApi.d.ts.map