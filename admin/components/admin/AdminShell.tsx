import { AdminHeader, type AdminBreadcrumb } from '@/components/admin/AdminHeader';

export function AdminShell({
    title,
    breadcrumbs,
    children,
    hideHeaderTitle,
}: {
    title: string;
    breadcrumbs?: AdminBreadcrumb[];
    children: React.ReactNode;
    hideHeaderTitle?: boolean;
}) {
    return (
        <div className="min-h-screen bg-background">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.52_0.11_175/0.07),transparent),radial-gradient(ellipse_50%_40%_at_100%_0%,oklch(0.55_0.14_155/0.04),transparent)]" />
            <AdminHeader
                title={title}
                breadcrumbs={breadcrumbs}
                hideTitle={hideHeaderTitle}
            />
            <main className="relative mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
                {children}
            </main>
        </div>
    );
}
