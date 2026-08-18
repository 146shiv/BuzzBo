export function extractPostShortcode(urlOrPath: string): string | null {
    const match =
        urlOrPath.match(/instagram\.com\/(?:p|reels?)\/([^/?#]+)/i) ??
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

/** Extract YouTube video ID from watch, youtu.be, or shorts URLs. */
export function extractYouTubeVideoId(urlOrPath: string): string | null {
    const trimmed = urlOrPath.trim();
    const watchMatch = trimmed.match(
        /(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i
    );
    if (watchMatch) {
        return watchMatch[1];
    }

    const embedMatch = trimmed.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i);
    if (embedMatch) {
        return embedMatch[1];
    }

    return null;
}
