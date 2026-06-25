import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export function getUserDataRoot(): string {
    return app.getPath('userData');
}

export function getCookiesDir(): string {
    const dir = path.join(getUserDataRoot(), 'cookies');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

export function getFingerprintsDir(): string {
    const dir = path.join(getUserDataRoot(), 'fingerprints');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

export function getLogsDir(): string {
    const dir = path.join(getUserDataRoot(), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
