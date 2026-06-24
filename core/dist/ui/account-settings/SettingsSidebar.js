"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCOUNT_GROUPS = exports.GLOBAL_GROUPS = void 0;
exports.getAccountGroups = getAccountGroups;
exports.SettingsSidebar = SettingsSidebar;
const jsx_runtime_1 = require("react/jsx-runtime");
exports.GLOBAL_GROUPS = [
    { id: 'browser', label: 'Browser' },
    { id: 'ai', label: 'AI Provider' },
    { id: 'timing', label: 'Timing' },
    { id: 'behavior', label: 'Behavior' },
    { id: 'hashtag', label: 'Hashtag Search' },
];
exports.ACCOUNT_GROUPS = [
    { id: 'general', label: 'General' },
    { id: 'source-settings', label: 'Source Settings' },
    { id: 'mentions', label: 'Mentions' },
    { id: 'ai-config', label: 'AI Config' },
    { id: 'hashtag-override', label: 'Hashtag Overrides' },
    { id: 'delays', label: 'Delays' },
];
function getAccountGroups(enabled) {
    return enabled ? exports.ACCOUNT_GROUPS : exports.ACCOUNT_GROUPS.filter(g => g.id === 'general');
}
function SettingsSidebar({ groups, active, onSelect, }) {
    return ((0, jsx_runtime_1.jsx)("nav", { className: "space-y-1", children: groups.map(g => ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => onSelect(g.id), className: active === g.id
                ? 'w-full rounded-lg bg-primary px-3 py-2 text-left text-sm font-medium text-primary-foreground'
                : 'w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', children: g.label }, g.id))) }));
}
