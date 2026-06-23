import * as fs from 'fs';
import { join } from 'path';

function parseEnvFile(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

/** Load repo-root `.env` into process.env before API client reads BUZZBO_ADMIN_API_URL. */
export function loadBuzzboEnv(): void {
    const candidates = new Set<string>([
        join(__dirname, '../../../.env'),
        join(__dirname, '../../.env'),
        join(process.cwd(), '.env'),
        join(process.cwd(), '..', '.env'),
    ]);

    for (const envPath of candidates) {
        parseEnvFile(envPath);
    }
}

loadBuzzboEnv();
