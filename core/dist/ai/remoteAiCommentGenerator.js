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
}
exports.RemoteAICommentGenerator = RemoteAICommentGenerator;
