"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGlobalSettings = exports.sanitizeBotSettings = exports.Platform = exports.PLATFORM_LABELS = exports.DEFAULT_SETTINGS = void 0;
__exportStar(require("./types"), exports);
var types_1 = require("./types");
Object.defineProperty(exports, "DEFAULT_SETTINGS", { enumerable: true, get: function () { return types_1.DEFAULT_SETTINGS; } });
Object.defineProperty(exports, "PLATFORM_LABELS", { enumerable: true, get: function () { return types_1.PLATFORM_LABELS; } });
Object.defineProperty(exports, "Platform", { enumerable: true, get: function () { return types_1.Platform; } });
var sanitizeBotSettings_1 = require("./sanitizeBotSettings");
Object.defineProperty(exports, "sanitizeBotSettings", { enumerable: true, get: function () { return sanitizeBotSettings_1.sanitizeBotSettings; } });
var validateGlobalSettings_1 = require("./validateGlobalSettings");
Object.defineProperty(exports, "validateGlobalSettings", { enumerable: true, get: function () { return validateGlobalSettings_1.validateGlobalSettings; } });
