"use strict";
/** Shared config types — kept in sync with src/config.ts (types only, no runtime). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = exports.PLATFORM_LABELS = exports.Platform = void 0;
var Platform;
(function (Platform) {
    Platform[Platform["Instagram"] = 1] = "Instagram";
    Platform[Platform["YouTube"] = 2] = "YouTube";
})(Platform || (exports.Platform = Platform = {}));
exports.PLATFORM_LABELS = {
    [Platform.Instagram]: 'Instagram',
    [Platform.YouTube]: 'YouTube',
};
exports.DEFAULT_SETTINGS = {
    headless: true,
    developerMode: false,
    browserChannel: 'chrome',
    browserViewport: { width: 1440, height: 900 },
    aiProvider: 'groq',
    googleAiApiKey: 'YOUR_GOOGLE_AI_API_KEY_HERE',
    groqApiKey: 'YOUR_GROQ_API_KEY_HERE',
    groqModel: 'llama-3.3-70b-versatile',
    groqVisionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    localLlmBaseUrl: 'http://localhost:11434/v1',
    localLlmModel: 'llama3.2',
    mockAiComments: false,
    aiMaxRequestsPerMinute: 15,
    monitoringIntervalSeconds: { min: 360, max: 600 },
    behavior: {
        shortWaitMs: { base: 1200, variance: 2000 },
        navigationWaitMs: { base: 3500, variance: 4500 },
        typingDelayMs: { base: 140, variance: 220 },
    },
    defaultActionDelaySeconds: { min: 90, max: 180 },
    hashtagSearch: {
        ui_search: {
            maxPostsToScan: 2,
            maxPostsToComment: 3,
            minLikes: 0,
            minComments: 0,
            likeWeight: 1,
            commentWeight: 2,
            preferTopTab: true,
        },
        api_search: {
            fetchBatchSize: 100,
            maxPostsToComment: 5,
            minLikes: 0,
            minComments: 0,
            likeWeight: 1,
            commentWeight: 2,
        },
    },
    feedBrowse: {
        maxItemsToScan: 30,
        maxCommentsPerRun: 5,
        minRelevanceScore: 0.55,
        watchItemSeconds: { min: 3, max: 8 },
        surfaces: ['reels', 'home'],
    },
};
