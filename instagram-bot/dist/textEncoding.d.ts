/**
 * Unicode-safe helpers for Instagram comment entry.
 * JavaScript strings are UTF-16; indexing with [i] splits surrogate pairs (emoji) into invalid units.
 */
export declare function splitGraphemes(text: string): string[];
/** ASCII printable chars can use Playwright keyboard.type(); emoji and other Unicode need DOM insert. */
export declare function needsKeyboardType(grapheme: string): boolean;
export declare function splitIntoTypingRuns(text: string): Array<{
    kind: 'ascii' | 'unicode';
    text: string;
}>;
export declare function textContainsUnicodeOutsideAscii(text: string): boolean;
export declare function commentTextHasEncodingCorruption(expected: string, actual: string): boolean;
//# sourceMappingURL=textEncoding.d.ts.map