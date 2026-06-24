"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoteEditorField = NoteEditorField;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_dom_1 = require("react-dom");
const textareaClass = 'flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';
function ExpandIcon() {
    return ((0, jsx_runtime_1.jsxs)("svg", { xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("path", { d: "M15 3h6v6" }), (0, jsx_runtime_1.jsx)("path", { d: "m21 3-7 7" }), (0, jsx_runtime_1.jsx)("path", { d: "m3 21 7-7" }), (0, jsx_runtime_1.jsx)("path", { d: "M9 21H3v-6" })] }));
}
function NoteEditorModal({ open, title, value, monospace, onClose, onSave, }) {
    const [draft, setDraft] = (0, react_1.useState)(value);
    const textareaId = (0, react_1.useId)();
    (0, react_1.useEffect)(() => {
        if (open)
            setDraft(value);
    }, [open, value]);
    (0, react_1.useEffect)(() => {
        if (!open)
            return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [open]);
    (0, react_1.useEffect)(() => {
        if (!open)
            return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);
    if (!open || typeof document === 'undefined')
        return null;
    return (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsxs)("div", { className: "fixed inset-0 z-[9999]", children: [(0, jsx_runtime_1.jsx)("div", { className: "absolute inset-0 bg-black/50 backdrop-blur-sm", "aria-hidden": true, onClick: onClose }), (0, jsx_runtime_1.jsxs)("div", { role: "dialog", "aria-modal": "true", "aria-label": title, className: "absolute inset-0 flex flex-col bg-background", onClick: e => e.stopPropagation(), children: [(0, jsx_runtime_1.jsx)("textarea", { id: textareaId, autoFocus: true, value: draft, onChange: e => setDraft(e.target.value), className: `min-h-0 flex-1 w-full resize-none border-0 bg-background px-6 py-5 text-sm leading-relaxed text-foreground outline-none focus:ring-0 ${monospace ? 'font-mono text-[13px]' : ''}` }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => {
                            onSave(draft);
                            onClose();
                        }, className: "absolute top-4 right-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90", children: "Done" })] })] }), document.body);
}
function NoteEditorField({ label, hint, value, onChange, placeholder, monospace, minHeightClass = 'min-h-[120px]', }) {
    const [fullOpen, setFullOpen] = (0, react_1.useState)(false);
    const lineCount = value.split('\n').length;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-2", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between gap-3", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-sm font-medium text-foreground", children: label }), (0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => setFullOpen(true), className: "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", children: [(0, jsx_runtime_1.jsx)(ExpandIcon, {}), "Full editor"] })] }), (0, jsx_runtime_1.jsx)("div", { className: "overflow-hidden rounded-lg border border-border/60 bg-muted/10", children: (0, jsx_runtime_1.jsx)("textarea", { value: value, onChange: e => onChange(e.target.value), placeholder: placeholder, className: `${textareaClass} ${minHeightClass} resize-y border-0 bg-transparent shadow-none focus-visible:ring-0 ${monospace ? 'font-mono text-[13px]' : ''}` }) }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between gap-2", children: [hint ? (0, jsx_runtime_1.jsx)("p", { className: "text-xs text-muted-foreground", children: hint }) : (0, jsx_runtime_1.jsx)("span", {}), (0, jsx_runtime_1.jsxs)("p", { className: "shrink-0 text-xs text-muted-foreground", children: [value.length, " chars \u00B7 ", lineCount, " ", lineCount === 1 ? 'line' : 'lines'] })] }), (0, jsx_runtime_1.jsx)(NoteEditorModal, { open: fullOpen, title: label, value: value, monospace: monospace, onClose: () => setFullOpen(false), onSave: onChange })] }));
}
