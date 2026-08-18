import type { AdminApiClient } from '../api/apiClient';
import type { AiProvider } from '../config/types';
import type {
    AICommentGeneratorAdapter,
    GenerateCommentOverrides,
    SkillsRelevanceAssessment,
} from './genai';
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

    async generateYouTubeComment(
        videoTitle: string,
        channelName: string,
        promptHint?: string,
        description?: string,
        channelSkillsContext?: string,
        _overrides?: GenerateCommentOverrides
    ): Promise<string> {
        const postText = [videoTitle, description?.trim()].filter(Boolean).join('\n\n');
        const youtubeHint = promptHint?.trim()
            ? `YouTube video comment. ${promptHint.trim()}`
            : 'YouTube video comment — be relevant to the video title and description.';

        const result = await this.client.generateComment({
            postText,
            targetUsername: channelName,
            promptHint: youtubeHint,
            channelSkillsContext,
        });
        return result.comment;
    }

    async assessSkillsRelevance(
        postText: string,
        skillsContext: string,
        options?: {
            imageUrl?: string;
            videoUrl?: string;
            authorUsername?: string;
        }
    ): Promise<SkillsRelevanceAssessment> {
        let imageData: { data: string; mimeType: string } | undefined;
        if (options?.imageUrl) {
            const fetched = await fetchImageAsBase64ForComment(options.imageUrl);
            if (fetched) {
                imageData = fetched;
            }
        }

        return this.client.assessRelevance({
            postText,
            skillsContext,
            authorUsername: options?.authorUsername,
            imageUrl: options?.imageUrl,
            videoUrl: options?.videoUrl,
            imageData,
        });
    }
}
