'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save, Settings2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    LabeledSelect,
    SelectItem,
} from '@/components/ui/select';
import { AdminShell } from '@/components/admin/AdminShell';
import { SettingsSidebar, GLOBAL_GROUPS, getAccountGroups } from '@/components/admin/SettingsSidebar';
import { GlobalSettingsPanel, AccountSettingsPanel } from '@/components/admin/SettingsPanels';
import { validateAccountSettings } from '@buzzbo/core/ui/account-settings';
import { ManageAccountsSheet } from '@/components/admin/ManageAccountsSheet';
import { ChangePasswordDialog } from '@/components/admin/ChangePasswordDialog';
import { apiFetch } from '@/lib/api';
import { DEFAULT_SETTINGS, type SettingsConfig } from '@shared/config-types';
import type { DbConfiguration, DbPlatformAccount, UserPublic } from '@/lib/db/types';
import { PLATFORM_LABELS } from '@/lib/db/types';
import { toast } from 'sonner';

export function AppSettingsPage({ userId }: { userId: string }) {
    const [user, setUser] = useState<UserPublic | null>(null);
    const [configurations, setConfigurations] = useState<DbConfiguration[]>([]);
    const [settings, setSettings] = useState<SettingsConfig>(DEFAULT_SETTINGS);
    const [configId, setConfigId] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<DbPlatformAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string | 'global'>('global');
    const [accountDraft, setAccountDraft] = useState<Record<string, unknown> | null>(null);
    const [activeGroup, setActiveGroup] = useState('browser');
    const [manageOpen, setManageOpen] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    const load = useCallback(async () => {
        const [userData, configs, accountList] = await Promise.all([
            apiFetch<UserPublic>(`/api/admin/users/${userId}`),
            apiFetch<DbConfiguration[]>('/api/admin/configurations'),
            apiFetch<DbPlatformAccount[]>(`/api/admin/users/${userId}/accounts`),
        ]);
        setUser(userData);
        setConfigurations(configs);
        setConfigId(userData.config_id);
        setAccounts(accountList);

        if (userData.config_id) {
            const cfg = configs.find(c => c.id === userData.config_id);
            if (cfg) setSettings(cfg.settings);
        } else if (configs[0]) {
            setSettings(configs[0].settings);
        }
    }, [userId]);

    useEffect(() => {
        load().catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load'));
    }, [load]);

    useEffect(() => {
        if (selectedAccountId === 'global') {
            setActiveGroup('browser');
            setAccountDraft(null);
        } else {
            const acc = accounts.find(a => a.id === selectedAccountId);
            if (acc) {
                setAccountDraft({ ...acc, config: { ...acc.config } });
                setActiveGroup('general');
            }
        }
    }, [selectedAccountId, accounts]);

    const accountEnabled = Boolean(accountDraft?.enabled);
    const accountGroups = getAccountGroups(accountEnabled);

    useEffect(() => {
        if (selectedAccountId !== 'global' && !accountEnabled && activeGroup !== 'general') {
            setActiveGroup('general');
        }
    }, [selectedAccountId, accountEnabled, activeGroup]);

    async function saveConfigAssignment(id: string | null) {
        await apiFetch(`/api/admin/users/${userId}/config`, {
            method: 'PATCH',
            body: JSON.stringify({ config_id: id }),
        });
        setConfigId(id);
    }

    async function handleSave() {
        if (selectedAccountId !== 'global' && accountDraft) {
            const validationError = validateAccountSettings(accountDraft);
            if (validationError) {
                toast.error(validationError);
                return;
            }
        }
        setSaving(true);
        try {
            if (selectedAccountId === 'global') {
                if (configId) {
                    await apiFetch(`/api/admin/configurations/${configId}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ settings }),
                    });
                } else {
                    const created = await apiFetch<DbConfiguration>('/api/admin/configurations', {
                        method: 'POST',
                        body: JSON.stringify({ name: `${user?.username || 'User'} Config`, settings }),
                    });
                    await saveConfigAssignment(created.id);
                    setConfigurations(prev => [...prev, created]);
                }
            } else if (accountDraft) {
                await apiFetch(`/api/admin/accounts/${selectedAccountId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        username: accountDraft.username,
                        enabled: accountDraft.enabled,
                        config: accountDraft.config,
                        skills_content: accountDraft.skills_content,
                        post_urls: accountDraft.post_urls,
                    }),
                });
                await load();
            }
            setDirty(false);
            toast.success('Settings saved');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    }

    const groups = selectedAccountId === 'global' ? GLOBAL_GROUPS : accountGroups;
    const configOptions = configurations.map(c => ({ value: c.id, label: c.name }));
    const accountOptions = [
        { value: 'global', label: 'Global Settings' },
        ...accounts.map(a => ({
            value: a.id,
            label: (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                    <span className="truncate font-medium">@{a.username}</span>
                    <span className="shrink-0 text-muted-foreground">
                        · {PLATFORM_LABELS[a.platform]}
                    </span>
                </span>
            ),
        })),
    ];

    return (
        <AdminShell
            title="Settings"
            breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }]}
        >
            <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">
                    {user?.username ? `@${user.username}` : 'Settings'}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {user?.display_name || 'User configuration and accounts'}
                </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
                <LabeledSelect
                    options={configOptions}
                    triggerClassName="w-[200px]"
                    placeholder="Config template"
                    value={configId || ''}
                    onValueChange={async v => {
                        const id = v || null;
                        await saveConfigAssignment(id);
                        const cfg = configurations.find(c => c.id === id);
                        if (cfg) setSettings(cfg.settings);
                        setDirty(false);
                        toast.success('Configuration assigned');
                    }}
                />

                <LabeledSelect
                    options={accountOptions}
                    triggerClassName="w-[280px]"
                    placeholder="Select account"
                    value={selectedAccountId}
                    onValueChange={v => {
                        if (!v || v === '__manage__') {
                            if (v === '__manage__') setManageOpen(true);
                            return;
                        }
                        setSelectedAccountId(v);
                    }}
                >
                    <SelectItem value="__manage__">Manage Accounts...</SelectItem>
                </LabeledSelect>

                <Button variant="outline" onClick={() => setPasswordOpen(true)} disabled={!user}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Change password
                </Button>

                <Button onClick={handleSave} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Saving...' : 'Save'}
                </Button>
            </div>

            <Card className="overflow-hidden border-border/80 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Settings2 className="h-4 w-4 text-primary" />
                        {selectedAccountId === 'global'
                            ? 'Global Configuration'
                            : `Account: @${accountDraft?.username || ''}`}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="grid min-h-[480px] md:grid-cols-[240px_1fr]">
                        <div className="border-r border-border bg-muted/30 p-4">
                                <SettingsSidebar
                                    groups={groups}
                                    active={activeGroup}
                                    onSelect={setActiveGroup}
                                />
                            </div>
                            <div className="p-6">
                                {selectedAccountId === 'global' ? (
                                    <GlobalSettingsPanel
                                        group={activeGroup}
                                        settings={settings}
                                        onChange={s => {
                                            setSettings(s);
                                            setDirty(true);
                                        }}
                                    />
                                ) : accountDraft ? (
                                    <AccountSettingsPanel
                                        group={activeGroup}
                                        account={accountDraft}
                                        onChange={a => {
                                            setAccountDraft(a);
                                            setDirty(true);
                                        }}
                                    />
                                ) : null}
                            </div>
                        </div>
                    </CardContent>
                </Card>

            <ManageAccountsSheet
                open={manageOpen}
                onOpenChange={setManageOpen}
                userId={userId}
                accounts={accounts}
                onUpdated={load}
            />

            {user && (
                <ChangePasswordDialog
                    open={passwordOpen}
                    onOpenChange={setPasswordOpen}
                    userId={user.id}
                    username={user.username}
                />
            )}
        </AdminShell>
    );
}
