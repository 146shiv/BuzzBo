#!/usr/bin/env node
/**
 * Replace workspace symlinks with real copies so electron-builder can package them.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appRoot, '..');
const buzzboDir = join(appRoot, 'node_modules', '@buzzbo');

function materialize(relPath, bundleDir = 'dist') {
    const srcRoot = join(repoRoot, relPath);
    const destRoot = join(buzzboDir, relPath.split('/').pop());
    rmSync(destRoot, { recursive: true, force: true });
    mkdirSync(destRoot, { recursive: true });

    const pkg = JSON.parse(readFileSync(join(srcRoot, 'package.json'), 'utf-8'));
    cpSync(join(srcRoot, bundleDir), join(destRoot, bundleDir), { recursive: true });
    writeFileSync(
        join(destRoot, 'package.json'),
        JSON.stringify(
            {
                name: pkg.name,
                version: pkg.version,
                main: pkg.main,
                types: pkg.types,
                exports: pkg.exports,
                dependencies: pkg.dependencies,
            },
            null,
            2
        ),
        'utf-8'
    );
    console.log(`Materialized ${pkg.name} → ${destRoot}`);
}

mkdirSync(buzzboDir, { recursive: true });
materialize('core');
materialize('instagram-bot');
materialize('packages/ui', 'src');
