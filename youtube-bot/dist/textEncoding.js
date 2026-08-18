"use strict";
/**
 * Unicode-safe helpers for Instagram comment entry.
 * JavaScript strings are UTF-16; indexing with [i] splits surrogate pairs (emoji) into invalid units.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitGraphemes = splitGraphemes;
exports.needsKeyboardType = needsKeyboardType;
exports.splitIntoTypingRuns = splitIntoTypingRuns;
exports.textContainsUnicodeOutsideAscii = textContainsUnicodeOutsideAscii;
exports.commentTextHasEncodingCorruption = commentTextHasEncodingCorruption;
function splitGraphemes(text) {
    const intlWithSegmenter = Intl;
    if (typeof intlWithSegmenter.Segmenter === 'function') {
        const segmenter = new intlWithSegmenter.Segmenter(undefined, { granularity: 'grapheme' });
        return [...segmenter.segment(text)].map(segment => segment.segment);
    }
    return [...text];
}
/** ASCII printable chars can use Playwright keyboard.type(); emoji and other Unicode need DOM insert. */
function needsKeyboardType(grapheme) {
    if (grapheme.length !== 1) {
        return false;
    }
    const codePoint = grapheme.codePointAt(0);
    return codePoint !== undefined && codePoint >= 32 && codePoint <= 126;
}
function splitIntoTypingRuns(text) {
    const runs = [];
    for (const grapheme of splitGraphemes(text)) {
        const kind = needsKeyboardType(grapheme) ? 'ascii' : 'unicode';
        const last = runs[runs.length - 1];
        if (last && last.kind === kind) {
            last.text += grapheme;
        }
        else {
            runs.push({ kind, text: grapheme });
        }
    }
    return runs;
}
function textContainsUnicodeOutsideAscii(text) {
    return splitIntoTypingRuns(text).some(run => run.kind === 'unicode');
}
function commentTextHasEncodingCorruption(expected, actual) {
    if (actual.includes('\uFFFD')) {
        return true;
    }
    const expectedEmoji = expected.match(/\p{Extended_Pictographic}/gu) ?? [];
    for (const emoji of expectedEmoji) {
        if (!actual.includes(emoji)) {
            return true;
        }
    }
    return false;
}
