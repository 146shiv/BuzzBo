import { useCallback, useEffect, useState } from 'react';
import { Skeleton, Toaster } from '@buzzbo/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
    const [session, setSession] = useState<{ username: string } | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshSession = useCallback(async () => {
        const stored = await window.buzzbo.auth.session();
        setSession(stored ? { username: stored.username } : null);
        setLoading(false);
    }, []);

    useEffect(() => {
        void refreshSession();
    }, [refreshSession]);

    if (loading) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-4 w-32" />
            </div>
        );
    }

    return (
        <div className="h-full">
            {!session ? (
                <LoginPage onLoggedIn={refreshSession} />
            ) : (
                <DashboardPage username={session.username} onLogout={refreshSession} />
            )}
            <Toaster theme="dark" position="top-right" richColors />
        </div>
    );
}
