import type { SettingsConfig } from './types';

const SECRET_SETTINGS_KEYS = ['groqApiKey', 'googleAiApiKey'] as const;

/** Remove AI provider secrets before sending settings to the Electron bot client. */
export function sanitizeBotSettings(settings: SettingsConfig): SettingsConfig {
    const sanitized = { ...settings };
    for (const key of SECRET_SETTINGS_KEYS) {
        delete (sanitized as Record<string, unknown>)[key];
    }
    return sanitized;
}
