"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeBotSettings = sanitizeBotSettings;
const SECRET_SETTINGS_KEYS = ['groqApiKey', 'googleAiApiKey'];
/** Remove AI provider secrets before sending settings to the Electron bot client. */
function sanitizeBotSettings(settings) {
    const sanitized = { ...settings };
    for (const key of SECRET_SETTINGS_KEYS) {
        delete sanitized[key];
    }
    return sanitized;
}
