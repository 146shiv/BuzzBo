import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import type {
    CommentHistoryRepository,
    ConfigurationRepository,
    CreateConfigurationInput,
    CreatePlatformAccountInput,
    CreateUserInput,
    PlatformAccountRepository,
    Repositories,
    UpdateConfigurationInput,
    UpdatePlatformAccountInput,
    UpdateUserInput,
    UserListOptions,
    UserRepository,
} from '../repository';
import type {
    DashboardStats,
    DbCommentedPost,
    DbConfiguration,
    DbPlatformAccount,
    DbUser,
    Platform,
    UserPublic,
} from '../types';
import { decryptConfigSecrets, encryptConfigSecrets } from '@/lib/crypto';
import type { SettingsConfig } from '@shared/config-types';

let client: SupabaseClient | null = null;

/** Project URL only — no /rest/v1 suffix. See Supabase Dashboard → Connect. */
function normalizeSupabaseUrl(url: string): string {
    return url.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');
}

/**
 * Server-side secret API key (`sb_secret_...`).
 * @see https://supabase.com/docs/guides/getting-started/api-keys
 */
function resolveSupabaseSecretKey(): string {
    const key = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!key) {
        throw new Error(
            'SUPABASE_SECRET_KEY must be set. Create one in Supabase Dashboard → Settings → API Keys (secret key, sb_secret_...).'
        );
    }
    if (key.startsWith('eyJ')) {
        throw new Error(
            'SUPABASE_SECRET_KEY looks like a legacy service_role JWT. Use a secret API key (sb_secret_...) from Settings → API Keys instead.'
        );
    }
    if (!key.startsWith('sb_secret_')) {
        console.warn(
            '[supabase] SUPABASE_SECRET_KEY does not start with sb_secret_. Ensure you are using a secret API key from the dashboard.'
        );
    }
    return key;
}

export function getSupabase(): SupabaseClient {
    if (client) return client;
    const url = process.env.SUPABASE_URL?.trim();
    if (!url) {
        throw new Error(
            'SUPABASE_URL must be set. Copy the Project URL from Supabase Dashboard → Connect (e.g. https://xxx.supabase.co).'
        );
    }
    const key = resolveSupabaseSecretKey();
    client = createClient(normalizeSupabaseUrl(url), key, { auth: { persistSession: false } });
    return client;
}

function mapUser(row: Record<string, unknown>): DbUser {
    return row as unknown as DbUser;
}

function mapConfig(row: Record<string, unknown>): DbConfiguration {
    const settings = decryptConfigSecrets(
        (row.settings as Record<string, unknown>) || {}
    ) as unknown as SettingsConfig;
    return {
        ...(row as unknown as DbConfiguration),
        settings,
    };
}

function mapAccount(row: Record<string, unknown>): DbPlatformAccount {
    const config = decryptConfigSecrets((row.config as Record<string, unknown>) || {});
    return {
        ...(row as unknown as DbPlatformAccount),
        platform: row.platform as Platform,
        config,
        post_urls: (row.post_urls as string[]) || [],
    };
}

