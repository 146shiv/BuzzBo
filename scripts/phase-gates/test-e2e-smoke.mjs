import { spawn } from 'child_process';
import { createRequire } from 'module';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { electronSpawnEnv } from './electron-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const require = createRequire(import.meta.url);
const electronPath = require('electron');

const resultFile = join(mkdtempSync(join(tmpdir(), 'buzzbo-test-')), 'result.json');
const appDir = join(root, 'electron-app');

const child = spawn(electronPath, ['.'], {
    cwd: appDir,
    env: electronSpawnEnv({
        ELECTRON_TEST_MODE: '1',
        ELECTRON_TEST_SUITE: 'e2e',
        ELECTRON_TEST_RESULT_FILE: resultFile,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
});

child.on('exit', () => {
    try {
        const result = JSON.parse(readFileSync(resultFile, 'utf-8'));
        if (!result.ok) {
            console.error('E2E smoke failed:', result.error);
            process.exit(1);
        }
        console.log('E2E smoke passed');
        process.exit(0);
    } catch (err) {
        console.error('Failed to read E2E result', err);
        process.exit(1);
    } finally {
        try {
            rmSync(resultFile, { force: true });
        } catch {
            /* ignore */
        }
    }
});

setTimeout(() => {
    child.kill('SIGTERM');
    process.exit(1);
}, 300000);
