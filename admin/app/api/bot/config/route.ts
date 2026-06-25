import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { botConfigFromDb } from '@/lib/botConfig';
import { DEFAULT_SETTINGS } from '@shared/config-types';
import { sanitizeBotSettings } from '@buzzbo/core/config';

export async function GET(request: Request) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    try {
        const repos = getRepositories();
        const user = await repos.users.findById(session.sub);
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        let settings = DEFAULT_SETTINGS;
        if (user.config_id) {
            const config = await repos.configurations.findById(user.config_id);
            if (config) settings = config.settings;
        }

        const accounts = await repos.platformAccounts.listByUserId(user.id);
        const enabledAccounts = accounts.filter(a => a.enabled);

        await repos.users.touchLastUsed(user.id);

        const botConfig = botConfigFromDb(sanitizeBotSettings(settings), enabledAccounts);
        return NextResponse.json(botConfig);
    } catch (e) {
        console.error('Bot config error:', e);
        return NextResponse.json({ error: 'Failed to load config' }, { status: 500 });
    }
}
