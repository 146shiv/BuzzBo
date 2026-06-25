import type { AdminApiClient } from '../api/apiClient';
import type { AiProvider } from '../config/types';
import type { AICommentGeneratorAdapter, GenerateCommentOverrides } from './genai';
import { fetchImageAsBase64ForComment } from './genai';

export interface RemoteAICommentGeneratorOptions {
    aiProvider: AiProvider;
}

export class RemoteAICommentGenerator implements AICommentGeneratorAdapter {
    constructor(
        private readonly client: AdminApiClient,
        private readonly options: RemoteAICommentGeneratorOptions
    ) {}

    supportsVideoAnalysis(): boolean {
        return this.options.aiProvider === 'gemini';
    }

    async generateInstagramComment(
        postText: string,
        targetUsername: string,
        promptHint?: string,
        imageUrl?: string,
        videoUrl?: string,
        channelSkillsContext?: string,
        mentionHandle?: string,
        _overrides?: GenerateCommentOverrides
    ): Promise<string> {
        let imageData: { data: string; mimeType: string } | undefined;
        if (imageUrl) {
            const fetched = await fetchImageAsBase64ForComment(imageUrl);
            if (fetched) {
                imageData = fetched;
            }
        }

        const result = await this.client.generateComment({
            postText,
            targetUsername,
            promptHint,
            imageUrl,
            videoUrl,
            channelSkillsContext,
            mentionHandle,
            imageData,
        });
        return result.comment;
    }
}
