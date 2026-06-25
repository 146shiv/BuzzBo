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

function materialize(name) {
    const srcRoot = join(repoRoot, name);
    const destRoot = join(buzzboDir, name.replace('@buzzbo/', ''));
    rmSync(destRoot, { recursive: true, force: true });
    mkdirSync(destRoot, { recursive: true });

    const pkg = JSON.parse(readFileSync(join(srcRoot, 'package.json'), 'utf-8'));
    cpSync(join(srcRoot, 'dist'), join(destRoot, 'dist'), { recursive: true });
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
