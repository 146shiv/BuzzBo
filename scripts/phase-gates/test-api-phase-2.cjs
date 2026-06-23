#!/usr/bin/env node
/**
 * Phase 2 API gate — requires admin at BUZZBO_ADMIN_API_URL.
 */
const { spawn } = require('child_process');

const BASE = (process.env.BUZZBO_ADMIN_API_URL || process.env.ADMIN_API_URL || 'http://localhost:3000').replace(
    /\/$/,
    ''
);

const BOT_USER = process.env.TEST_BOT_USER || 'testbot';
const BOT_PASS = process.env.TEST_BOT_PASS || 'testbot123';
const ADMIN_USER = process.env.TEST_ADMIN_USER || 'shivendra';
const ADMIN_PASS = process.env.TEST_ADMIN_PASS || 'shivendra@123#';

let adminProc = null;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(path, init = {}) {
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init.headers || {}),
        },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`${init.method || 'GET'} ${path} → ${res.status}: ${data.error || JSON.stringify(data)}`);
    }
    return data;
}

async function waitForAdmin(maxMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        try {
            await fetch(`${BASE}/api/auth/login`, { method: 'POST', body: '{}' });
            return;
        } catch {
            await delay(1000);
        }
    }
    throw new Error(`Admin not reachable at ${BASE}`);
}

async function ensureAdminRunning() {
    try {
        await waitForAdmin(5000);
        return;
    } catch {
        console.log('Starting admin dev server...');
        adminProc = spawn('npm', ['run', 'dev', '-w', '@buzzbo/admin'], {
            cwd: process.cwd(),
            stdio: 'ignore',
            detached: true,
            env: { ...process.env, PORT: '3000' },
        });
        adminProc.unref();
        await waitForAdmin(120000);
    }
}

async function getBotToken() {
    try {
        const data = await fetchJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: BOT_USER, password: BOT_PASS }),
        });
        return data.token;
    } catch {
        const adminLogin = await fetchJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
        });
        try {
            await fetchJson('/api/admin/users', {
                method: 'POST',
                headers: { Authorization: `Bearer ${adminLogin.token}` },
                body: JSON.stringify({
                    username: BOT_USER,
                    password: BOT_PASS,
                    role: 'user',
                }),
            });
        } catch {
            /* user may exist */
        }
        const botLogin = await fetchJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: BOT_USER, password: BOT_PASS }),
        });
        return botLogin.token;
    }
}

function auth(token) {
    return { Authorization: `Bearer ${token}` };
}

async function main() {
    await ensureAdminRunning();
    const token = await getBotToken();

    const me = await fetchJson('/api/auth/me', { headers: auth(token) });
    if (!me.id) throw new Error('getMe failed');

    await fetchJson('/api/bot/config', { headers: auth(token) });
    let accounts = await fetchJson('/api/bot/accounts', { headers: auth(token) });

    let accountId = accounts[0]?.id;
    if (!accountId) {
        const adminLogin = await fetchJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
        });
        const created = await fetchJson(`/api/admin/users/${me.id}/accounts`, {
            method: 'POST',
            headers: auth(adminLogin.token),
            body: JSON.stringify({
                platform: 1,
                username: `gate_test_${Date.now()}`,
                enabled: true,
                skills_content: 'gate test',
                post_urls: [],
            }),
        });
        accountId = created.id;
        accounts = [created];
    }

    await fetchJson(`/api/bot/accounts/${accountId}`, { headers: auth(token) });

    const marker = `gate-${Date.now()}`;
    await fetchJson(`/api/bot/accounts/${accountId}`, {
        method: 'PATCH',
        headers: auth(token),
        body: JSON.stringify({ skills_content: marker }),
    });

    const updated = await fetchJson(`/api/bot/accounts/${accountId}`, { headers: auth(token) });
    if (updated.skills_content !== marker) throw new Error('PATCH skills_content failed');

    const postId = `GateTest${Date.now()}`;
    await fetchJson('/api/bot/comments', {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({
            accountId,
            platform: 1,
            postId,
            postUrl: `https://www.instagram.com/p/${postId}/`,
            commentText: 'phase-2 gate comment',
        }),
    });

    const log = await fetchJson(
        `/api/bot/comments?accountId=${accountId}&limit=10&offset=0`,
        { headers: auth(token) }
    );
    const found = (log.entries || []).find((e) => e.postId === postId);
    if (!found) {
        throw new Error('Comment log entry not found');
    }
    if (found.commentText && found.commentText !== 'phase-2 gate comment') {
        throw new Error('Comment text mismatch');
    }

    await fetchJson('/api/bot/heartbeat', {
        method: 'POST',
        headers: auth(token),
        body: '{}',
    });

    const adminLogin = await fetchJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    await fetchJson('/api/admin/stats', { headers: auth(adminLogin.token) });

    console.log('Phase 2 API tests OK');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => {
        if (adminProc?.pid) {
            try {
                process.kill(-adminProc.pid, 'SIGTERM');
            } catch {
                /* ignore */
            }
        }
    });
