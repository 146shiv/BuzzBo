"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPostShortcode = extractPostShortcode;
function extractPostShortcode(urlOrPath) {
    const match = urlOrPath.match(/instagram\.com\/(?:p|reels?)\/([^/?#]+)/i) ??
        urlOrPath.match(/\/(?:p|reels?)\/([^/?#]+)/i);
    if (!match) {
        return null;
    }
    const shortcode = match[1];
    const reserved = new Set(['reels', 'reel', 'p', 'explore', 'accounts', 'stories', 'direct']);
    if (reserved.has(shortcode.toLowerCase()) || shortcode.length < 5) {
        return null;
    }
    return shortcode;
}
