import * as fs from 'fs';
import * as path from 'path';
import { Platform } from '@buzzbo/core/config';

export function sessionStorageKey(platform: number, username: string): string {
    return `${platform}_${username}`;
}

/** Resolve cookie/fingerprint file path with legacy Instagram fallback. */
export function resolveSessionFilePath(
    baseDir: string,
    platform: number,
    username: string
): string {
    const key = sessionStorageKey(platform, username);
    const canonical = path.join(baseDir, `${key}.json`);

    if (platform === Platform.Instagram) {
        const legacy = path.join(baseDir, `${username}.json`);
        if (!fs.existsSync(canonical) && fs.existsSync(legacy)) {
            return legacy;
        }
    }

    return canonical;
}
