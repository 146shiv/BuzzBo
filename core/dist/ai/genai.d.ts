import type { AiProvider } from '../config/types';
export interface AICommentGeneratorOptions {
    provider: AiProvider;
    googleAiApiKey?: string;
    groqApiKey?: string;
    groqModel?: string;
    groqVisionModel?: string;
    localLlmBaseUrl?: string;
    localLlmModel?: string;
    mockComments?: boolean;
    maxRequestsPerMinute?: number;
}
export interface MediaPayload {
    data: string;
    mimeType: string;
}
export interface GenerateCommentOverrides {
    imageData?: MediaPayload | null;
    preserveErrorMessage?: boolean;
}
export interface AICommentGeneratorAdapter {
    supportsVideoAnalysis(): boolean;
    generateInstagramComment(postText: string, targetUsername: string, promptHint?: string, imageUrl?: string, videoUrl?: string, channelSkillsContext?: string, mentionHandle?: string, overrides?: GenerateCommentOverrides): Promise<string>;
}
export declare function fetchImageAsBase64ForComment(imageUrl: string): Promise<MediaPayload | null>;
export declare class AICommentGenerator implements AICommentGeneratorAdapter {
    private readonly provider;
    private readonly googleAiApiKey;
    private readonly groqApiKey;
    private readonly groqModel;
    private readonly groqVisionModel;
    private readonly localLlmBaseUrl;
    private readonly localLlmModel;
    private readonly mockComments;
    private readonly rateLimiter;
    private readonly generationConfig;
    private mockCommentIndex;
    private readonly mockCommentPool;
    constructor(options: AICommentGeneratorOptions);
    private validateProviderConfig;
    private buildPrompt;
    private generateMockComment;
    private fetchVideoAsBase64;
    private sanitizeComment;
    private buildOpenAiMessages;
    private generateWithGemini;
    private generateWithOpenAiCompatible;
    supportsVideoAnalysis(): boolean;
    generateInstagramComment(postText: string, targetUsername: string, promptHint?: string, imageUrl?: string, videoUrl?: string, channelSkillsContext?: string, mentionHandle?: string, overrides?: GenerateCommentOverrides): Promise<string>;
}
export declare function isSubstantiveCaption(caption: string): boolean;
export declare function isMetaRefusalComment(text: string): boolean;
export declare function isLowQualityAiComment(text: string): boolean;
export declare function isUnusableAiComment(text: string): boolean;
export declare function getGenericStudyFallbackComment(mentionHandle?: string): string;
export declare function hasActionablePostContext(postText: string, imageUrl?: string, videoUrl?: string, videoAnalysisAvailable?: boolean, isVideoPost?: boolean): boolean;
//# sourceMappingURL=genai.d.ts.map