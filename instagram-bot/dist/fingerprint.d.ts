export interface Fingerprint {
    userAgent: string;
    viewport: {
        width: number;
        height: number;
    };
    deviceScaleFactor: number;
    locale: string;
    timezoneId: string;
    colorScheme: 'light' | 'dark';
    reducedMotion: 'no-preference' | 'reduce';
    hardwareConcurrency: number;
    deviceMemory: number;
    webgl: {
        vendor: string;
        renderer: string;
    };
    canvas?: string;
    audioContext?: {
        sampleRate: number;
        channelCount: number;
    };
}
export declare const generateFingerprint: () => Fingerprint;
//# sourceMappingURL=fingerprint.d.ts.map