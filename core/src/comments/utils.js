"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPostShortcode = extractPostShortcode;
function extractPostShortcode(urlOrPath) {
    const match = urlOrPath.match(/instagram\.com\/(?:p|reels?)\/([^/?#]+)/i) ??
        urlOrPath.match(/\/(?:p|reels?)\/([^/?#]+)/i);
    return match ? match[1] : null;
}
