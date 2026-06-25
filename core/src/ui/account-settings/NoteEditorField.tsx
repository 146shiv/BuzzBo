'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';

const textareaClass =
    'flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

function ExpandIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M15 3h6v6" />
            <path d="m21 3-7 7" />
            <path d="m3 21 7-7" />
            <path d="M9 21H3v-6" />
        </svg>
    );
}

function NoteEditorModal({
    open,
    title,
    value,
    monospace,
    onClose,
    onSave,
}: {
    open: boolean;
    title: string;
    value: string;
    monospace?: boolean;
    onClose: () => void;
    onSave: (next: string) => void;
}) {
    const [draft, setDraft] = useState(value);
    const textareaId = useId();

    useEffect(() => {
        if (open) setDraft(value);
    }, [open, value]);

    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999]">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                aria-hidden
                onClick={onClose}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="absolute inset-0 flex flex-col bg-background"
                onClick={e => e.stopPropagation()}
            >
                <textarea
                    id={textareaId}
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    className={`min-h-0 flex-1 w-full resize-none border-0 bg-background px-6 py-5 text-sm leading-relaxed text-foreground outline-none focus:ring-0 ${monospace ? 'font-mono text-[13px]' : ''}`}
                />
                <button
                    type="button"
                    onClick={() => {
                        onSave(draft);
                        onClose();
                    }}
                    className="absolute top-4 right-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
                >
                    Done
                </button>
            </div>
        </div>,
        document.body
    );
}

export function NoteEditorField({
    label,
    hint,
    value,
    onChange,
    placeholder,
    monospace,
    minHeightClass = 'min-h-[120px]',
}: {
    label: string;
    hint?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    monospace?: boolean;
    minHeightClass?: string;
}) {
    const [fullOpen, setFullOpen] = useState(false);
    const lineCount = value.split('\n').length;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-foreground">{label}</label>
                <button
                    type="button"
                    onClick={() => setFullOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <ExpandIcon />
                    Full editor
                </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/10">
                <textarea
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    className={`${textareaClass} ${minHeightClass} resize-y border-0 bg-transparent shadow-none focus-visible:ring-0 ${monospace ? 'font-mono text-[13px]' : ''}`}
                />
            </div>
            <div className="flex items-center justify-between gap-2">
                {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : <span />}
                <p className="shrink-0 text-xs text-muted-foreground">
                    {value.length} chars · {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                </p>
            </div>
            <NoteEditorModal
                open={fullOpen}
                title={label}
                value={value}
                monospace={monospace}
                onClose={() => setFullOpen(false)}
                onSave={onChange}
            />
        </div>
    );
}
