import type { AccountConfig, Config, SettingsConfig } from '@buzzbo/core/config';
import { DEFAULT_SETTINGS } from '@buzzbo/core/config';
import { AdminApiClient } from '@buzzbo/core/api/apiClient';
import { platformAccountToBotConfig } from './platformAccountMapper';

export interface LoadedConfig {
    settings: SettingsConfig;
    accounts: AccountConfig[];
    rawAccounts: Record<string, unknown>[];
}

export async function loadConfigFromApi(client: AdminApiClient): Promise<LoadedConfig> {
    const botConfig = await client.getBotConfig();
    const settings = (botConfig.settings as SettingsConfig) ?? DEFAULT_SETTINGS;
    const enabledAccounts = (botConfig.accounts as AccountConfig[]) ?? [];
    const allAccounts = await client.listAccounts();
    return {
        settings,
        accounts: enabledAccounts,
        rawAccounts: allAccounts as Record<string, unknown>[],
    };
}

export function mergeRunConfig(
    settings: SettingsConfig,
    account: AccountConfig
): Config {
    return { settings, accounts: [account] };
}

export { platformAccountToBotConfig } from './platformAccountMapper';
