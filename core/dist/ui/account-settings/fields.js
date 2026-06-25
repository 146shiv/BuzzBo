"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.Field = Field;
exports.Input = Input;
exports.SecretInput = SecretInput;
exports.Textarea = Textarea;
exports.LabeledSelect = LabeledSelect;
exports.NumberInput = NumberInput;
exports.DelayPair = DelayPair;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const inputClass = 'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';
const textareaClass = 'flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';
const labelClass = 'text-sm font-medium text-foreground';
const hintClass = 'text-xs text-muted-foreground';
function Field({ label, children, hint, required, }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-2", children: [(0, jsx_runtime_1.jsxs)("label", { className: labelClass, children: [label, required && (0, jsx_runtime_1.jsx)("span", { className: "ml-1 text-destructive", children: "*" })] }), children, hint && (0, jsx_runtime_1.jsx)("p", { className: hintClass, children: hint })] }));
}
function Input(props) {
    return (0, jsx_runtime_1.jsx)("input", { className: inputClass, ...props });
}
function SecretInput(props) {
    const [visible, setVisible] = (0, react_1.useState)(false);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "relative", children: [(0, jsx_runtime_1.jsx)(Input, { ...props, type: visible ? 'text' : 'password', className: `${props.className ?? ''} pr-16`.trim(), autoComplete: "off" }), (0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": visible ? 'Hide key' : 'View key', className: "absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground", onClick: () => setVisible(v => !v), children: visible ? 'Hide' : 'View' })] }));
}
function Textarea(props) {
    return (0, jsx_runtime_1.jsx)("textarea", { className: textareaClass, ...props });
}
function LabeledSelect({ options, value, onValueChange, }) {
    return ((0, jsx_runtime_1.jsx)("select", { className: inputClass, value: value, onChange: e => onValueChange(e.target.value), children: options.map(o => ((0, jsx_runtime_1.jsx)("option", { value: o.value, children: o.label }, o.value))) }));
}
function NumberInput({ value, onChange, }) {
    return ((0, jsx_runtime_1.jsx)(Input, { type: "number", value: value, onChange: e => onChange(Number(e.target.value)) }));
}
function DelayPair({ label, value, onChange, }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "grid gap-4 sm:grid-cols-2", children: [(0, jsx_runtime_1.jsx)(Field, { label: `${label} Min`, children: (0, jsx_runtime_1.jsx)(NumberInput, { value: value.min, onChange: min => onChange({ ...value, min }) }) }), (0, jsx_runtime_1.jsx)(Field, { label: `${label} Max`, children: (0, jsx_runtime_1.jsx)(NumberInput, { value: value.max, onChange: max => onChange({ ...value, max }) }) })] }));
}
