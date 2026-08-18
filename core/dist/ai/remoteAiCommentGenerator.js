"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteAICommentGenerator = void 0;
const genai_1 = require("./genai");
class RemoteAICommentGenerator {
    constructor(client, options) {
        this.client = client;
        this.options = options;
    }
    supportsVideoAnalysis() {
        return this.options.aiProvider === 'gemini';
    }
    async generateInstagramComment(postText, targetUsername, promptHint, imageUrl, videoUrl, channelSkillsContext, mentionHandle, _overrides) {
        let imageData;
        if (imageUrl) {
            const fetched = await (0, genai_1.fetchImageAsBase64ForComment)(imageUrl);
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
    async generateYouTubeComment(videoTitle, channelName, promptHint, description, channelSkillsContext, _overrides) {
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
    async assessSkillsRelevance(postText, skillsContext, options) {
        let imageData;
        if (options?.imageUrl) {
            const fetched = await (0, genai_1.fetchImageAsBase64ForComment)(options.imageUrl);
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
exports.RemoteAICommentGenerator = RemoteAICommentGenerator;
