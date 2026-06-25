import type { Repositories } from './repository';
import { getRepositories as getSupabaseRepos } from './supabase';

export function getRepositories(): Repositories {
    const provider = process.env.DB_PROVIDER || 'supabase';
    if (provider === 'supabase') {
        return getSupabaseRepos();
    }
    throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
}

export * from './repository';
export * from './types';