const usersRepo: UserRepository = {
    async findById(id) {
        const { data, error } = await getSupabase().from('users').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? mapUser(data) : null;
    },

    async findByUsername(username) {
        const { data, error } = await getSupabase()
            .from('users')
            .select('*')
            .eq('username', username)
            .maybeSingle();
        if (error) throw error;
        return data ? mapUser(data) : null;
    },

    async list(opts: UserListOptions = {}) {
        let query = getSupabase()
            .from('users')
            .select('*, configurations(name), platform_accounts(count)');

        if (opts.role) query = query.eq('role', opts.role);
        if (opts.search) {
            const s = opts.search.replace(/%/g, '');
            query = query.or(`username.ilike.%${s}%,display_name.ilike.%${s}%`);
        }

        const sortCol = opts.sortBy || 'last_used_at';
        const ascending = opts.sortDir === 'asc';
        query = query.order(sortCol, { ascending, nullsFirst: false });

        const { data, error } = await query;
        if (error) throw error;

        return (data || []).map((row: Record<string, unknown>) => {
            const configs = row.configurations as { name: string } | null;
            const accounts = row.platform_accounts as Array<{ count: number }> | null;
            const { password_hash: _, configurations: __, platform_accounts: ___, ...rest } = row;
            return {
                ...rest,
                config_name: configs?.name ?? null,
                account_count: accounts?.[0]?.count ?? 0,
            } as UserPublic;
        });
    },

    async create(input: CreateUserInput) {
        const password_hash = await bcrypt.hash(input.password, 12);
        const { data, error } = await getSupabase()
            .from('users')
            .insert({
                username: input.username,
                password_hash,
                display_name: input.display_name ?? null,
                role: input.role ?? 'user',
                config_id: input.config_id ?? null,
            })
            .select()
            .single();
        if (error) throw error;
        return mapUser(data);
    },

    async update(id, input: UpdateUserInput) {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.username !== undefined) patch.username = input.username;
        if (input.display_name !== undefined) patch.display_name = input.display_name;
        if (input.role !== undefined) patch.role = input.role;
        if (input.is_disabled !== undefined) patch.is_disabled = input.is_disabled;
        if (input.config_id !== undefined) patch.config_id = input.config_id;
        if (input.password) patch.password_hash = await bcrypt.hash(input.password, 12);

        const { data, error } = await getSupabase()
            .from('users')
            .update(patch)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return mapUser(data);
    },

    async delete(id) {
        const { error } = await getSupabase().from('users').delete().eq('id', id);
        if (error) throw error;
    },

    async touchLastUsed(id) {
        const { error } = await getSupabase()
            .from('users')
            .update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async countByRole(role) {
        let query = getSupabase().from('users').select('id', { count: 'exact', head: true });
        if (role) query = query.eq('role', role);
        const { count, error } = await query;
        if (error) throw error;
        return count ?? 0;
    },
};

const configurationsRepo: ConfigurationRepository = {
    async findById(id) {
        const { data, error } = await getSupabase()
            .from('configurations')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data ? mapConfig(data) : null;
    },

    async list() {
        const { data, error } = await getSupabase()
            .from('configurations')
            .select('*')
            .order('name');
        if (error) throw error;
        return (data || []).map(mapConfig);
    },

    async create(input: CreateConfigurationInput) {
        const settings = encryptConfigSecrets(
            (input.settings || {}) as unknown as Record<string, unknown>
        ) as unknown as SettingsConfig;
        const { data, error } = await getSupabase()
            .from('configurations')
            .insert({ name: input.name, settings })
            .select()
            .single();
        if (error) throw error;
        return mapConfig(data);
    },

    async update(id, input: UpdateConfigurationInput) {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.name !== undefined) patch.name = input.name;
        if (input.settings !== undefined) {
            patch.settings = encryptConfigSecrets(
                input.settings as unknown as Record<string, unknown>
            );
        }
        const { data, error } = await getSupabase()
            .from('configurations')
            .update(patch)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return mapConfig(data);
    },

    async delete(id) {
        const { error } = await getSupabase().from('configurations').delete().eq('id', id);
        if (error) throw error;
    },
};

