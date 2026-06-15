import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export function extractPostShortcode(urlOrPath: string): string | null {
    const match =
        urlOrPath.match(/instagram\.com\/(?:p|reels?)\/([^/?#]+)/i) ??
        urlOrPath.match(/\/(?:p|reels?)\/([^/?#]+)/i);
    return match ? match[1] : null;
}

/** Instagram shortcodes use mixed case; usernames are lowercase-only. */
function looksLikeInstagramShortcode(value: string): boolean {
    return /^[A-Za-z0-9_-]{8,}$/.test(value) && /[A-Z]/.test(value);
}

function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    fields.push(current);
    return fields;
}

export class CommentHistoryStore {
    private readonly db: Database.Database;

    constructor(dbPath: string) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.initSchema();
    }

    private initSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS commented_posts (
                account_username TEXT NOT NULL,
                post_shortcode TEXT NOT NULL,
                post_url TEXT,
                comment_text TEXT,
                commented_at TEXT NOT NULL,
                PRIMARY KEY (account_username, post_shortcode)
            );
            CREATE INDEX IF NOT EXISTS idx_commented_posts_shortcode
                ON commented_posts (post_shortcode);
        `);
    }

    hasCommented(accountUsername: string, postShortcode: string): boolean {
        const row = this.db
            .prepare(
                `SELECT 1 FROM commented_posts
                 WHERE account_username = ? AND post_shortcode = ?
                 LIMIT 1`
            )
            .get(accountUsername, postShortcode);
        return Boolean(row);
    }

    recordComment(
        accountUsername: string,
        postShortcode: string,
        options: { postUrl?: string; commentText?: string } = {}
    ): void {
        this.db
            .prepare(
                `INSERT OR IGNORE INTO commented_posts
                 (account_username, post_shortcode, post_url, comment_text, commented_at)
                 VALUES (?, ?, ?, ?, ?)`
            )
            .run(
                accountUsername,
                postShortcode,
                options.postUrl ?? null,
                options.commentText ?? null,
                new Date().toISOString()
            );
    }

    getCommentedShortcodes(accountUsername: string): Set<string> {
        const rows = this.db
            .prepare(`SELECT post_shortcode FROM commented_posts WHERE account_username = ?`)
            .all(accountUsername) as Array<{ post_shortcode: string }>;
        return new Set(rows.map(row => row.post_shortcode));
    }

    getTotalCount(): number {
        const row = this.db.prepare(`SELECT COUNT(*) AS count FROM commented_posts`).get() as {
            count: number;
        };
        return row.count;
    }

    importFromInteractionLog(csvPath: string): number {
        if (!fs.existsSync(csvPath)) {
            return 0;
        }

        const insert = this.db.prepare(
            `INSERT OR IGNORE INTO commented_posts
             (account_username, post_shortcode, post_url, comment_text, commented_at)
             VALUES (?, ?, NULL, ?, ?)`
        );

        let imported = 0;
        const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').slice(1);

        const importRows = this.db.transaction(() => {
            for (const line of lines) {
                if (!line.trim()) {
                    continue;
                }

                const fields = parseCsvLine(line);
                if (fields.length < 5) {
                    continue;
                }

                const [timestamp, accountUsername, target, actionType, commentText] = fields;
                if (actionType !== 'comment' || !accountUsername || !target) {
                    continue;
                }

                if (!looksLikeInstagramShortcode(target)) {
                    continue;
                }

                const result = insert.run(
                    accountUsername,
                    target,
                    commentText || null,
                    timestamp || new Date().toISOString()
                );
                if (result.changes > 0) {
                    imported++;
                }
            }
        });

        importRows();
        return imported;
    }

    close(): void {
        this.db.close();
    }
}
