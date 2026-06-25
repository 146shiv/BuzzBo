import { GoogleGenAI, GenerationConfig } from '@google/genai';
import type { AiProvider } from '../config/types';

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
        channelSkillsContext?: string,
        mentionHandle?: string
    ): string {
        const caption = postText.trim();
        const sections: string[] = [
            `Write one Instagram comment on a post by @${targetUsername}.`,
            '',
            '## Post caption',
            caption || '(no caption — infer topic from attached media)',
        ];

        if (caption) {
            sections.push(
                '',
                '## Context rule',
                'Reuse specific words, topics, or pain points from the caption above. Do not write a generic comment detached from this post.'
            );
        }

        if (hasMedia) {
            sections.push('', 'Media is attached — ground the comment in what you see, not just the caption.');
        }

        const skills = channelSkillsContext?.trim();
        if (skills) {
            sections.push('', '## Style guide', skills);
        }

        const handle = mentionHandle?.trim().replace(/^@/, '');
        if (handle) {
            sections.push(
                '',
                '## App mention',
                `Include @${handle} in the comment when it fits the style guide.`,
                'Instagram needs the literal @username — do not write the name without @.'
            );
        }

        if (promptHint?.trim()) {
            sections.push('', '## Extra hint', promptHint.trim());
        }

        sections.push(
            '',
            '## Output',
            'Return only the comment text. No quotes, labels, numbering, or explanation.',
            'Be witty or lightly sarcastic — never bland, never a supportive student essay.',
            'NEVER say you lack context, need more information, or ask anyone for details.',
            'NEVER admit confusion. If unclear, write one sharp study-life one-liner with the app mention.'
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
        if (isUnusableAiComment(trimmed)) {
            throw new Error('AI returned an unusable comment (refusal or low quality).');
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

    public supportsVideoAnalysis(): boolean {
        return this.provider === 'gemini';
    }

    public async generateInstagramComment(
        postText: string,
        targetUsername: string,
        promptHint?: string,
        imageUrl?: string,
        videoUrl?: string,
        channelSkillsContext?: string,
        mentionHandle?: string
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
        } else if (videoUrl && this.provider !== 'gemini') {
            console.log(
                `[AI_INFO] Video URL found but ${this.provider} cannot analyze video bytes; caption-only prompt.`
            );
        }

        const promptText = this.buildPrompt(
            postText,
            targetUsername,
            promptHint,
            hasMedia,
            channelSkillsContext,
            mentionHandle
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

const META_REFUSAL_PATTERNS = [
    /give me the context/i,
    /not getting the (right )?context/i,
    /cannot generate/i,
    /can't generate/i,
    /can not generate/i,
    /unable to (write|generate|create|provide).*comment/i,
    /insufficient context/i,
    /need more (context|information|details)/i,
    /please provide (more |the )?(context|information|details)/i,
    /i (?:do not|don't) have (?:enough|sufficient) (?:context|information)/i,
    /without (?:more )?(?:context|information|details)/i,
];

const LOW_QUALITY_COMMENT_PATTERNS = [
    /no idea what/i,
    /don't know what/i,
    /do not know what/i,
    /not sure what/i,
    /can't tell what/i,
    /cannot tell what/i,
    /what(?:'s| is) going on/i,
    /what is this (?:post|reel|video)/i,
    /what am i looking at/i,
    /makes no sense/i,
    /doesn't make sense/i,
    /does not make sense/i,
    /(?:this|the) (?:post|reel|video) (?:is )?confus/i,
    /idk what/i,
    /\blol\b.*\b(?:no idea|don't know|not sure)/i,
    /^(?:so )?relatable[.!?\s]*$/i,
    /\b(?:love|loving) this (?:post|reel|video|content)\b/i,
    /\bgreat (?:post|reel|video|content)\b/i,
    /\bnice (?:post|reel|video|content)\b/i,
    /\bawesome (?:post|reel|video|content)\b/i,
    /\bsupportive\b.*\bstudent\b/i,
];

const CAPTION_NOISE_PATTERNS = [
    /^view all/i,
    /^liked by/i,
    /^see translation/i,
    /^view \d+ repl/i,
    /^\d+ (?:likes?|comments?|views?)/i,
    /^original audio/i,
    /^audio/i,
];

const MIN_SUBSTANTIVE_CAPTION_LENGTH = 12;

const GENERIC_FALLBACK_TEMPLATES = [
    'the syllabus is not going to panic-study itself — @{handle} is my toxic little accountability partner',
    'watching study reels counts as studying in no universe… @{handle} is the only timer that scares me straight',
    'my streak died so many times @{handle} should send condolences',
    'planned to study all day, achieved nothing — @{handle} streak guilt hits different',
    'pomodoro said 25 min focus, my brain said 25 min overthinking — @{handle} at least keeps score',
];

export function isSubstantiveCaption(caption: string): boolean {
    const trimmed = caption.trim();
    if (trimmed.length < MIN_SUBSTANTIVE_CAPTION_LENGTH) {
        return false;
    }
    if (/^@?[a-zA-Z0-9._]+$/.test(trimmed) && trimmed.replace(/^@/, '').length < 18) {
        return false;
    }
    return !CAPTION_NOISE_PATTERNS.some(pattern => pattern.test(trimmed));
}

export function isMetaRefusalComment(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return true;
    return META_REFUSAL_PATTERNS.some(pattern => pattern.test(trimmed));
}

export function isLowQualityAiComment(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return true;
    return LOW_QUALITY_COMMENT_PATTERNS.some(pattern => pattern.test(trimmed));
}

export function isUnusableAiComment(text: string): boolean {
    return isMetaRefusalComment(text) || isLowQualityAiComment(text);
}

export function getGenericStudyFallbackComment(mentionHandle?: string): string {
    const handle = mentionHandle?.trim().replace(/^@/, '') || 'studyboapp';
    const template =
        GENERIC_FALLBACK_TEMPLATES[Math.floor(Math.random() * GENERIC_FALLBACK_TEMPLATES.length)];
    return template.replace('{handle}', handle);
}

export function hasActionablePostContext(
    postText: string,
    imageUrl?: string,
    videoUrl?: string,
    videoAnalysisAvailable = false,
    isVideoPost = false
): boolean {
    const substantiveCaption = isSubstantiveCaption(postText);

    if (imageUrl) {
        return true;
    }

    if (videoUrl && videoAnalysisAvailable) {
        return true;
    }

    if (isVideoPost && videoUrl && !videoAnalysisAvailable) {
        return substantiveCaption;
    }

    return substantiveCaption;
}
