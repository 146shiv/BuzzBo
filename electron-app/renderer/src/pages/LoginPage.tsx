import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@buzzbo/ui';

export default function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await window.buzzbo.auth.login(username, password);
            onLoggedIn();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex h-full items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="items-center text-center">
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
                        B
                    </div>
                    <CardTitle className="text-2xl font-semibold">Buzzbo</CardTitle>
                    <CardDescription>Sign in with your Buzzbo account</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                data-testid="login-username"
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
                                data-testid="login-password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />
                        </div>
                        {error && (
                            <p className="text-sm text-destructive" data-testid="login-error">
                                {error}
                            </p>
                        )}
                        <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing in…
                                </>
                            ) : (
                                'Sign in'
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
