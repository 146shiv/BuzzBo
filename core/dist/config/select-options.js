"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_OPTIONS = exports.MENTION_POLICY_OPTIONS = exports.SOURCE_MODE_OPTIONS = exports.LOGIN_METHOD_OPTIONS = exports.AI_PROVIDER_OPTIONS = exports.BROWSER_CHANNEL_OPTIONS = exports.HEADLESS_OPTIONS = exports.BOOL_ENABLED = exports.BOOL_YES_NO = exports.BOOL_ON_OFF = void 0;
exports.BOOL_ON_OFF = [
    { value: 'false', label: 'Off' },
    { value: 'true', label: 'On' },
];
exports.BOOL_YES_NO = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
];
exports.BOOL_ENABLED = [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
];
exports.HEADLESS_OPTIONS = [
    { value: 'false', label: 'No (visible browser)' },
    { value: 'true', label: 'Yes' },
];
exports.BROWSER_CHANNEL_OPTIONS = [
    { value: 'chrome', label: 'Chrome' },
    { value: 'chromium', label: 'Chromium' },
    { value: 'msedge', label: 'Edge' },
];
exports.AI_PROVIDER_OPTIONS = [
    { value: 'gemini', label: 'Gemini' },
    { value: 'groq', label: 'Groq' },
    { value: 'local', label: 'Local LLM' },
];
exports.LOGIN_METHOD_OPTIONS = [
    { value: 'credentials', label: 'Credentials' },
    { value: 'manual', label: 'Manual' },
];
exports.SOURCE_MODE_OPTIONS = [
    { value: 'new_post_added_to_account', label: 'Monitor Profiles' },
    { value: 'url_list', label: 'URL List' },
    { value: 'hashtag_list', label: 'Hashtag (UI)' },
    { value: 'hashtag_api', label: 'Hashtag (API)' },
];
exports.MENTION_POLICY_OPTIONS = [
    { value: 'ai_only', label: 'AI Only' },
    { value: 'append_if_missing', label: 'Append if Missing' },
    { value: 'always', label: 'Always' },
];
exports.PLATFORM_OPTIONS = [
    { value: '1', label: 'Instagram' },
    { value: '2', label: 'YouTube' },
];
