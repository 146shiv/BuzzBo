import { useCallback, useEffect, useState } from 'react';
import {
    Badge,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@buzzbo/ui';

interface CommentRow {
    postId: string;
    postUrl: string | null;
    commentText: string | null;
    commentedAt: string;
    status?: string;
}

export default function CommentActivityPanel({ accountId }: { accountId: string }) {
    const [rows, setRows] = useState<CommentRow[]>([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (!accountId) return;
        setLoading(true);
        try {
            const data = await window.buzzbo.comments.list({ accountId, limit: 100 });
            setRows(
                (data.entries as CommentRow[]).map(e => ({
                    ...e,
                    status: 'success',
                }))
            );
        } finally {
            setLoading(false);
        }
    }, [accountId]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const unsub = window.buzzbo.bot.onComment(entry => {
            const e = entry as {
                postId?: string;
                postUrl?: string;
                commentText?: string;
                commentedAt?: string;
                status?: string;
            };
            if (!accountId) return;
            setRows(prev => [
                {
                    postId: e.postId || '',
                    postUrl: e.postUrl || null,
                    commentText: e.commentText || null,
                    commentedAt: e.commentedAt || new Date().toISOString(),
                    status: e.status,
                },
                ...prev,
            ]);
        });
        return () => {
            unsub();
        };
    }, [accountId]);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="comment-activity-panel">
            {loading ? (
                <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                    ))}
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                    <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead>Time</TableHead>
                            <TableHead>URL / Post</TableHead>
                            <TableHead>Comment</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row, i) => (
                            <TableRow
                                key={`${row.postId}-${row.commentedAt}-${i}`}
                                className="cursor-pointer"
                                onClick={() =>
                                    row.postUrl && void window.buzzbo.shell.openExternal(row.postUrl)
                                }
                            >
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                    {new Date(row.commentedAt).toLocaleString()}
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate text-primary">
                                    {row.postUrl || row.postId}
                                </TableCell>
                                <TableCell className="max-w-[240px] truncate">
                                    {row.commentText || '—'}
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant={
                                            row.status === 'success'
                                                ? 'success'
                                                : row.status === 'failed'
                                                  ? 'danger'
                                                  : 'muted'
                                        }
                                    >
                                        {row.status || '—'}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                        {rows.length === 0 && (
                            <TableRow className="hover:bg-transparent">
                                <TableCell
                                    colSpan={4}
                                    className="py-8 text-center text-muted-foreground"
                                >
                                    No comments yet
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                </div>
            )}
        </div>
    );
}
