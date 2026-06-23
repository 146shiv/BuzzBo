'use client';

import Link from 'next/link';
import { ChevronRight, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AdminBreadcrumb = {
    label: string;
    href?: string;
};

export function AdminHeader({
    title,
    breadcrumbs = [],
    hideTitle,
}: {
    title: string;
    breadcrumbs?: AdminBreadcrumb[];
    hideTitle?: boolean;
}) {
    const trail = hideTitle ? breadcrumbs : [...breadcrumbs, { label: title }];
    const showBreadcrumb = trail.length > 0;

    return (
        <header className="sticky top-0 z-10 border-b border-border/50 bg-card/70 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                    <Link
                        href="/dashboard"
                        className="flex shrink-0 items-center gap-3 rounded-xl py-1 transition-opacity hover:opacity-90"
                    >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-md shadow-primary/20">
                            B
                        </span>
                        <span className="hidden leading-tight sm:block">
                            <span className="block text-sm font-semibold tracking-tight">Buzzbo</span>
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Admin
                            </span>
                        </span>
                    </Link>

                    {showBreadcrumb && (
                        <>
                            <ChevronRight
                                className="hidden h-4 w-4 shrink-0 text-border sm:block"
                                aria-hidden
                            />
                            <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center sm:flex">
                                <ol className="flex min-w-0 items-center gap-1">
                                    {trail.map((crumb, i) => {
                                        const isLast = i === trail.length - 1;
                                        return (
                                            <li
                                                key={`${crumb.label}-${i}`}
                                                className="flex min-w-0 items-center gap-1"
                                            >
                                                {i > 0 && (
                                                    <ChevronRight
                                                        className="mx-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40"
                                                        aria-hidden
                                                    />
                                                )}
                                                {crumb.href && !isLast ? (
                                                    <Link
                                                        href={crumb.href}
                                                        className="truncate rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                    >
                                                        {crumb.label}
                                                    </Link>
                                                ) : (
                                                    <span
                                                        className={cn(
                                                            'truncate text-sm',
                                                            isLast
                                                                ? 'font-medium text-foreground'
                                                                : 'text-muted-foreground',
                                                        )}
                                                        aria-current={isLast ? 'page' : undefined}
                                                    >
                                                        {crumb.label}
                                                    </span>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ol>
                            </nav>
                        </>
                    )}
                </div>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={async () => {
                        await fetch('/api/auth/logout', { method: 'POST' });
                        window.location.href = '/login';
                    }}
                >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                </Button>
            </div>
        </header>
    );
}
