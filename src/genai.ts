import { GoogleGenAI, GenerationConfig } from '@google/genai';
import type { AiProvider } from './config';

/** Sliding-window limiter: max N AI API calls per 60 seconds. */
class AiRateLimiter {
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
                `[AI_RATE_LIMIT] AI limit (${this.maxRequests}/min) reached — waiting ${Math.ceil(waitMs / 1000)}s`
            );
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }
}

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

interface MediaPayload {
    data: string;
    mimeType: string;
}

interface OpenAiChatMessage {
    role: 'user';
    content: string | OpenAiContentPart[];
}

type OpenAiContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

export class AICommentGenerator {
    private readonly provider: AiProvider;
    private readonly googleAiApiKey: string;
    private readonly groqApiKey: string;
    private readonly groqModel: string;
    private readonly groqVisionModel: string;
    private readonly localLlmBaseUrl: string;
    private readonly localLlmModel: string;
    private readonly mockComments: boolean;
    private readonly rateLimiter: AiRateLimiter;
    private readonly generationConfig: GenerationConfig;
    private mockCommentIndex = 0;

    private readonly mockCommentPool = [
        'The framing in this post has a nice natural flow to it',
        'There is a thoughtful quality to how this was put together',
        'The visual tone here feels cohesive and well considered',
        'This captures a moment with a clear sense of focus',
        'The details in this post come through in a subtle way',
    ];

    constructor(options: AICommentGeneratorOptions) {
        this.provider = options.provider;
        this.mockComments = options.mockComments ?? false;
        this.googleAiApiKey = options.googleAiApiKey ?? '';
        this.groqApiKey = options.groqApiKey ?? '';
        this.groqModel = options.groqModel ?? 'llama-3.3-70b-versatile';
        this.groqVisionModel = options.groqVisionModel ?? 'meta-llama/llama-4-scout-17b-16e-instruct';
        this.localLlmBaseUrl = (options.localLlmBaseUrl ?? 'http://localhost:11434/v1').replace(/\/$/, '');
        this.localLlmModel = options.localLlmModel ?? 'llama3.2';
        this.rateLimiter = new AiRateLimiter(options.maxRequestsPerMinute ?? 15);
        this.generationConfig = {
            temperature: 0.9,
            topP: 1,
            topK: 1,
            maxOutputTokens: 80,
        };

        if (!this.mockComments) {
            this.validateProviderConfig();
        }
    }

