import type { AdminApiClient } from '../api/apiClient';
import { Platform } from '../config/types';

/** API-backed comment dedup — same surface as CommentHistoryStore for bot use. */
export class RemoteCommentHistoryStore {
    private readonly accountIdByUsername = new Map<string, string>();
    private readonly platformByUsername = new Map<string, number>();
    private readonly shortcodeCache = new Map<string, Set<string>>();

    constructor(private readonly client: AdminApiClient) {}

    registerAccount(username: string, accountId: string, platform = Platform.Instagram): void {
        this.accountIdByUsername.set(username, accountId);
        this.platformByUsername.set(username, platform);
    }

    private resolveAccountId(accountUsername: string): string | null {
        return this.accountIdByUsername.get(accountUsername) ?? null;
    }

    private resolvePlatform(accountUsername: string): number {
        return this.platformByUsername.get(accountUsername) ?? Platform.Instagram;
    }

    hasCommented(accountUsername: string, postShortcode: string): boolean {
        const accountId = this.resolveAccountId(accountUsername);
        if (!accountId) return false;
        return this.shortcodeCache.get(accountUsername)?.has(postShortcode) ?? false;
    }

    async hasCommentedAsync(accountUsername: string, postShortcode: string): Promise<boolean> {
        const accountId = this.resolveAccountId(accountUsername);
        if (!accountId) return false;

        const cache = this.shortcodeCache.get(accountUsername);
        if (cache?.has(postShortcode)) return true;

        const platform = this.resolvePlatform(accountUsername);
        const commented = await this.client.checkCommented(accountId, platform, postShortcode);
        if (commented) {
            if (!this.shortcodeCache.has(accountUsername)) {
                this.shortcodeCache.set(accountUsername, new Set());
            }
            this.shortcodeCache.get(accountUsername)!.add(postShortcode);
        }
        return commented;
    }

    recordComment(
        accountUsername: string,
        postShortcode: string,
        _options: { postUrl?: string; commentText?: string } = {}
    ): void {
        const accountId = this.resolveAccountId(accountUsername);
        if (!accountId) return;

        const platform = this.resolvePlatform(accountUsername);
        void this.client
            .recordComment(accountId, platform, postShortcode, {
                postUrl: _options.postUrl,
                commentText: _options.commentText,
            })
            .catch(() => {});

        if (!this.shortcodeCache.has(accountUsername)) {
            this.shortcodeCache.set(accountUsername, new Set());
        }
        this.shortcodeCache.get(accountUsername)!.add(postShortcode);
    }

    getCommentedShortcodes(accountUsername: string): Set<string> {
        return this.shortcodeCache.get(accountUsername) ?? new Set();
    }

    async preloadAccount(accountUsername: string): Promise<void> {
        const accountId = this.resolveAccountId(accountUsername);
        if (!accountId) return;
        const postIds = await this.client.listCommentedPostIds(accountId);
        this.shortcodeCache.set(accountUsername, new Set(postIds));
    }

    getTotalCount(): number {
        let total = 0;
        for (const set of this.shortcodeCache.values()) total += set.size;
        return total;
    }

    close(): void {
        // no-op for remote store
    }
}

export type CommentHistoryAdapter = {
    hasCommented(accountUsername: string, postShortcode: string): boolean;
    recordComment(
        accountUsername: string,
        postShortcode: string,
        options?: { postUrl?: string; commentText?: string }
    ): void;
    getCommentedShortcodes(accountUsername: string): Set<string>;
    close(): void;
};
