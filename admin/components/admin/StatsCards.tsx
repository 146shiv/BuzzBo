import { Card, CardContent } from '@/components/ui/card';
import { Users, UserCheck, AtSign, MessageSquare } from 'lucide-react';
import type { DashboardStats } from '@/lib/db/types';

const cards = [
    { key: 'totalUsers' as const, label: 'Total Users', icon: Users },
    { key: 'activeUsers' as const, label: 'Active (30d)', icon: UserCheck },
    { key: 'totalPlatformAccounts' as const, label: 'Platform Accounts', icon: AtSign },
    { key: 'totalComments' as const, label: 'Comments Logged', icon: MessageSquare },
];

export function StatsCards({ stats }: { stats: DashboardStats }) {
    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {cards.map(({ key, label, icon: Icon }) => (
                <Card key={key} className="relative overflow-hidden border-border/80 shadow-sm">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary to-primary/30" />
                    <CardContent className="flex items-start justify-between gap-3 py-5">
                        <div className="min-w-0 space-y-1">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {label}
                            </p>
                            <p className="text-3xl font-bold leading-none tracking-tight tabular-nums">
                                {stats[key].toLocaleString()}
                            </p>
                        </div>
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/10">
                            <Icon className="h-5 w-5 text-primary" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
