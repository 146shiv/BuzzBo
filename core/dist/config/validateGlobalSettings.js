"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGlobalSettings = validateGlobalSettings;
function isPlaceholderKey(value, placeholder) {
    const trimmed = value.trim();
    return !trimmed || trimmed === placeholder;
}
function validateGlobalSettings(settings) {
    if (settings.mockAiComments) {
        return null;
    }
    switch (settings.aiProvider) {
        case 'gemini':
            if (isPlaceholderKey(settings.googleAiApiKey, 'YOUR_GOOGLE_AI_API_KEY_HERE')) {
                return 'Google AI API key is required when using Gemini';
            }
            break;
        case 'groq':
            if (isPlaceholderKey(settings.groqApiKey, 'YOUR_GROQ_API_KEY_HERE')) {
                return 'Groq API key is required when using Groq';
            }
            break;
        case 'local':
            if (!settings.localLlmBaseUrl?.trim()) {
                return 'Local LLM URL is required when using Local LLM';
            }
            if (!settings.localLlmModel?.trim()) {
                return 'Local LLM model is required when using Local LLM';
            }
            break;
    }
    return null;
}