const platformAccountsRepo: PlatformAccountRepository = {
    async findById(id) {
        const { data, error } = await getSupabase()
            .from('platform_accounts')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data ? mapAccount(data) : null;
    },

    async listByUserId(userId) {
        const { data, error } = await getSupabase()
            .from('platform_accounts')
            .select('*')
            .eq('user_id', userId)
            .order('username');
        if (error) throw error;
        return (data || []).map(mapAccount);
    },

    async create(input: CreatePlatformAccountInput) {
        const config = encryptConfigSecrets((input.config || {}) as Record<string, unknown>);
        const { data, error } = await getSupabase()
            .from('platform_accounts')
            .insert({
                user_id: input.user_id,
                platform: input.platform,
                username: input.username,
                enabled: input.enabled ?? true,
                config,
                skills_content: input.skills_content ?? '',
                post_urls: input.post_urls ?? [],
            })
            .select()
            .single();
        if (error) throw error;
        return mapAccount(data);
    },

    async update(id, input: UpdatePlatformAccountInput) {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.platform !== undefined) patch.platform = input.platform;
        if (input.username !== undefined) patch.username = input.username;
        if (input.enabled !== undefined) patch.enabled = input.enabled;
        if (input.skills_content !== undefined) patch.skills_content = input.skills_content;
        if (input.post_urls !== undefined) patch.post_urls = input.post_urls;
        if (input.config !== undefined) patch.config = encryptConfigSecrets(input.config as Record<string, unknown>);

        const { data, error } = await getSupabase()
            .from('platform_accounts')
            .update(patch)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return mapAccount(data);
    },

    async delete(id) {
        const { error } = await getSupabase().from('platform_accounts').delete().eq('id', id);
        if (error) throw error;
    },

    async countAll() {
        const { count, error } = await getSupabase()
            .from('platform_accounts')
            .select('id', { count: 'exact', head: true });
        if (error) throw error;
        return count ?? 0;
    },
};

const commentsRepo: CommentHistoryRepository = {
    async hasCommented(accountId, platform, postId) {
        const { data, error } = await getSupabase()
            .from('commented_posts')
            .select('id')
            .eq('platform_account_id', accountId)
            .eq('platform', platform)
            .eq('post_id', postId)
            .maybeSingle();
        if (error) throw error;
        return Boolean(data);
    },

    async recordComment(userId, accountId, platform, postId, options = {}) {
        const base = {
            user_id: userId,
            platform_account_id: accountId,
            platform,
            post_id: postId,
            commented_at: new Date().toISOString(),
        };
        const withLog = {
            ...base,
            post_url: options.postUrl ?? null,
            comment_text: options.commentText ?? null,
        };

        let { error } = await getSupabase().from('commented_posts').upsert(withLog, {
            onConflict: 'platform_account_id,platform,post_id',
        });

        if (error && (options.postUrl || options.commentText)) {
            ({ error } = await getSupabase().from('commented_posts').upsert(base, {
                onConflict: 'platform_account_id,platform,post_id',
            }));
        }
        if (error) throw error;
    },

    async listByAccountPaginated(accountId, limit, offset) {
        const { data, error, count } = await getSupabase()
            .from('commented_posts')
            .select('*', { count: 'exact' })
            .eq('platform_account_id', accountId)
            .order('commented_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) throw error;
        const entries = ((data || []) as DbCommentedPost[]).map(row => ({
            ...row,
            post_url: row.post_url ?? null,
            comment_text: row.comment_text ?? null,
        }));
        return { entries, total: count ?? 0 };
    },

    async listByAccount(accountId) {
        const { data, error } = await getSupabase()
            .from('commented_posts')
            .select('*')
            .eq('platform_account_id', accountId)
            .order('commented_at', { ascending: false });
        if (error) throw error;
        return (data || []) as DbCommentedPost[];
    },

    async countAll() {
        const { count, error } = await getSupabase()
            .from('commented_posts')
            .select('id', { count: 'exact', head: true });
        if (error) throw error;
        return count ?? 0;
    },
};

export function getRepositories(): Repositories {
    return {
        users: usersRepo,
        configurations: configurationsRepo,
        platformAccounts: platformAccountsRepo,
        comments: commentsRepo,
        async getStats(): Promise<DashboardStats> {
            const [totalUsers, totalPlatformAccounts, totalComments] = await Promise.all([
                usersRepo.countByRole('user'),
                platformAccountsRepo.countAll(),
                commentsRepo.countAll(),
            ]);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const { count: activeUsers, error } = await getSupabase()
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'user')
                .eq('is_disabled', false)
                .gte('last_used_at', thirtyDaysAgo);
            if (error) throw error;
            return {
                totalUsers,
                activeUsers: activeUsers ?? 0,
                totalPlatformAccounts,
                totalComments,
            };
        },
    };
}
