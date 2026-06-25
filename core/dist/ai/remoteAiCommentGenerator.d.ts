import type { AdminApiClient } from '../api/apiClient';
import type { AiProvider } from '../config/types';
import type { AICommentGeneratorAdapter, GenerateCommentOverrides } from './genai';
export interface RemoteAICommentGeneratorOptions {
    aiProvider: AiProvider;
}
export declare class RemoteAICommentGenerator implements AICommentGeneratorAdapter {
    private readonly client;
    private readonly options;
    constructor(client: AdminApiClient, options: RemoteAICommentGeneratorOptions);
    supportsVideoAnalysis(): boolean;
    generateInstagramComment(postText: string, targetUsername: string, promptHint?: string, imageUrl?: string, videoUrl?: string, channelSkillsContext?: string, mentionHandle?: string, _overrides?: GenerateCommentOverrides): Promise<string>;
}
//# sourceMappingURL=remoteAiCommentGenerator.d.ts.map