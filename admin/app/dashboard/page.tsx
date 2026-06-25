import { AdminShell } from '@/components/admin/AdminShell';
import { StatsCards } from '@/components/admin/StatsCards';
import { UsersTable } from '@/components/admin/UsersTable';
import { getRepositories } from '@/lib/db';

export default async function DashboardPage() {
    let stats = {
        totalUsers: 0,
        activeUsers: 0,
        totalPlatformAccounts: 0,
        totalComments: 0,
    };

    try {
        stats = await getRepositories().getStats();
    } catch {
        // Supabase may not be configured in dev yet
    }

    return (
        <AdminShell title="Dashboard" hideHeaderTitle>
            <div className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                    Overview of app users and platform activity
                </p>
            </div>
            <StatsCards stats={stats} />
            <UsersTable />
        </AdminShell>
    );
}
