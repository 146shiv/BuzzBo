import { useEffect, useRef, useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    Loader2,
    LogOut,
    Play,
    Settings,
    Square,
} from 'lucide-react';
import {
    Badge,
    Button,
    Card,
    LabeledSelect,
    Separator,
} from '@buzzbo/ui';
import CommentActivityPanel from '@/components/CommentActivityPanel';
import BotLogPanel from '@/components/BotLogPanel';
import SettingsDrawer from '@/components/SettingsDrawer';

interface AccountRow {
    id: string;
    username: string;
    enabled: boolean;
}

interface BotStatus {
    running: boolean;
    mode?: string;
    currentUrl?: string;
    accountUsername?: string;
}

function PanelHeader({
    title,
    collapsed,
    onToggle,
    testId,
}: {
    title: string;
    collapsed: boolean;
    onToggle: () => void;
    testId: string;
}) {
    return (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onToggle}
                aria-expanded={!collapsed}
                aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            >
                {collapsed ? (
                    <ChevronDown className="h-4 w-4" />
                ) : (
                    <ChevronUp className="h-4 w-4" />
                )}
            </Button>
            <h2 className="text-sm font-semibold tracking-tight" data-testid={testId}>
                {title}
            </h2>
        </div>
    );
}

export default function DashboardPage({
    username,
    onLogout,
}: {
    username: string;
    onLogout: () => void;
}) {
    const [accounts, setAccounts] = useState<AccountRow[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [status, setStatus] = useState<BotStatus>({ running: false });
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [commentsCollapsed, setCommentsCollapsed] = useState(false);
    const [logsCollapsed, setLogsCollapsed] = useState(false);
    const [busy, setBusy] = useState(false);
    const selectedRef = useRef(selectedId);
    selectedRef.current = selectedId;

    useEffect(() => {
        void window.buzzbo.accounts.list().then(rows => {
            const mapped = (rows as Record<string, unknown>[]).map(r => ({
                id: String(r.id),
                username: String(r.username),
                enabled: Boolean(r.enabled),
            }));
            setAccounts(mapped);
            const saved = localStorage.getItem('buzzbo-selected-account');
            const pick = mapped.find(a => a.id === saved) ?? mapped[0];
            if (pick) setSelectedId(pick.id);
        });
    }, []);

    useEffect(() => {
        if (selectedId) localStorage.setItem('buzzbo-selected-account', selectedId);
    }, [selectedId]);

    useEffect(() => {
        const unsubStatus = window.buzzbo.bot.onStatus(s => setStatus(s as BotStatus));
        void window.buzzbo.bot.status().then(s => setStatus(s as BotStatus));
        return () => {
            unsubStatus();
        };
    }, []);

    const selected = accounts.find(a => a.id === selectedId);
    const accountOptions = accounts.map(a => ({
        value: a.id,
        label: `@${a.username}${!a.enabled ? ' (disabled)' : ''}`,
    }));

    async function handleStart() {
        if (!selectedId || !selected?.enabled) return;
        setBusy(true);
        try {
            await window.buzzbo.bot.start(selectedId);
        } finally {
            setBusy(false);
        }
    }

    async function handleStop() {
        setBusy(true);
        try {
            await window.buzzbo.bot.stop();
        } finally {
            setBusy(false);
        }
    }

    async function handleLogout() {
        await window.buzzbo.bot.stop();
        await window.buzzbo.auth.logout();
        onLogout();
    }

    return (
        <div className="flex h-full flex-col bg-background text-foreground">
            <header className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-card/40 px-4 py-2.5 backdrop-blur-md">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                        B
                    </span>
                    <span className="text-base font-semibold text-primary">Buzzbo</span>
                </div>

                <Separator orientation="vertical" className="mx-1 h-6" />

                <div className="flex min-w-0 items-center gap-2" data-testid="handle-dropdown">
                    <LabeledSelect
                        options={accountOptions}
                        value={selectedId}
                        onValueChange={v => v && setSelectedId(v)}
                        triggerClassName="w-[240px]"
                        placeholder="Select account"
                    />
                    {selected && !selected.enabled && <Badge variant="muted">Disabled</Badge>}
                </div>

                <div className="flex items-center gap-2">
                    {status.running ? (
                        <Badge variant="success" data-testid="bot-running-badge">
                            Running
                        </Badge>
                    ) : (
                        <Badge variant="muted">Idle</Badge>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        type="button"
                        variant="success"
                        size="sm"
                        onClick={handleStart}
                        disabled={busy || status.running || !selected?.enabled}
                        data-testid="bot-start"
                    >
                        {busy && !status.running ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Play className="h-4 w-4" />
                        )}
                        Start
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleStop}
                        disabled={busy || !status.running}
                        data-testid="bot-stop"
                    >
                        <Square className="h-4 w-4" />
                        Stop
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        onClick={() => setSettingsOpen(true)}
                        data-testid="open-settings"
                        aria-label="Open settings"
                    >
                        <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleLogout}
                        data-testid="logout"
                    >
                        <LogOut className="h-4 w-4" />
                        Logout
                    </Button>
                </div>
            </header>

            <main
                className="flex min-h-0 flex-1 flex-col gap-3 p-4"
                data-testid="dashboard-main"
            >
                <Card
                    className={
                        commentsCollapsed
                            ? 'flex shrink-0 flex-col overflow-hidden'
                            : 'flex min-h-0 flex-1 flex-col overflow-hidden'
                    }
                >
                    <PanelHeader
                        title="Comment Activity"
                        collapsed={commentsCollapsed}
                        onToggle={() => setCommentsCollapsed(c => !c)}
                        testId="comments-panel-header"
                    />
                    {!commentsCollapsed && (
                        <CommentActivityPanel accountId={selectedId} />
                    )}
                </Card>

                <Card
                    className={
                        logsCollapsed
                            ? 'flex shrink-0 flex-col overflow-hidden'
                            : 'flex min-h-0 flex-1 flex-col overflow-hidden'
                    }
                >
                    <PanelHeader
                        title="Bot Logs"
                        collapsed={logsCollapsed}
                        onToggle={() => setLogsCollapsed(c => !c)}
                        testId="logs-panel-header"
                    />
                    {!logsCollapsed && <BotLogPanel />}
                </Card>
            </main>

            <SettingsDrawer
                open={settingsOpen}
                accountId={selectedId}
                onClose={() => setSettingsOpen(false)}
            />
            <p className="sr-only" data-testid="signed-in-user">
                {username}
            </p>
        </div>
    );
}
