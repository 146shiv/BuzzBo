import type { AdminApiClient } from '../api/apiClient';
import { Platform } from '../config/types';
/** API-backed comment dedup — same surface as CommentHistoryStore for bot use. */
export declare class RemoteCommentHistoryStore {
    private readonly client;
    private readonly accountIdByUsername;
    private readonly platformByUsername;
    private readonly shortcodeCache;
    constructor(client: AdminApiClient);
    registerAccount(username: string, accountId: string, platform?: Platform): void;
    private resolveAccountId;
    private resolvePlatform;
    hasCommented(accountUsername: string, postShortcode: string): boolean;
    hasCommentedAsync(accountUsername: string, postShortcode: string): Promise<boolean>;
    recordComment(accountUsername: string, postShortcode: string, _options?: {
        postUrl?: string;
        commentText?: string;
    }): void;
    getCommentedShortcodes(accountUsername: string): Set<string>;
    preloadAccount(accountUsername: string): Promise<void>;
    getTotalCount(): number;
    close(): void;
}
export type CommentHistoryAdapter = {
    hasCommented(accountUsername: string, postShortcode: string): boolean;
    recordComment(accountUsername: string, postShortcode: string, options?: {
        postUrl?: string;
        commentText?: string;
    }): void;
    getCommentedShortcodes(accountUsername: string): Set<string>;
    close(): void;
};
//# sourceMappingURL=commentHistoryRemote.d.ts.map