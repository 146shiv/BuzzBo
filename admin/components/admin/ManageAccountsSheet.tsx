'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { LabeledSelect } from '@/components/ui/select';
import { PLATFORM_OPTIONS } from '@/lib/select-options';
import { PLATFORM_LABELS, Platform } from '@/lib/db/types';
import type { DbPlatformAccount } from '@/lib/db/types';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    accounts: DbPlatformAccount[];
    onUpdated: () => void;
}

export function ManageAccountsSheet({ open, onOpenChange, userId, accounts, onUpdated }: Props) {
    const [form, setForm] = useState({
        platform: Platform.Instagram,
        username: '',
        enabled: true,
    });

    async function handleCreate() {
        if (!form.username.trim()) {
            toast.error('Username is required');
            return;
        }
        try {
            await apiFetch(`/api/admin/users/${userId}/accounts`, {
                method: 'POST',
                body: JSON.stringify({ ...form, username: form.username.trim() }),
            });
            toast.success('Account created');
            setForm({ platform: Platform.Instagram, username: '', enabled: true });
            onUpdated();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to create account');
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this platform account?')) return;
        try {
            await apiFetch(`/api/admin/accounts/${id}`, { method: 'DELETE' });
            toast.success('Account deleted');
            onUpdated();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to delete account');
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md">
                <SheetHeader className="shrink-0 border-b border-border px-6 py-5">
                    <SheetTitle>Manage Accounts</SheetTitle>
                    <SheetDescription>
                        Add or remove platform accounts for this user.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto bg-card px-6 py-6">
                    <section className="rounded-xl border border-border bg-background shadow-sm">
                        <div className="border-b border-border px-5 py-4">
                            <h3 className="text-sm font-semibold">Add Account</h3>
                        </div>
                        <div className="space-y-4 px-5 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="platform-select">Platform</Label>
                                <LabeledSelect
                                    options={PLATFORM_OPTIONS}
                                    triggerClassName="w-full"
                                    value={String(form.platform)}
                                    onValueChange={v =>
                                        setForm(f => ({ ...f, platform: Number(v) as Platform }))
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="account-username">Username</Label>
                                <Input
                                    id="account-username"
                                    value={form.username}
                                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                                    placeholder="handle without @"
                                />
                            </div>
                        </div>
                        <div className="border-t border-border bg-muted/30 px-5 py-4">
                            <Button className="w-full" onClick={handleCreate}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Account
                            </Button>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold">Existing Accounts</h3>
                        {accounts.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                                No accounts yet. Add one above to get started.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {accounts.map(acc => (
                                    <li
                                        key={acc.id}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-sm"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">
                                                @{acc.username}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {PLATFORM_LABELS[acc.platform]}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => handleDelete(acc.id)}
                                            aria-label={`Delete @${acc.username}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </SheetContent>
        </Sheet>
    );
}
