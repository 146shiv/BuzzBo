import { NextResponse } from 'next/server';
import { requireAuth, badRequest, forbidden, notFound } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import type { AccountSessionStatus } from '@/lib/db/types';

type Params = { params: Promise<{ id: string }> };

async function assertAccountOwner(accountId: string, userId: string) {
    const account = await getRepositories().platformAccounts.findById(accountId);
    if (!account) return { error: notFound() };
    if (account.user_id !== userId) return { error: forbidden() };
    return { account };
}

export async function GET(_request: Request, { params }: Params) {
    const session = await requireAuth(_request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const check = await assertAccountOwner(id, session.sub);
    if ('error' in check && check.error) return check.error;

    try {
        const row = await getRepositories().accountSessions.findByAccountId(id);
        if (!row || !row.storage_state_encrypted) {
            return NextResponse.json({
                platform_account_id: id,
                status: (row?.status as AccountSessionStatus) || 'needs_login',
                storageState: null,
                fingerprint: row?.fingerprint_json ?? null,
                last_synced_at: row?.last_synced_at ?? null,
                last_validated_at: row?.last_validated_at ?? null,
            });
        }

        const decrypted = decryptSecret(row.storage_state_encrypted);
        return NextResponse.json({
            platform_account_id: id,
            status: row.status,
            storageState: JSON.parse(decrypted),
            fingerprint: row.fingerprint_json,
            last_synced_at: row.last_synced_at,
            last_validated_at: row.last_validated_at,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load session';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const check = await assertAccountOwner(id, session.sub);
    if ('error' in check && check.error) return check.error;

    try {
        const body = await request.json();
        const storageState = body.storageState;
        const fingerprint = body.fingerprint;
        if (!storageState || typeof storageState !== 'object') {
            return badRequest('storageState object is required');
        }

        const encrypted = encryptSecret(JSON.stringify(storageState));
        const now = new Date().toISOString();
        const row = await getRepositories().accountSessions.upsert({
            platform_account_id: id,
            storage_state_encrypted: encrypted,
            fingerprint_json: fingerprint ?? {},
            status: 'valid',
            last_synced_at: now,
            last_validated_at: now,
        });

        await getRepositories().users.touchLastUsed(session.sub);

        return NextResponse.json({
            platform_account_id: id,
            status: row.status,
            last_synced_at: row.last_synced_at,
            last_validated_at: row.last_validated_at,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to save session';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: Params) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const check = await assertAccountOwner(id, session.sub);
    if ('error' in check && check.error) return check.error;

    try {
        const body = await request.json();
        const status = body.status as AccountSessionStatus;
        if (!['needs_login', 'valid', 'expired', 'challenged'].includes(status)) {
            return badRequest('Invalid status');
        }
        const row = await getRepositories().accountSessions.updateStatus(id, status);
        return NextResponse.json({
            platform_account_id: id,
            status: row.status,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to update session status';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
