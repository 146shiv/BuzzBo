import * as fs from 'fs';
import { appContext } from './appContext';
import { handlers, invokeIpc } from './ipcHandlers';
import { clearSession } from './session';

export interface TestResult {
    ok: boolean;
    suite: string;
    error?: string;
    details?: Record<string, unknown>;
}

function writeResult(result: TestResult): void {
    const file = process.env.ELECTRON_TEST_RESULT_FILE;
    const json = JSON.stringify(result, null, 2);
    if (file) fs.writeFileSync(file, json, 'utf-8');
    if (result.ok) {
        console.log(`[TEST] ${result.suite} PASSED`);
    } else {
        console.error(`[TEST] ${result.suite} FAILED: ${result.error}`);
    }
}

async function runIpcSuite(): Promise<TestResult> {
    const user = process.env.TEST_BOT_USER || process.env.TEST_ADMIN_USER;
    const pass = process.env.TEST_BOT_PASS || process.env.TEST_ADMIN_PASS;
    if (!user || !pass) {
        return { ok: false, suite: 'ipc', error: 'TEST_BOT_USER/TEST_BOT_PASS not set' };
    }

    clearSession();
    appContext.logout();

    const session = await invokeIpc('auth:login', { username: user, password: pass });
    if (!(session as { token?: string }).token) {
        return { ok: false, suite: 'ipc', error: 'login did not return token' };
    }

    const accounts = (await invokeIpc('accounts:list')) as unknown[];
    if (!Array.isArray(accounts)) {
        return { ok: false, suite: 'ipc', error: 'accounts:list did not return array' };
    }

    await invokeIpc('auth:logout');
    const after = await invokeIpc('auth:session');
    if (after) {
        return { ok: false, suite: 'ipc', error: 'session not cleared after logout' };
    }

    return { ok: true, suite: 'ipc', details: { accountCount: accounts.length } };
}

async function runRendererSuite(): Promise<TestResult> {
    const ipc = await runIpcSuite();
    if (!ipc.ok) return { ...ipc, suite: 'renderer' };

    const user = process.env.TEST_BOT_USER || process.env.TEST_ADMIN_USER;
    const pass = process.env.TEST_BOT_PASS || process.env.TEST_ADMIN_PASS;
    await invokeIpc('auth:login', { username: user!, password: pass! });
    const accounts = (await invokeIpc('accounts:list')) as Record<string, unknown>[];
    if (accounts.length === 0) {
        return { ok: false, suite: 'renderer', error: 'no accounts to test' };
    }

    const first = accounts[0];
    const comments = await invokeIpc('comments:list', {
        accountId: String(first.id),
        limit: 5,
    });
    if (!comments || typeof comments !== 'object') {
        return { ok: false, suite: 'renderer', error: 'comments:list failed' };
    }

    await invokeIpc('auth:logout');
    return {
        ok: true,
        suite: 'renderer',
        details: { accountId: first.id, commentsLoaded: true },
    };
}

async function runPatchRoundtrip(): Promise<TestResult> {
    const user = process.env.TEST_BOT_USER || process.env.TEST_ADMIN_USER;
    const pass = process.env.TEST_BOT_PASS || process.env.TEST_ADMIN_PASS;
    await invokeIpc('auth:login', { username: user!, password: pass! });
    const accounts = (await invokeIpc('accounts:list')) as Record<string, unknown>[];
    if (accounts.length === 0) {
        return { ok: false, suite: 'patch', error: 'no accounts' };
    }
    const id = String(accounts[0].id);
    const original = String(accounts[0].skills_content || '');
    const marker = `__buzzbo_test_${Date.now()}__`;
    await invokeIpc('accounts:update', {
        id,
        patch: { skills_content: `${original}\n${marker}` },
    });
    const updated = (await invokeIpc('accounts:get', id)) as Record<string, unknown>;
    if (!String(updated.skills_content || '').includes(marker)) {
        return { ok: false, suite: 'patch', error: 'marker not found after PATCH' };
    }
    await invokeIpc('accounts:update', { id, patch: { skills_content: original } });
    await invokeIpc('auth:logout');
    return { ok: true, suite: 'patch' };
}

async function runBotSuite(): Promise<TestResult> {
    const user = process.env.TEST_BOT_USER || process.env.TEST_ADMIN_USER;
    const pass = process.env.TEST_BOT_PASS || process.env.TEST_ADMIN_PASS;
    await invokeIpc('auth:login', { username: user!, password: pass! });
    await appContext.refreshConfig();
    appContext.settings = { ...appContext.settings, headless: true, mockAiComments: true };

    const accounts = (await invokeIpc('accounts:list')) as Record<string, unknown>[];
    const enabled = accounts.find(a => a.enabled);
    if (!enabled) {
        return { ok: false, suite: 'bot', error: 'no enabled account' };
    }

    const events: string[] = [];
    const onLog = () => events.push('log');
    const onComment = () => events.push('comment');
    appContext.botRunner.on('bot:log', onLog);
    appContext.botRunner.on('bot:comment', onComment);

    const testUrl = 'https://www.instagram.com/p/INVALID_TEST_POST/';
    let result: string;
    try {
        result = (await invokeIpc('bot:test-comment', {
            accountId: String(enabled.id),
            url: testUrl,
        })) as string;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Not authenticated') || msg.includes('login')) {
            return { ok: false, suite: 'bot', error: msg };
        }
        result = 'FAILED';
    }

    appContext.botRunner.off('bot:log', onLog);
    appContext.botRunner.off('bot:comment', onComment);
    await invokeIpc('auth:logout');

    const acceptable = ['SUCCESS', 'SKIPPED', 'FAILED'].includes(result);
    if (!acceptable) {
        return { ok: false, suite: 'bot', error: `unexpected result: ${result}` };
    }
    return { ok: true, suite: 'bot', details: { result, events: events.length } };
}

async function runE2eSuite(): Promise<TestResult> {
    for (const suite of [runIpcSuite, runRendererSuite, runPatchRoundtrip, runBotSuite]) {
        const result = await suite();
        if (!result.ok) return { ...result, suite: 'e2e' };
    }
    return { ok: true, suite: 'e2e' };
}

export async function runTestSuite(suite: string): Promise<TestResult> {
    switch (suite) {
        case 'ipc':
            return runIpcSuite();
        case 'renderer':
            return runRendererSuite();
        case 'patch':
            return runPatchRoundtrip();
        case 'bot':
            return runBotSuite();
        case 'e2e':
            return runE2eSuite();
        default:
            return { ok: false, suite, error: `unknown suite: ${suite}` };
    }
}

export async function runElectronTestMode(): Promise<void> {
    const suite = process.env.ELECTRON_TEST_SUITE || 'ipc';
    try {
        const result = await runTestSuite(suite);
        writeResult(result);
        process.exitCode = result.ok ? 0 : 1;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        writeResult({ ok: false, suite, error: msg });
        process.exitCode = 1;
    }
}
