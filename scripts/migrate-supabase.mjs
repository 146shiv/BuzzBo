#!/usr/bin/env node
/**
 * Run supabase/migrations/*.sql against the remote Supabase Postgres database.
 *
 * Requires in admin/.env:
 *   SUPABASE_URL
 *   SUPABASE_DB_PASSWORD  (Dashboard → Project Settings → Database → Database password)
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, 'admin/.env') });

const url = process.env.SUPABASE_URL?.trim();
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();

if (!databaseUrl && !password) {
    console.error(
        'Set DATABASE_URL or SUPABASE_DB_PASSWORD in admin/.env\n' +
            'Dashboard → Project Settings → Database → Connection string (URI) or Database password'
    );
    process.exit(1);
}

let client;
if (databaseUrl) {
    client = new pg.Client({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false },
    });
} else {
    if (!url) {
        console.error('SUPABASE_URL is not set in admin/.env');
        process.exit(1);
    }
    const ref = url.replace(/\/+$/, '').match(/https:\/\/([^.]+)/)?.[1];
    if (!ref) {
        console.error('Could not parse project ref from SUPABASE_URL');
        process.exit(1);
    }
    const region = process.env.SUPABASE_DB_REGION?.trim() || 'ap-southeast-1';
    const encPwd = encodeURIComponent(password);
    const poolerUrl = `postgresql://postgres.${ref}:${encPwd}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
    client = new pg.Client({
        connectionString: poolerUrl,
        ssl: { rejectUnauthorized: false },
    });
}

const migrationsDir = join(root, 'supabase/migrations');
const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

async function main() {
    const target = databaseUrl ? 'DATABASE_URL' : `db.${url?.match(/https:\/\/([^.]+)/)?.[1]}.supabase.co`;
    console.log(`Connecting via ${target}...`);
    await client.connect();
    console.log(`Running ${files.length} migration file(s)...`);

    for (const file of files) {
        const sql = readFileSync(join(migrationsDir, file), 'utf8');
        console.log(`  → ${file}`);
        await client.query(sql);
    }

    const { rows } = await client.query(
        'SELECT username, role FROM users ORDER BY username'
    );
    console.log('Users after migrate:', rows);

    const { rows: configs } = await client.query('SELECT id, name FROM configurations');
    console.log('Configurations:', configs);

    await client.end();
    console.log('Migrations complete.');
}

main().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
