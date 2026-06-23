'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

const MIN_PASSWORD_LENGTH = 6;

export function ChangePasswordDialog({
    open,
    onOpenChange,
    userId,
    username,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    username: string;
    onSuccess?: () => void;
}) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [saving, setSaving] = useState(false);

    function resetForm() {
        setPassword('');
        setConfirmPassword('');
    }

    function handleOpenChange(next: boolean) {
        if (!next) resetForm();
        onOpenChange(next);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (password.length < MIN_PASSWORD_LENGTH) {
            toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
            return;
        }
        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        setSaving(true);
        try {
            await apiFetch(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                body: JSON.stringify({ password }),
            });
            toast.success(`Password updated for @${username}`);
            handleOpenChange(false);
            onSuccess?.();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update password');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <DialogHeader className="gap-3">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <KeyRound className="size-5" />
                        </div>
                        <div className="space-y-1.5">
                            <DialogTitle>Change password</DialogTitle>
                            <DialogDescription>
                                Set a new password for{' '}
                                <span className="font-medium text-foreground">@{username}</span>.
                                Minimum {MIN_PASSWORD_LENGTH} characters.
                            </DialogDescription>
                        </div>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="new-password">New password</Label>
                            <Input
                                id="new-password"
                                type="password"
                                autoComplete="new-password"
                                placeholder="Enter new password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                minLength={MIN_PASSWORD_LENGTH}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirm password</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                autoComplete="new-password"
                                placeholder="Re-enter new password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                required
                                minLength={MIN_PASSWORD_LENGTH}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Saving...' : 'Update password'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
