'use client';

import { useState } from 'react';

const inputClass =
    'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';
const textareaClass =
    'flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';
const labelClass = 'text-sm font-medium text-foreground';
const hintClass = 'text-xs text-muted-foreground';

export function Field({
    label,
    children,
    hint,
    required,
}: {
    label: string;
    children: React.ReactNode;
    hint?: string;
    required?: boolean;
}) {
    return (
        <div className="space-y-2">
            <label className={labelClass}>
                {label}
                {required && <span className="ml-1 text-destructive">*</span>}
            </label>
            {children}
            {hint && <p className={hintClass}>{hint}</p>}
        </div>
    );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input className={inputClass} {...props} />;
}

export function SecretInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative">
            <Input
                {...props}
                type={visible ? 'text' : 'password'}
                className={`${props.className ?? ''} pr-16`.trim()}
                autoComplete="off"
            />
            <button
                type="button"
                aria-label={visible ? 'Hide key' : 'View key'}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setVisible(v => !v)}
            >
                {visible ? 'Hide' : 'View'}
            </button>
        </div>
    );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea className={textareaClass} {...props} />;
}

export function LabeledSelect({
    options,
    value,
    onValueChange,
}: {
    options: { value: string; label: string }[];
    value: string;
    onValueChange: (v: string) => void;
}) {
    return (
        <select className={inputClass} value={value} onChange={e => onValueChange(e.target.value)}>
            {options.map(o => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}

export function NumberInput({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <Input
            type="number"
            value={value}
            onChange={e => onChange(Number(e.target.value))}
        />
    );
}

export function DelayPair({
    label,
    value,
    onChange,
}: {
    label: string;
    value: { min: number; max: number };
    onChange: (v: { min: number; max: number }) => void;
}) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${label} Min`}>
                <NumberInput value={value.min} onChange={min => onChange({ ...value, min })} />
            </Field>
            <Field label={`${label} Max`}>
                <NumberInput value={value.max} onChange={max => onChange({ ...value, max })} />
            </Field>
        </div>
    );
}
