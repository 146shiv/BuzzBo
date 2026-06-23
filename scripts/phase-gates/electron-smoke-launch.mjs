import { spawn } from 'child_process';
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const require = createRequire(import.meta.url);
const electronPath = require('electron');

const appDir = join(root, 'electron-app');
import { electronSpawnEnv } from './electron-env.mjs';

const env = electronSpawnEnv();

const child = spawn(electronPath, ['.'], {
    cwd: appDir,
    env,
    stdio: 'inherit',
});

const timeout = setTimeout(() => {
    child.kill('SIGTERM');
}, 3000);

child.on('exit', code => {
    clearTimeout(timeout);
    if (code !== 0 && code !== null) {
        console.error('Electron smoke launch exited with code', code);
        process.exit(code);
    }
    process.exit(0);
});

child.on('error', err => {
    clearTimeout(timeout);
    console.error(err);
    process.exit(1);
});
