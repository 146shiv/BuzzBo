import { GoogleGenAI, GenerationConfig } from '@google/genai';

/** Sliding-window limiter: max N Gemini API calls per 60 seconds. */
class GeminiRateLimiter {
    private readonly maxRequests: number;
    private readonly windowMs = 60_000;
    private requestTimestamps: number[] = [];
    private mutex: Promise<void> = Promise.resolve();

    constructor(maxRequestsPerMinute: number) {
        this.maxRequests = maxRequestsPerMinute;
    }

    async acquire(): Promise<void> {
        const previous = this.mutex;
        let release!: () => void;
        this.mutex = new Promise<void>(resolve => {
            release = resolve;
        });
        await previous;
        try {
            await this.waitForSlot();
        } finally {
            release();
        }
    }

    private async waitForSlot(): Promise<void> {
        while (true) {
            const now = Date.now();
            this.requestTimestamps = this.requestTimestamps.filter(t => now - t < this.windowMs);

            if (this.requestTimestamps.length < this.maxRequests) {
                this.requestTimestamps.push(now);
                return;
            }

            const oldest = this.requestTimestamps[0];
            const waitMs = this.windowMs - (now - oldest) + 100;
            console.log(
                `[AI_RATE_LIMIT] Gemini limit (${this.maxRequests}/min) reached — waiting ${Math.ceil(waitMs / 1000)}s`
            );
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }
}

export class AICommentGenerator {
    private apiKey: string;
    private readonly mockComments: boolean;
    private readonly rateLimiter: GeminiRateLimiter;
    private generationConfig: GenerationConfig;
    private mockCommentIndex = 0;

    private readonly mockCommentPool = [
        'The framing in this post has a nice natural flow to it',
        'There is a thoughtful quality to how this was put together',
        'The visual tone here feels cohesive and well considered',
        'This captures a moment with a clear sense of focus',
        'The details in this post come through in a subtle way',
    ];

    constructor(
        apiKey: string,
        options: { mockComments?: boolean; maxRequestsPerMinute?: number } = {}
    ) {
        this.mockComments = options.mockComments ?? false;
        if (!this.mockComments && !apiKey) {
            throw new Error('Google AI API key is not provided in config.ts.');
        }
        this.apiKey = apiKey;
        this.rateLimiter = new GeminiRateLimiter(options.maxRequestsPerMinute ?? 15);
        this.generationConfig = {
            temperature: 0.9,
            topP: 1,
            topK: 1,
            maxOutputTokens: 80,
        };
    }

    private buildPrompt(
        postText: string,
        targetUsername: string,
        promptHint?: string,
        hasMedia = false,
        channelSkillsContext?: string
    ): string {
        const sections: string[] = [
            `Write one Instagram comment on a post by @${targetUsername}.`,
            '',
            '## Post',
            postText.trim() || '(no caption — react to what you see in the attached media)',
        ];

        if (hasMedia) {
            sections.push('', 'Media is attached — ground the comment in what you see, not just the caption.');
        }

        const skills = channelSkillsContext?.trim();
        if (skills) {
            sections.push('', '## Style guide', skills);
        }

        if (promptHint?.trim()) {
            sections.push('', '## Extra hint', promptHint.trim());
        }

        sections.push(
            '',
            '## Output',
            'Return only the comment text. No quotes, labels, numbering, or explanation.'
        );

        return sections.join('\n');
    }

    private generateMockComment(postText: string, targetUsername: string): string {
        const caption = postText.trim();
        if (caption.length > 0) {
            const snippet = caption.length > 40 ? `${caption.slice(0, 40)}...` : caption;
            return `The way this post touches on ${snippet.toLowerCase()} feels thoughtfully done`;
        }

        const comment = this.mockCommentPool[this.mockCommentIndex % this.mockCommentPool.length];
        this.mockCommentIndex++;
        return comment;
    }

    private async fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string } | null> {
        try {
            const response = await fetch(imageUrl);
            if (!response.ok) {
                console.error(`Failed to fetch image: ${response.status} ${response.statusText}`);
                return null;
            }
            
            const imageArrayBuffer = await response.arrayBuffer();
            const base64ImageData = Buffer.from(imageArrayBuffer).toString('base64');
            
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            
            return {
                data: base64ImageData,
                mimeType: contentType
            };
        } catch (error) {
            console.error('Error fetching image:', error);
            return null;
        }
    }

    private async fetchVideoAsBase64(videoUrl: string): Promise<{ data: string; mimeType: string } | null> {
        try {
            const response = await fetch(videoUrl);
            if (!response.ok) {
                console.error(`Failed to fetch video: ${response.status} ${response.statusText}`);
                return null;
            }
            
            const videoArrayBuffer = await response.arrayBuffer();
            const base64VideoData = Buffer.from(videoArrayBuffer).toString('base64');
            
            const contentType = response.headers.get('content-type') || 'video/mp4';
            
            return {
                data: base64VideoData,
                mimeType: contentType
            };
        } catch (error) {
            console.error('Error fetching video:', error);
            return null;
        }
    }

    public async generateInstagramComment(
        postText: string,
        targetUsername: string,
        promptHint?: string,
        imageUrl?: string,
        videoUrl?: string,
        channelSkillsContext?: string
    ): Promise<string> {
        if (this.mockComments) {
            const comment = this.generateMockComment(postText, targetUsername);
            console.log(`[AI_MOCK] Using mock comment for @${targetUsername}: "${comment}"`);
            return comment;
        }

        const contents: any[] = [];
        let hasMedia = false;

        if (videoUrl) {
            console.log(`[AI_INFO] Sending video to Gemini for analysis: ${videoUrl.substring(0, 80)}...`);
            const videoData = await this.fetchVideoAsBase64(videoUrl);
            if (videoData) {
                hasMedia = true;
                contents.push({
                    inlineData: {
                        mimeType: videoData.mimeType,
                        data: videoData.data,
                    },
                });
            }
        } else if (imageUrl) {
            console.log(`[AI_INFO] Sending image to Gemini for analysis: ${imageUrl}`);
            const imageData = await this.fetchImageAsBase64(imageUrl);
            if (imageData) {
                hasMedia = true;
                contents.push({
                    inlineData: {
                        mimeType: imageData.mimeType,
                        data: imageData.data,
                    },
                });
            }
        }

        const promptText = this.buildPrompt(
            postText,
            targetUsername,
            promptHint,
            hasMedia,
            channelSkillsContext
        );
        contents.push({ text: promptText });

        try {
            await this.rateLimiter.acquire();

            const genAI = new GoogleGenAI({apiKey: this.apiKey});

            const result = await genAI.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: contents,
                config: this.generationConfig,
            });

            const response = result.text!;
            const text = response.trim();
            if (!text) {
                throw new Error('AI returned an empty comment.');
            }
            return text.replace(/"/g, '');

        } catch (error) {
            console.error(`[AI_ERROR] API Key failed. Error:`, error);
            throw new Error(`Failed to generate comment for @${targetUsername} using the provided API key.`);
        }
    }
}