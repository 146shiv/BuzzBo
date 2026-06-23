"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Field = Field;
exports.Input = Input;
exports.Textarea = Textarea;
exports.LabeledSelect = LabeledSelect;
exports.NumberInput = NumberInput;
exports.DelayPair = DelayPair;
const jsx_runtime_1 = require("react/jsx-runtime");
const inputClass = 'flex h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-sm text-slate-100 shadow-sm';
const textareaClass = 'flex min-h-[80px] w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100';
const labelClass = 'text-sm font-medium text-slate-200';
const hintClass = 'text-xs text-slate-400';
function Field({ label, children, hint, }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-2", children: [(0, jsx_runtime_1.jsx)("label", { className: labelClass, children: label }), children, hint && (0, jsx_runtime_1.jsx)("p", { className: hintClass, children: hint })] }));
}
function Input(props) {
    return (0, jsx_runtime_1.jsx)("input", { className: inputClass, ...props });
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
