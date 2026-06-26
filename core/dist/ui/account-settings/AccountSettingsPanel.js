"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountSettingsPanel = AccountSettingsPanel;
const jsx_runtime_1 = require("react/jsx-runtime");
const select_options_1 = require("../../config/select-options");
const fields_1 = require("./fields");
const NoteEditorField_1 = require("./NoteEditorField");
function AccountSettingsPanel({ group, account, onChange, }) {
    const config = account.config || {};
    const patchConfig = (partial) => onChange({ ...account, config: { ...config, ...partial } });
    const enabled = Boolean(account.enabled);
    const loginMethod = String(config.loginMethod || 'manual');
    const sourceMode = String(config.sourceMode || 'hashtag_list');
    const feedBrowseDraft = config.feedBrowse || {};
    const feedBrowseSurfaces = (Array.isArray(feedBrowseDraft.surfaces) && feedBrowseDraft.surfaces.length > 0
        ? feedBrowseDraft.surfaces
        : ['reels', 'home']);
    const patchFeedBrowse = (partial) => patchConfig({
        feedBrowse: {
            surfaces: feedBrowseSurfaces,
            ...feedBrowseDraft,
            ...partial,
        },
    });
    switch (group) {
        case 'general':
            return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Enabled", children: (0, jsx_runtime_1.jsx)(fields_1.LabeledSelect, { options: select_options_1.BOOL_ENABLED, value: account.enabled ? 'true' : 'false', onValueChange: v => onChange({ ...account, enabled: v === 'true' }) }) }), enabled && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Login Method", children: (0, jsx_runtime_1.jsx)(fields_1.LabeledSelect, { options: select_options_1.LOGIN_METHOD_OPTIONS, value: loginMethod, onValueChange: v => patchConfig({ loginMethod: v }) }) }), loginMethod === 'credentials' && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Username", required: true, children: (0, jsx_runtime_1.jsx)(fields_1.Input, { value: String(account.username || ''), onChange: e => onChange({ ...account, username: e.target.value }) }) }), (0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Password", required: true, children: (0, jsx_runtime_1.jsx)(fields_1.SecretInput, { value: String(config.password || ''), onChange: e => patchConfig({ password: e.target.value }) }) })] }))] }))] }));
        case 'source-settings':
            return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Source Mode", children: (0, jsx_runtime_1.jsx)(fields_1.LabeledSelect, { options: select_options_1.SOURCE_MODE_OPTIONS, value: sourceMode, onValueChange: v => {
                                if (v === 'feed_browse') {
                                    patchConfig({
                                        sourceMode: v,
                                        feedBrowse: {
                                            surfaces: feedBrowseSurfaces,
                                            maxItemsToScan: Number(feedBrowseDraft.maxItemsToScan ?? 30),
                                            maxCommentsPerRun: Number(feedBrowseDraft.maxCommentsPerRun ?? 5),
                                            minRelevanceScore: Number(feedBrowseDraft.minRelevanceScore ?? 0.55),
                                        },
                                    });
                                }
                                else {
                                    patchConfig({ sourceMode: v });
                                }
                            } }) }), sourceMode === 'hashtag_list' && ((0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Hashtags (one per line)", hint: "Without # prefix", required: true, children: (0, jsx_runtime_1.jsx)(fields_1.Textarea, { value: (config.hashtags || []).join('\n'), onChange: e => patchConfig({
                                hashtags: e.target.value
                                    .split('\n')
                                    .map(s => s.trim().replace(/^#/, ''))
                                    .filter(Boolean),
                            }) }) })), sourceMode === 'url_list' && ((0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Post URLs (one per line)", required: true, children: (0, jsx_runtime_1.jsx)(fields_1.Textarea, { value: (account.post_urls || []).join('\n'), onChange: e => onChange({
                                ...account,
                                post_urls: e.target.value
                                    .split('\n')
                                    .map(s => s.trim())
                                    .filter(Boolean),
                            }) }) })), sourceMode === 'hashtag_api' && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Instagram API Access Token", required: true, children: (0, jsx_runtime_1.jsx)(fields_1.SecretInput, { value: String(config.instagramApiAccessToken || ''), onChange: e => patchConfig({ instagramApiAccessToken: e.target.value }) }) }), (0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Instagram API User ID", required: true, children: (0, jsx_runtime_1.jsx)(fields_1.Input, { value: String(config.instagramApiUserId || ''), onChange: e => patchConfig({ instagramApiUserId: e.target.value }) }) })] })), sourceMode === 'new_post_added_to_account' && ((0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Monitor Targets (one per line)", required: true, children: (0, jsx_runtime_1.jsx)(fields_1.Textarea, { value: (config.targets || []).join('\n'), onChange: e => patchConfig({
                                targets: e.target.value
                                    .split('\n')
                                    .map(s => s.trim())
                                    .filter(Boolean),
                            }) }) })), sourceMode === 'feed_browse' && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Browse surfaces", hint: "Reels tab scrolls /reels/; Home feed scrolls the main timeline. Use Chrome browser channel for reel video.", children: (0, jsx_runtime_1.jsx)("div", { className: "flex flex-wrap gap-3", children: select_options_1.FEED_BROWSE_SURFACE_OPTIONS.map(opt => {
                                        const checked = feedBrowseSurfaces.includes(opt.value);
                                        return ((0, jsx_runtime_1.jsxs)("label", { className: "flex items-center gap-2 text-sm", children: [(0, jsx_runtime_1.jsx)("input", { type: "checkbox", checked: checked, onChange: e => {
                                                        const next = e.target.checked
                                                            ? [...new Set([...feedBrowseSurfaces, opt.value])]
                                                            : feedBrowseSurfaces.filter(s => s !== opt.value);
                                                        patchFeedBrowse({
                                                            surfaces: next.length ? next : ['reels'],
                                                        });
                                                    } }), opt.label] }, opt.value));
                                    }) }) }), (0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Max items to scan (override)", children: (0, jsx_runtime_1.jsx)(fields_1.NumberInput, { value: Number(config.feedBrowse?.maxItemsToScan ?? 30), onChange: v => patchFeedBrowse({ maxItemsToScan: v }) }) }), (0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Max comments per run (override)", children: (0, jsx_runtime_1.jsx)(fields_1.NumberInput, { value: Number(config.feedBrowse?.maxCommentsPerRun ??
                                        5), onChange: v => patchFeedBrowse({ maxCommentsPerRun: v }) }) }), (0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Min relevance score (0\u20131, override)", hint: "Skip items below this AI match score", children: (0, jsx_runtime_1.jsx)(fields_1.NumberInput, { value: Number(config.feedBrowse?.minRelevanceScore ??
                                        0.55), onChange: v => patchFeedBrowse({ minRelevanceScore: v }) }) })] }))] }));
        case 'mentions':
            return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Mention Username", children: (0, jsx_runtime_1.jsx)(fields_1.Input, { value: String(config.mentionUsername || ''), onChange: e => patchConfig({ mentionUsername: e.target.value }) }) }), (0, jsx_runtime_1.jsx)(fields_1.Field, { label: "Mention Policy", children: (0, jsx_runtime_1.jsx)(fields_1.LabeledSelect, { options: select_options_1.MENTION_POLICY_OPTIONS, value: String(config.mentionPolicy || 'ai_only'), onValueChange: v => patchConfig({ mentionPolicy: v }) }) })] }));
        case 'ai-config':
            return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-8", children: [(0, jsx_runtime_1.jsx)(NoteEditorField_1.NoteEditorField, { label: "Skills / Style Guide", hint: "Define tone, topics, and comment style for this handle.", value: String(account.skills_content || ''), onChange: skills_content => onChange({ ...account, skills_content }), placeholder: "Example: Friendly study tips account. Keep comments short, supportive, and on-topic...", monospace: true, minHeightClass: "min-h-[400px]" }), (0, jsx_runtime_1.jsx)(NoteEditorField_1.NoteEditorField, { label: "AI Prompt Hint", hint: "Extra instructions appended when generating each comment.", value: String(config.aiPromptHint || ''), onChange: aiPromptHint => patchConfig({ aiPromptHint }), placeholder: "Example: Mention our app only when relevant. Avoid hashtags.", minHeightClass: "min-h-[80px]" })] }));
        case 'delays':
            return ((0, jsx_runtime_1.jsx)(fields_1.DelayPair, { label: "Action Delay (seconds)", value: config.actionDelaySeconds || { min: 90, max: 180 }, onChange: actionDelaySeconds => patchConfig({ actionDelaySeconds }) }));
        case 'hashtag-override':
            return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsx)(fields_1.Field, { label: "API fetchBatchSize override", children: (0, jsx_runtime_1.jsx)(fields_1.NumberInput, { value: Number(config.hashtagSearch?.api_search
                                ?.fetchBatchSize ?? 100), onChange: v => patchConfig({
                                hashtagSearch: {
                                    ...config.hashtagSearch,
                                    api_search: {
                                        ...(config.hashtagSearch
                                            ?.api_search),
                                        fetchBatchSize: v,
                                    },
                                },
                            }) }) }), (0, jsx_runtime_1.jsx)(fields_1.Field, { label: "API maxPostsToComment override", children: (0, jsx_runtime_1.jsx)(fields_1.NumberInput, { value: Number(config.hashtagSearch?.api_search
                                ?.maxPostsToComment ?? 5), onChange: v => patchConfig({
                                hashtagSearch: {
                                    ...config.hashtagSearch,
                                    api_search: {
                                        ...(config.hashtagSearch
                                            ?.api_search),
                                        maxPostsToComment: v,
                                    },
                                },
                            }) }) })] }));
        default:
            return null;
    }
}