    private validateProviderConfig(): void {
        switch (this.provider) {
            case 'gemini':
                if (!this.googleAiApiKey) {
                    throw new Error('Google AI API key is not provided in config.ts.');
                }
                break;
            case 'groq':
                if (!this.groqApiKey) {
                    throw new Error('Groq API key is not provided in config.ts.');
                }
                break;
            case 'local':
                if (!this.localLlmBaseUrl) {
                    throw new Error('localLlmBaseUrl is not set in config.ts.');
                }
                if (!this.localLlmModel) {
                    throw new Error('localLlmModel is not set in config.ts.');
                }
                break;
        }
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

    private generateMockComment(postText: string, _targetUsername: string): string {
        const caption = postText.trim();
        if (caption.length > 0) {
            const snippet = caption.length > 40 ? `${caption.slice(0, 40)}...` : caption;
            return `The way this post touches on ${snippet.toLowerCase()} feels thoughtfully done`;
        }

        const comment = this.mockCommentPool[this.mockCommentIndex % this.mockCommentPool.length];
        this.mockCommentIndex++;
        return comment;
    }

    private async fetchImageAsBase64(imageUrl: string): Promise<MediaPayload | null> {
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
                mimeType: contentType,
            };
        } catch (error) {
            console.error('Error fetching image:', error);
            return null;
        }
    }

    private async fetchVideoAsBase64(videoUrl: string): Promise<MediaPayload | null> {
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
                mimeType: contentType,
            };
        } catch (error) {
            console.error('Error fetching video:', error);
            return null;
        }
    }

    private sanitizeComment(text: string): string {
        const trimmed = text.trim();
        if (!trimmed) {
            throw new Error('AI returned an empty comment.');
        }
        return trimmed.replace(/"/g, '');
    }

    private buildOpenAiMessages(promptText: string, imageData?: MediaPayload | null): OpenAiChatMessage[] {
        if (!imageData) {
            return [{ role: 'user', content: promptText }];
        }

        return [
            {
                role: 'user',
                content: [
                    { type: 'text', text: promptText },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${imageData.mimeType};base64,${imageData.data}`,
                        },
                    },
                ],
            },
        ];
    }

    private async generateWithGemini(
        promptText: string,
        imageData: MediaPayload | null,
        videoData: MediaPayload | null,
        targetUsername: string
    ): Promise<string> {
        const contents: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

        if (videoData) {
            contents.push({
                inlineData: {
                    mimeType: videoData.mimeType,
                    data: videoData.data,
                },
            });
        } else if (imageData) {
            contents.push({
                inlineData: {
                    mimeType: imageData.mimeType,
                    data: imageData.data,
                },
            });
        }

        contents.push({ text: promptText });

        await this.rateLimiter.acquire();

        const genAI = new GoogleGenAI({ apiKey: this.googleAiApiKey });
        const result = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents,
            config: this.generationConfig,
        });

        return this.sanitizeComment(result.text ?? '');
    }

    private async generateWithOpenAiCompatible(
        providerLabel: 'groq' | 'local',
        apiUrl: string,
        apiKey: string | undefined,
        model: string,
        messages: OpenAiChatMessage[],
        targetUsername: string
    ): Promise<string> {
        await this.rateLimiter.acquire();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${apiUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.9,
                max_tokens: 80,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(
                `${providerLabel} API error (${response.status}): ${errorBody.slice(0, 300)}`
            );
        }

        const payload = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const text = payload.choices?.[0]?.message?.content;
        if (!text) {
            throw new Error(`${providerLabel} returned an empty comment.`);
        }

        return this.sanitizeComment(text);
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

        let imageData: MediaPayload | null = null;
        let videoData: MediaPayload | null = null;
        let hasMedia = false;

        if (videoUrl && this.provider === 'gemini') {
            console.log(
                `[AI_INFO] Sending video to ${this.provider} for analysis: ${videoUrl.substring(0, 80)}...`
            );
            videoData = await this.fetchVideoAsBase64(videoUrl);
            hasMedia = Boolean(videoData);
        } else if (imageUrl) {
            console.log(`[AI_INFO] Sending image to ${this.provider} for analysis: ${imageUrl}`);
            imageData = await this.fetchImageAsBase64(imageUrl);
            hasMedia = Boolean(imageData);
        } else if (videoUrl) {
            console.log(
                `[AI_INFO] Video detected for ${this.provider}; using caption-only prompt (video bytes not sent).`
            );
            hasMedia = true;
        }

        const promptText = this.buildPrompt(
            postText,
            targetUsername,
            promptHint,
            hasMedia,
            channelSkillsContext
        );

        try {
            switch (this.provider) {
                case 'gemini':
                    return await this.generateWithGemini(promptText, imageData, videoData, targetUsername);
                case 'groq':
                    return await this.generateWithOpenAiCompatible(
                        'groq',
                        'https://api.groq.com/openai/v1',
                        this.groqApiKey,
                        imageData ? this.groqVisionModel : this.groqModel,
                        this.buildOpenAiMessages(promptText, imageData),
                        targetUsername
                    );
                case 'local':
                    return await this.generateWithOpenAiCompatible(
                        'local',
                        this.localLlmBaseUrl,
                        undefined,
                        this.localLlmModel,
                        this.buildOpenAiMessages(promptText, imageData),
                        targetUsername
                    );
                default:
                    throw new Error(`Unsupported AI provider: ${this.provider}`);
            }
        } catch (error) {
            console.error(`[AI_ERROR] ${this.provider} request failed:`, error);
            throw new Error(`Failed to generate comment for @${targetUsername} using ${this.provider}.`);
        }
    }
}
