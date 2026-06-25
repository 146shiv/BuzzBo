'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Search, Plus, MoreHorizontal, Ban, Trash2, KeyRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';
import type { UserPublic } from '@/lib/db/types';
import { toast } from 'sonner';
import { ChangePasswordDialog } from '@/components/admin/ChangePasswordDialog';

export function UsersTable() {
    const router = useRouter();
    const [users, setUsers] = useState<UserPublic[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteUser, setDeleteUser] = useState<UserPublic | null>(null);
    const [passwordUser, setPasswordUser] = useState<UserPublic | null>(null);
    const [newUser, setNewUser] = useState({ username: '', password: '', display_name: '' });

    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ sortBy: 'last_used_at', sortDir: 'desc' });
            if (search) params.set('search', search);
            const data = await apiFetch<UserPublic[]>(`/api/admin/users?${params}`);
            setUsers(data);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        const t = setTimeout(loadUsers, 300);
        return () => clearTimeout(t);
    }, [loadUsers]);

    async function handleCreate() {
        try {
            await apiFetch('/api/admin/users', {
                method: 'POST',
                body: JSON.stringify(newUser),
            });
            toast.success('User created');
            setCreateOpen(false);
            setNewUser({ username: '', password: '', display_name: '' });
            loadUsers();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to create user');
        }
    }

    async function toggleDisable(user: UserPublic) {
        try {
            await apiFetch(`/api/admin/users/${user.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ is_disabled: !user.is_disabled }),
            });
            toast.success(user.is_disabled ? 'User enabled' : 'User disabled');
            loadUsers();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to update user');
        }
    }

    async function handleDelete(user: UserPublic) {
        try {
            await apiFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
            toast.success('User deleted');
            setDeleteUser(null);
            loadUsers();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to delete user');
        }
    }

    return (
        <>
            <Card className="overflow-hidden border-border/80 shadow-sm">
                <div className="flex flex-col gap-4 border-b border-border bg-muted/20 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Users</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Manage accounts, configs, and access
                        </p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search users..."
                                className="bg-background pl-9"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
                            <Plus className="mr-2 h-4 w-4" />
                            New User
                        </Button>
                    </div>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
                            <TableHead className="h-11 px-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Username
                            </TableHead>
                            <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Display Name
                            </TableHead>
                            <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Config
                            </TableHead>
                            <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Accounts
                            </TableHead>
                            <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Last Used
                            </TableHead>
                            <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Status
                            </TableHead>
                            <TableHead className="h-11 w-14 px-4" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="px-6 py-10 text-center text-muted-foreground"
                                >
                                    Loading users…
                                </TableCell>
                            </TableRow>
                        ) : users.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="px-6 py-10 text-center text-muted-foreground"
                                >
                                    No users found
                                </TableCell>
                            </TableRow>
                        ) : (
                            users.map(user => (
                                <TableRow
                                    key={user.id}
                                    className="cursor-pointer border-border/60"
                                    onClick={() => router.push(`/users/${user.id}/settings`)}
                                >
                                    <TableCell className="px-6 py-3.5 font-medium">
                                        @{user.username}
                                    </TableCell>
                                    <TableCell className="px-4 py-3.5 text-muted-foreground">
                                        {user.display_name || '—'}
                                    </TableCell>
                                    <TableCell className="px-4 py-3.5 text-muted-foreground">
                                        {user.config_name || '—'}
                                    </TableCell>
                                    <TableCell className="px-4 py-3.5 tabular-nums">
                                        {user.account_count ?? 0}
                                    </TableCell>
                                    <TableCell className="px-4 py-3.5 text-muted-foreground">
                                        {user.last_used_at
                                            ? formatDistanceToNow(new Date(user.last_used_at), {
                                                  addSuffix: true,
                                              })
                                            : 'Never'}
                                    </TableCell>
                                    <TableCell className="px-4 py-3.5">
                                        <Badge
                                            variant={user.is_disabled ? 'destructive' : 'success'}
                                        >
                                            {user.is_disabled ? 'Disabled' : 'Active'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell
                                        className="px-4 py-3.5"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <DropdownMenu>
                                            <DropdownMenuTrigger
                                                render={
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        className="text-muted-foreground"
                                                    >
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                }
                                            />
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() => setPasswordUser(user)}
                                                >
                                                    <KeyRound className="mr-2 h-4 w-4" />
                                                    Change password
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => toggleDisable(user)}
                                                >
                                                    <Ban className="mr-2 h-4 w-4" />
                                                    {user.is_disabled ? 'Enable' : 'Disable'}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={() => setDeleteUser(user)}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            <Dialog open={Boolean(deleteUser)} onOpenChange={open => !open && setDeleteUser(null)}>
                <DialogContent>
                    <DialogHeader className="gap-3">
                        <DialogTitle>Delete user</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete{' '}
                            <span className="font-medium text-foreground">
                                {deleteUser?.username}
                            </span>
                            ? This action cannot be undone and will remove all associated data.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteUser(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => deleteUser && void handleDelete(deleteUser)}
                        >
                            Delete user
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader className="gap-3">
                        <DialogTitle>Create user</DialogTitle>
                        <DialogDescription>
                            Add a new admin user account. They can sign in with the username and
                            password you set here.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Username</Label>
                            <Input
                                value={newUser.username}
                                onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Password</Label>
                            <Input
                                type="password"
                                value={newUser.password}
                                onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Display Name</Label>
                            <Input
                                value={newUser.display_name}
                                onChange={e =>
                                    setNewUser(u => ({ ...u, display_name: e.target.value }))
                                }
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {passwordUser && (
                <ChangePasswordDialog
                    open={Boolean(passwordUser)}
                    onOpenChange={open => {
                        if (!open) setPasswordUser(null);
                    }}
                    userId={passwordUser.id}
                    username={passwordUser.username}
                />
            )}
        </>
    );
}
