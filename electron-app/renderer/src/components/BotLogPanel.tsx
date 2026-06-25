import { useEffect, useRef, useState } from 'react';

interface LogEntry {
    level: string;
    message: string;
    account?: string;
    at: string;
}

export default function BotLogPanel() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsub = window.buzzbo.bot.onLog(entry => {
            setLogs(prev => [...prev.slice(-500), entry as LogEntry]);
        });
        return () => {
            unsub();
        };
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div
            className="min-h-0 flex-1 overflow-auto bg-muted/20 p-4 font-mono text-xs leading-relaxed text-foreground/90"
            data-testid="bot-log-panel"
        >
            {logs.map((log, i) => (
                <div key={`${log.at}-${i}`} className="mb-1">
                    <span className="text-muted-foreground">
                        [{new Date(log.at).toLocaleTimeString()}]
                    </span>{' '}
                    <span
                        className={
                            log.level === 'error'
                                ? 'text-destructive'
                                : log.level === 'success'
                                  ? 'text-success'
                                  : log.level === 'warn'
                                    ? 'text-amber-400'
                                    : 'text-foreground/90'
                        }
                    >
                        {log.account ? `@${log.account}: ` : ''}
                        {log.message}
                    </span>
                </div>
            ))}
            {logs.length === 0 && (
                <p className="text-muted-foreground">Waiting for bot activity…</p>
            )}
            <div ref={bottomRef} />
        </div>
    );
}
