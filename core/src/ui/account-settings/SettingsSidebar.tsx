'use client';

export const GLOBAL_GROUPS = [
    { id: 'browser', label: 'Browser' },
    { id: 'ai', label: 'AI Provider' },
    { id: 'timing', label: 'Timing' },
    { id: 'behavior', label: 'Behavior' },
    { id: 'hashtag', label: 'Hashtag Search' },
] as const;

export const ACCOUNT_GROUPS = [
    { id: 'general', label: 'General' },
    { id: 'source-settings', label: 'Source Settings' },
    { id: 'mentions', label: 'Mentions' },
    { id: 'ai-config', label: 'AI Config' },
    { id: 'hashtag-override', label: 'Hashtag Overrides' },
    { id: 'delays', label: 'Delays' },
] as const;

export function getAccountGroups(enabled: boolean) {
    return enabled ? ACCOUNT_GROUPS : ACCOUNT_GROUPS.filter(g => g.id === 'general');
}

export function SettingsSidebar({
    groups,
    active,
    onSelect,
}: {
    groups: readonly { id: string; label: string }[];
    active: string;
    onSelect: (id: string) => void;
}) {
    return (
        <nav className="space-y-1">
            {groups.map(g => (
                <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelect(g.id)}
                    className={
                        active === g.id
                            ? 'w-full rounded-lg bg-primary px-3 py-2 text-left text-sm font-medium text-primary-foreground'
                            : 'w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                    }
                >
                    {g.label}
                </button>
            ))}
        </nav>
    );
}
