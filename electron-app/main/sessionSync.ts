import * as fs from 'fs';
import * as path from 'path';
import type { AdminApiClient } from '@buzzbo/core/api/apiClient';
import { getCookiesDir, getFingerprintsDir } from './paths';
import { resolveSessionFilePath } from './sessionPaths';

export class SessionSync {
    constructor(private readonly client: AdminApiClient) {}

    cookiePath(platform: number, username: string): string {
        return resolveSessionFilePath(getCookiesDir(), platform, username);
    }

    fingerprintPath(platform: number, username: string): string {
        return resolveSessionFilePath(getFingerprintsDir(), platform, username);
    }

    hasLocalSession(platform: number, username: string): boolean {
        return fs.existsSync(this.cookiePath(platform, username));
    }

    async pullToLocal(accountId: string, platform: number, username: string): Promise<boolean> {
        const remote = await this.client.getAccountSession(accountId);
        if (!remote.storageState) return false;

        const cookiePath = this.cookiePath(platform, username);
        fs.mkdirSync(getCookiesDir(), { recursive: true });
        fs.writeFileSync(cookiePath, JSON.stringify(remote.storageState, null, 2));

        if (remote.fingerprint) {
            const fpPath = this.fingerprintPath(platform, username);
            fs.mkdirSync(getFingerprintsDir(), { recursive: true });
            fs.writeFileSync(fpPath, JSON.stringify(remote.fingerprint, null, 2));
        }
        return true;
    }

    async syncAllAccounts(
        accounts: { id: string; username: string; platform?: number }[]
    ): Promise<void> {
        for (const account of accounts) {
            const platform = Number(account.platform ?? 1);
            if (this.hasLocalSession(platform, account.username)) continue;
            try {
                await this.pullToLocal(account.id, platform, account.username);
            } catch {
                /* no remote session yet */
            }
        }
    }

    readLocalStorageState(platform: number, username: string): Record<string, unknown> | null {
        const cookiePath = this.cookiePath(platform, username);
        if (!fs.existsSync(cookiePath)) return null;
        return JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    }

    readLocalFingerprint(platform: number, username: string): Record<string, unknown> | null {
        const fpPath = this.fingerprintPath(platform, username);
        if (!fs.existsSync(fpPath)) return null;
        return JSON.parse(fs.readFileSync(fpPath, 'utf-8'));
    }

    async uploadFromLocal(accountId: string, platform: number, username: string): Promise<void> {
        const storageState = this.readLocalStorageState(platform, username);
        if (!storageState) {
            const label = platform === 2 ? 'YouTube' : 'Instagram';
            throw new Error(`No local session to upload. Complete ${label} login first.`);
        }
        const fingerprint = this.readLocalFingerprint(platform, username) ?? {};
        await this.client.putAccountSession(accountId, { storageState, fingerprint });
    }

    async markExpired(accountId: string): Promise<void> {
        await this.client.patchAccountSessionStatus(accountId, 'expired');
    }
}
