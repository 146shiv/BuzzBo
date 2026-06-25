export function extractPostShortcode(urlOrPath: string): string | null {
    const match =
        urlOrPath.match(/instagram\.com\/(?:p|reels?)\/([^/?#]+)/i) ??
        urlOrPath.match(/\/(?:p|reels?)\/([^/?#]+)/i);
    return match ? match[1] : null;
}
