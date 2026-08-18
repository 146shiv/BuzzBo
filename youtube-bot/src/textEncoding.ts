/**
 * Unicode-safe helpers for Instagram comment entry.
 * JavaScript strings are UTF-16; indexing with [i] splits surrogate pairs (emoji) into invalid units.
 */

export function splitGraphemes(text: string): string[] {
    const intlWithSegmenter = Intl as typeof Intl & {
        Segmenter?: new (
            locales?: string | string[],
            options?: { granularity?: 'grapheme' }
        ) => { segment: (input: string) => Iterable<{ segment: string }> };
    };

    if (typeof intlWithSegmenter.Segmenter === 'function') {
        const segmenter = new intlWithSegmenter.Segmenter(undefined, { granularity: 'grapheme' });
        return [...segmenter.segment(text)].map(segment => segment.segment);
    }

    return [...text];
}

/** ASCII printable chars can use Playwright keyboard.type(); emoji and other Unicode need DOM insert. */
export function needsKeyboardType(grapheme: string): boolean {
    if (grapheme.length !== 1) {
        return false;
    }

    const codePoint = grapheme.codePointAt(0);
    return codePoint !== undefined && codePoint >= 32 && codePoint <= 126;
}

export function splitIntoTypingRuns(text: string): Array<{ kind: 'ascii' | 'unicode'; text: string }> {
    const runs: Array<{ kind: 'ascii' | 'unicode'; text: string }> = [];

    for (const grapheme of splitGraphemes(text)) {
        const kind = needsKeyboardType(grapheme) ? 'ascii' : 'unicode';
        const last = runs[runs.length - 1];

        if (last && last.kind === kind) {
            last.text += grapheme;
        } else {
            runs.push({ kind, text: grapheme });
        }
    }

    return runs;
}

export function textContainsUnicodeOutsideAscii(text: string): boolean {
    return splitIntoTypingRuns(text).some(run => run.kind === 'unicode');
}

export function commentTextHasEncodingCorruption(expected: string, actual: string): boolean {
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
