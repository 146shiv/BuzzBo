import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    ChevronDown,
    ChevronUp,
    Link2,
    Loader2,
    LogOut,
    Play,
    Settings,
    Square,
    Users,
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
    platform: number;
    sourceMode?: string;
    sessionStatus?: string;
}

const PLATFORM_YOUTUBE = 2;

function platformLabel(platform: number): string {
    return platform === PLATFORM_YOUTUBE ? 'YouTube' : 'Instagram';
}

interface BotStatus {
    running: boolean;
    mode?: string;
    currentUrl?: string;
    accountUsername?: string;
}

interface CampaignStatus {
    running: boolean;
    campaignId?: string;
    currentAccount?: string;
    progress?: {
        pending: number;
        running: number;
        done: number;
        failed: number;
        cancelled: number;
    };
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

function sessionBadgeVariant(status?: string): 'success' | 'muted' | 'destructive' | 'outline' {
    if (status === 'valid') return 'success';
    if (status === 'expired' || status === 'challenged') return 'destructive';
    if (status === 'needs_login') return 'outline';
    return 'muted';
}

function sessionLabel(status?: string): string {
    if (status === 'valid') return 'Connected';
    if (status === 'expired') return 'Expired';
    if (status === 'challenged') return 'Challenge';
    if (status === 'needs_login') return 'Needs login';
    return 'Unknown';
}

export default function DashboardPage({
    username,
    onLogout,
}: {
    username: string;
    onLogout: () => void;
}) {
    const [accounts, setAccounts] = useState<AccountRow[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(true);
    const [selectedId, setSelectedId] = useState('');
    const [status, setStatus] = useState<BotStatus>({ running: false });
    const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>({ running: false });
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [commentsCollapsed, setCommentsCollapsed] = useState(false);
    const [logsCollapsed, setLogsCollapsed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [connectingId, setConnectingId] = useState('');
    const selectedRef = useRef(selectedId);
    selectedRef.current = selectedId;

    const [selectedSourceMode, setSelectedSourceMode] = useState<string>('');

    async function loadAccounts() {
        setAccountsLoading(true);
        try {
            const rows = await window.buzzbo.accounts.list();
            let sessionRows: { platform_account_id: string; status: string }[] = [];
            try {
                sessionRows = (await window.buzzbo.sessions.list()) as {
                    platform_account_id: string;
                    status: string;
                }[];
            } catch {
                /* fallback to local */
            }
            const sessionMap = new Map(sessionRows.map(s => [s.platform_account_id, s.status]));
            const mapped = (rows as Record<string, unknown>[]).map(r => {
                const id = String(r.id);
                let sessionStatus = sessionMap.get(id);
                if (!sessionStatus) {
                    sessionStatus = 'needs_login';
                }
                return {
                    id,
                    username: String(r.username),
                    enabled: Boolean(r.enabled),
                    platform: Number(r.platform ?? 1),
                    sessionStatus,
                };
            });
            setAccounts(mapped);
            const saved = localStorage.getItem('buzzbo-selected-account');
            const pick = mapped.find(a => a.id === saved) ?? mapped[0];
            setSelectedId(pick?.id ?? '');
            if (mapped.length === 0) {
                toast.warning(
                    `No handles for @${username}. Add an Instagram handle in Buzzbo Admin → Users → your user → Manage Accounts.`
                );
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to load accounts');
        } finally {
            setAccountsLoading(false);
        }
    }

    useEffect(() => {
        void loadAccounts();
    }, [username]);

    useEffect(() => {
        if (selectedId) localStorage.setItem('buzzbo-selected-account', selectedId);
    }, [selectedId]);

    useEffect(() => {
        if (!selectedId) {
            setSelectedSourceMode('');
            return;
        }
        void window.buzzbo.accounts.get(selectedId).then(account => {
            const cfg = ((account as Record<string, unknown>).config as Record<string, unknown>) || {};
            setSelectedSourceMode(String(cfg.sourceMode || 'hashtag_list'));
        });
    }, [selectedId, settingsOpen]);

    const sourceModeLabel =
        selectedSourceMode === 'feed_browse'
            ? 'Feed Browse'
            : selectedSourceMode === 'hashtag_list'
              ? 'Hashtag (UI)'
              : selectedSourceMode === 'hashtag_api'
                ? 'Hashtag (API)'
                : selectedSourceMode === 'url_list'
                  ? 'URL List'
                  : selectedSourceMode === 'new_post_added_to_account'
                    ? 'Monitor Profiles'
                    : selectedSourceMode || 'Hashtag (UI)';

    useEffect(() => {
        const unsubStatus = window.buzzbo.bot.onStatus(s => setStatus(s as BotStatus));
        const unsubCampaign = window.buzzbo.campaign.onStatus(s =>
            setCampaignStatus(s as CampaignStatus)
        );
        void window.buzzbo.bot.status().then(s => setStatus(s as BotStatus));
        void window.buzzbo.campaign.status().then(s => setCampaignStatus(s as CampaignStatus));
        return () => {
            unsubStatus();
            unsubCampaign();
        };
    }, []);

    const selected = accounts.find(a => a.id === selectedId);
    const accountOptions = accounts.map(a => ({
        value: a.id,
        label: `@${a.username} (${platformLabel(a.platform)})${!a.enabled ? ' (disabled)' : ''}`,
    }));

    const enabledInstagram = accounts.filter(a => a.enabled && a.platform !== PLATFORM_YOUTUBE);
    const youtubeStartBlocked =
        selected?.platform === PLATFORM_YOUTUBE && selectedSourceMode !== 'url_list';
    const connectLabel =
        selected?.platform === PLATFORM_YOUTUBE ? 'Connect YouTube' : 'Connect Instagram';
    const allConnected =
        enabledInstagram.length > 0 &&
        enabledInstagram.every(a => a.sessionStatus === 'valid');
    const anyRunning = status.running || campaignStatus.running;

    async function handleStart() {
        if (!selectedId || !selected?.enabled) return;
        if (youtubeStartBlocked) {
            toast.error('YouTube accounts require URL List source mode. Update handle settings.');
            return;
        }
        setBusy(true);
        try {
            await window.buzzbo.bot.start(selectedId);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to start bot');
        } finally {
            setBusy(false);
        }
    }

    async function handleStartCampaign() {
        if (!allConnected) {
            toast.error('Connect Instagram for all enabled accounts before starting a campaign.');
            return;
        }
        setBusy(true);
        try {
            await window.buzzbo.campaign.start({ name: 'Campaign' });
            toast.success('Campaign started');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to start campaign');
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

    async function handleStopCampaign() {
        setBusy(true);
        try {
            await window.buzzbo.campaign.stop();
        } finally {
            setBusy(false);
        }
    }

    async function handleConnect(accountId: string) {
        setConnectingId(accountId);
        try {
            const result = (await window.buzzbo.account.connect(accountId)) as {
                ok: boolean;
                error?: string;
            };
            if (!result.ok) {
                toast.error(result.error || 'Connect failed');
            } else {
                toast.success(
                    accounts.find(a => a.id === accountId)?.platform === PLATFORM_YOUTUBE
                        ? 'YouTube session saved'
                        : 'Instagram session saved'
                );
                await loadAccounts();
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Connect failed');
        } finally {
            setConnectingId('');
        }
    }

    async function handleLogout() {
        await window.buzzbo.bot.stop();
        await window.buzzbo.auth.logout();
        onLogout();
    }

    const progress = campaignStatus.progress;
    const progressLabel = progress
        ? `${progress.done} done · ${progress.pending} pending · ${progress.failed} failed`
        : '';

    return (
        <div className="flex h-full flex-col bg-background text-foreground">
            <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/60 bg-card/40 px-4 py-2.5 backdrop-blur-md">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                        B
                    </span>
                    <span className="text-base font-semibold text-primary">Buzzbo</span>
                </div>

                <Separator orientation="vertical" className="mx-1 h-6" />

                <div className="flex min-w-0 items-center gap-2" data-testid="handle-dropdown">
                    {accountsLoading ? (
                        <div className="flex h-9 w-[240px] items-center justify-center rounded-md border border-border/60 bg-muted/30 text-xs text-muted-foreground">
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            Loading handles…
                        </div>
                    ) : accounts.length === 0 ? (
                        <div className="flex max-w-md items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                            <span>No handles — add one in Buzzbo Admin</span>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => void window.buzzbo.shell.openExternal('http://localhost:3000/dashboard')}
                            >
                                Open Admin
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => void loadAccounts()}>
                                Refresh
                            </Button>
                        </div>
                    ) : (
                        <LabeledSelect
                            options={accountOptions}
                            value={selectedId}
                            onValueChange={v => v && setSelectedId(v)}
                            triggerClassName="w-[240px]"
                            placeholder="Select account"
                        />
                    )}
                    {selected && !selected.enabled && <Badge variant="muted">Disabled</Badge>}
                    {selected && (
                        <Badge variant="outline">{platformLabel(selected.platform)}</Badge>
                    )}
                    {selected && (
                        <Badge variant={sessionBadgeVariant(selected.sessionStatus)}>
                            {sessionLabel(selected.sessionStatus)}
                        </Badge>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {campaignStatus.running ? (
                        <Badge variant="success" data-testid="campaign-running-badge">
                            Campaign
                            {campaignStatus.currentAccount
                                ? ` · @${campaignStatus.currentAccount}`
                                : ''}
                        </Badge>
                    ) : status.running ? (
                        <Badge variant="success" data-testid="bot-running-badge">
                            Running{status.mode ? ` · ${status.mode}` : ''}
                        </Badge>
                    ) : (
                        <Badge variant="muted">Idle</Badge>
                    )}
                    {progressLabel && campaignStatus.running && (
                        <Badge variant="outline">{progressLabel}</Badge>
                    )}
                    {selectedId && !anyRunning && (
                        <Badge variant="outline" title="Source mode for next run">
                            Mode: {sourceModeLabel}
                        </Badge>
                    )}
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={handleStartCampaign}
                        disabled={busy || anyRunning || !allConnected || enabledInstagram.length === 0}
                        data-testid="campaign-start"
                    >
                        <Users className="h-4 w-4" />
                        Start Campaign
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleStopCampaign}
                        disabled={busy || !campaignStatus.running}
                        data-testid="campaign-stop"
                    >
                        <Square className="h-4 w-4" />
                        Stop Campaign
                    </Button>
                    <Button
                        type="button"
                        variant="success"
                        size="sm"
                        onClick={handleStart}
                        disabled={busy || anyRunning || !selected?.enabled || youtubeStartBlocked}
                        title={
                            youtubeStartBlocked
                                ? 'YouTube accounts only support URL List source mode'
                                : undefined
                        }
                        data-testid="bot-start"
                    >
                        {busy && !anyRunning ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Play className="h-4 w-4" />
                        )}
                        Start One
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
                        Stop One
                    </Button>
                    {selectedId && selected?.sessionStatus !== 'valid' && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleConnect(selectedId)}
                            disabled={!!connectingId}
                            data-testid="connect-instagram"
                        >
                            {connectingId === selectedId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Link2 className="h-4 w-4" />
                            )}
                            {connectLabel}
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        onClick={() => {
                            if (!selectedId) {
                                toast.error('Select a handle first. Add one in Buzzbo Admin if the list is empty.');
                                return;
                            }
                            setSettingsOpen(true);
                        }}
                        disabled={!selectedId}
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

            {accounts.length > 0 && (
                <div className="flex shrink-0 flex-wrap gap-2 border-b border-border/40 px-4 py-2">
                    {accounts.map(a => (
                        <div
                            key={a.id}
                            className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/20 px-2 py-1 text-xs"
                        >
                            <span className="font-medium">@{a.username}</span>
                            <Badge variant="outline" className="text-[10px]">
                                {platformLabel(a.platform)}
                            </Badge>
                            <Badge variant={sessionBadgeVariant(a.sessionStatus)} className="text-[10px]">
                                {sessionLabel(a.sessionStatus)}
                            </Badge>
                            {a.enabled && a.sessionStatus !== 'valid' && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5 text-[10px]"
                                    disabled={connectingId === a.id}
                                    onClick={() => void handleConnect(a.id)}
                                >
                                    Connect
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            )}

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
