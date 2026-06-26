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
    const remoteSettings = (botConfig.settings as SettingsConfig) ?? {};
    const settings: SettingsConfig = {
        ...DEFAULT_SETTINGS,
        ...remoteSettings,
        feedBrowse: {
            ...(DEFAULT_SETTINGS.feedBrowse ?? {
                maxItemsToScan: 30,
                maxCommentsPerRun: 5,
                minRelevanceScore: 0.55,
                watchItemSeconds: { min: 3, max: 8 },
                surfaces: ['reels', 'home'],
            }),
            ...remoteSettings.feedBrowse,
        },
    };
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
