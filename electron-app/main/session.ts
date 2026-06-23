import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getUserDataRoot } from './paths';

const SESSION_FILE = 'buzzbo-session.json';

export interface StoredSession {
    token: string;
    username: string;
    userId: string;
}

function sessionPath(): string {
    return path.join(getUserDataRoot(), SESSION_FILE);
}

export function loadSession(): StoredSession | null {
    try {
        const raw = fs.readFileSync(sessionPath(), 'utf-8');
        const parsed = JSON.parse(raw) as { encrypted?: string; plain?: StoredSession };
        if (parsed.encrypted && safeStorage.isEncryptionAvailable()) {
            const decrypted = safeStorage.decryptString(Buffer.from(parsed.encrypted, 'base64'));
            return JSON.parse(decrypted) as StoredSession;
        }
        if (parsed.plain) return parsed.plain;
        return JSON.parse(raw) as StoredSession;
    } catch {
        return null;
    }
}

export function saveSession(session: StoredSession): void {
    fs.mkdirSync(getUserDataRoot(), { recursive: true });
    const payload = JSON.stringify(session);
    if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(payload).toString('base64');
        fs.writeFileSync(sessionPath(), JSON.stringify({ encrypted }), 'utf-8');
    } else {
        fs.writeFileSync(sessionPath(), JSON.stringify({ plain: session }), 'utf-8');
    }
}

export function clearSession(): void {
    try {
        fs.unlinkSync(sessionPath());
    } catch {
        /* ignore */
    }
}
