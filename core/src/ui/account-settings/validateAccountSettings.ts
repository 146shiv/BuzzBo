export function validateAccountSettings(account: Record<string, unknown>): string | null {
    if (!account.enabled) return null;

    const config = (account.config as Record<string, unknown>) || {};
    const loginMethod = String(config.loginMethod || 'manual');

    if (loginMethod === 'credentials') {
        if (!String(account.username || '').trim()) {
            return 'Username is required when using credentials login';
        }
        if (!String(config.password || '').trim()) {
            return 'Password is required when using credentials login';
        }
    }

    const sourceMode = String(config.sourceMode || 'hashtag_list');

    switch (sourceMode) {
        case 'hashtag_list': {
            const hashtags = (config.hashtags as string[]) || [];
            if (hashtags.length === 0) {
                return 'At least one hashtag is required for Hashtag (UI) source mode';
            }
            break;
        }
        case 'url_list': {
            const postUrls = (account.post_urls as string[]) || [];
            if (postUrls.length === 0) {
                return 'At least one post URL is required for URL List source mode';
            }
            break;
        }
        case 'hashtag_api': {
            if (!String(config.instagramApiAccessToken || '').trim()) {
                return 'Instagram API Access Token is required for Hashtag (API) source mode';
            }
            if (!String(config.instagramApiUserId || '').trim()) {
                return 'Instagram API User ID is required for Hashtag (API) source mode';
            }
            break;
        }
        case 'new_post_added_to_account': {
            const targets = (config.targets as string[]) || [];
            if (targets.length === 0) {
                return 'At least one monitor target is required for Monitor Profiles source mode';
            }
            break;
        }
    }

    return null;
}
