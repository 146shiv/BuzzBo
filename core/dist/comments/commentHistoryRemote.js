"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteCommentHistoryStore = void 0;
const types_1 = require("../config/types");
/** API-backed comment dedup — same surface as CommentHistoryStore for bot use. */
class RemoteCommentHistoryStore {
    constructor(client) {
        this.client = client;
        this.accountIdByUsername = new Map();
        this.platformByUsername = new Map();
        this.shortcodeCache = new Map();
    }
    registerAccount(username, accountId, platform = types_1.Platform.Instagram) {
        this.accountIdByUsername.set(username, accountId);
        this.platformByUsername.set(username, platform);
    }
    resolveAccountId(accountUsername) {
        return this.accountIdByUsername.get(accountUsername) ?? null;
    }
    resolvePlatform(accountUsername) {
        return this.platformByUsername.get(accountUsername) ?? types_1.Platform.Instagram;
    }
    hasCommented(accountUsername, postShortcode) {
        const accountId = this.resolveAccountId(accountUsername);
        if (!accountId)
            return false;
        return this.shortcodeCache.get(accountUsername)?.has(postShortcode) ?? false;
    }
    async hasCommentedAsync(accountUsername, postShortcode) {
        const accountId = this.resolveAccountId(accountUsername);
        if (!accountId)
            return false;
        const cache = this.shortcodeCache.get(accountUsername);
        if (cache?.has(postShortcode))
            return true;
        const platform = this.resolvePlatform(accountUsername);
        const commented = await this.client.checkCommented(accountId, platform, postShortcode);
        if (commented) {
            if (!this.shortcodeCache.has(accountUsername)) {
                this.shortcodeCache.set(accountUsername, new Set());
            }
            this.shortcodeCache.get(accountUsername).add(postShortcode);
        }
        return commented;
    }
    recordComment(accountUsername, postShortcode, _options = {}) {
        const accountId = this.resolveAccountId(accountUsername);
        if (!accountId)
            return;
        const platform = this.resolvePlatform(accountUsername);
        void this.client
            .recordComment(accountId, platform, postShortcode, {
            postUrl: _options.postUrl,
            commentText: _options.commentText,
        })
            .catch(() => { });
        if (!this.shortcodeCache.has(accountUsername)) {
            this.shortcodeCache.set(accountUsername, new Set());
        }
        this.shortcodeCache.get(accountUsername).add(postShortcode);
    }
    getCommentedShortcodes(accountUsername) {
        return this.shortcodeCache.get(accountUsername) ?? new Set();
    }
    async preloadAccount(accountUsername) {
        const accountId = this.resolveAccountId(accountUsername);
        if (!accountId)
            return;
        const postIds = await this.client.listCommentedPostIds(accountId);
        this.shortcodeCache.set(accountUsername, new Set(postIds));
    }
    getTotalCount() {
        let total = 0;
        for (const set of this.shortcodeCache.values())
            total += set.size;
        return total;
    }
    close() {
        // no-op for remote store
    }
}
exports.RemoteCommentHistoryStore = RemoteCommentHistoryStore;
