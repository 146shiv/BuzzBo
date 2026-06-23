"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCOUNT_GROUPS = exports.GLOBAL_GROUPS = void 0;
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
    { id: 'content', label: 'Content' },
    { id: 'mentions', label: 'Mentions' },
    { id: 'ai-hint', label: 'AI Hint' },
    { id: 'hashtag-override', label: 'Hashtag Overrides' },
    { id: 'api-creds', label: 'API Credentials' },
    { id: 'delays', label: 'Delays' },
];
function SettingsSidebar({ groups, active, onSelect, }) {
    return ((0, jsx_runtime_1.jsx)("nav", { className: "space-y-1", children: groups.map(g => ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => onSelect(g.id), className: active === g.id
                ? 'w-full rounded-md bg-violet-600 px-3 py-2 text-left text-sm text-white'
                : 'w-full rounded-md px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100', children: g.label }, g.id))) }));
}
