'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export function LoginForm() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            const data = await apiFetch<{ user: { role: string } }>('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            });
            if (data.user.role === 'admin') {
                router.push('/dashboard');
            } else {
                toast.error('Admin access required');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center p-4">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.52_0.11_175/0.1),transparent),radial-gradient(ellipse_50%_40%_at_100%_0%,oklch(0.55_0.14_155/0.06),transparent)]" />
            <Card className="relative w-full max-w-md border-border/80 shadow-xl">
                <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl bg-gradient-to-r from-primary/60 via-primary to-primary/30" />
                <CardHeader className="items-center pt-8 text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-lg shadow-primary/25">
                        B
                    </div>
                    <CardTitle className="text-2xl font-bold">Buzzbo Admin</CardTitle>
                    <CardDescription>Sign in to manage users and configurations</CardDescription>
                </CardHeader>
                <CardContent className="pb-8">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                autoComplete="username"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />
                        </div>
                        <Button type="submit" className="mt-2 w-full" size="lg" disabled={loading}>
                            {loading ? 'Signing in...' : 'Sign in'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
