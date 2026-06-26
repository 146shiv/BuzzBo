export interface SelectOption {
    value: string;
    label: string;
}

export const BOOL_ON_OFF: SelectOption[] = [
    { value: 'false', label: 'Off' },
    { value: 'true', label: 'On' },
];

export const BOOL_YES_NO: SelectOption[] = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
];

export const BOOL_ENABLED: SelectOption[] = [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
];

export const HEADLESS_OPTIONS: SelectOption[] = [
    { value: 'false', label: 'No (visible browser)' },
    { value: 'true', label: 'Yes' },
];

export const BROWSER_CHANNEL_OPTIONS: SelectOption[] = [
    { value: 'chrome', label: 'Chrome' },
    { value: 'chromium', label: 'Chromium' },
    { value: 'msedge', label: 'Edge' },
];

export const AI_PROVIDER_OPTIONS: SelectOption[] = [
    { value: 'gemini', label: 'Gemini' },
    { value: 'groq', label: 'Groq' },
    { value: 'local', label: 'Local LLM' },
];

export const LOGIN_METHOD_OPTIONS: SelectOption[] = [
    { value: 'credentials', label: 'Credentials' },
    { value: 'manual', label: 'Manual' },
];

export const SOURCE_MODE_OPTIONS: SelectOption[] = [
    { value: 'new_post_added_to_account', label: 'Monitor Profiles' },
    { value: 'url_list', label: 'URL List' },
    { value: 'hashtag_list', label: 'Hashtag (UI)' },
    { value: 'hashtag_api', label: 'Hashtag (API)' },
    { value: 'feed_browse', label: 'Feed Browse' },
];

export const FEED_BROWSE_SURFACE_OPTIONS: SelectOption[] = [
    { value: 'reels', label: 'Reels tab' },
    { value: 'home', label: 'Home feed' },
];

export const MENTION_POLICY_OPTIONS: SelectOption[] = [
    { value: 'ai_only', label: 'AI Only' },
    { value: 'append_if_missing', label: 'Append if Missing' },
    { value: 'always', label: 'Always' },
];

export const PLATFORM_OPTIONS: SelectOption[] = [
    { value: '1', label: 'Instagram' },
    { value: '2', label: 'YouTube' },
];
