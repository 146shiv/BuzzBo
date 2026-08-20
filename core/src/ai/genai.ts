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

export interface MediaPayload {
    data: string;
    mimeType: string;
}

export interface GenerateCommentOverrides {
    imageData?: MediaPayload | null;
    preserveErrorMessage?: boolean;
}

export interface SkillsRelevanceAssessment {
    relevant: boolean;
    score: number;
    reason: string;
}

export interface AssessSkillsRelevanceOptions {
    imageUrl?: string;
    videoUrl?: string;
    authorUsername?: string;
    imageData?: MediaPayload | null;
}

export interface AICommentGeneratorAdapter {
    supportsVideoAnalysis(): boolean;
    generateInstagramComment(
        postText: string,
        targetUsername: string,
        promptHint?: string,
        imageUrl?: string,
        videoUrl?: string,
        channelSkillsContext?: string,
        mentionHandle?: string,
        overrides?: GenerateCommentOverrides
    ): Promise<string>;
    generateYouTubeComment(
        videoTitle: string,
        channelName: string,
        promptHint?: string,
        description?: string,
        channelSkillsContext?: string,
        overrides?: GenerateCommentOverrides
    ): Promise<string>;
    assessSkillsRelevance(
        postText: string,
        skillsContext: string,
        options?: AssessSkillsRelevanceOptions
    ): Promise<SkillsRelevanceAssessment>;
}

interface OpenAiChatMessage {
    role: 'user' | 'system';
    content: string | OpenAiContentPart[];
}

type OpenAiContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

type OpenAiChatCompletionPayload = {
    choices?: Array<{
        finish_reason?: string | null;
        message?: { content?: string | null; reasoning?: string | null };
    }>;
    usage?: {
        completion_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
    };
};

function isGroqReasoningModel(model: string): boolean {
    const normalized = model.toLowerCase();
    return normalized.includes('gpt-oss') || normalized.startsWith('qwen/');
}

function buildOpenAiCompatibleBody(
    model: string,
    messages: OpenAiChatMessage[],
    options: {
        providerLabel: 'groq' | 'local';
        temperature: number;
        maxCompletionTokens: number;
        jsonMode?: boolean;
    }
): Record<string, unknown> {
    if (options.providerLabel === 'groq' && isGroqReasoningModel(model)) {
        return {
            model,
            messages,
            temperature: options.temperature,
            max_completion_tokens: options.maxCompletionTokens,
            reasoning_effort: 'low',
            include_reasoning: false,
            ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        };
    }

    return {
        model,
        messages,
        temperature: options.temperature,
        max_tokens: options.maxCompletionTokens,
        ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    };
}

function extractChatCompletionText(payload: OpenAiChatCompletionPayload): string {
    const choice = payload.choices?.[0];
    const content = choice?.message?.content?.trim();
    if (content) return content;

    const reasoning = choice?.message?.reasoning?.trim();
    if (!reasoning) return '';

    const jsonMatch = reasoning.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0];
    if (reasoning.length <= 280) return reasoning;
    return '';
}

function logEmptyGroqCompletion(model: string, payload: OpenAiChatCompletionPayload): void {
    const choice = payload.choices?.[0];
    console.warn(
        `[AI_WARN] Empty Groq content for ${model} (finish_reason=${choice?.finish_reason ?? 'unknown'} reasoning_tokens=${payload.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'})`
    );
}

export async function fetchImageAsBase64ForComment(imageUrl: string): Promise<MediaPayload | null> {
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

export class AICommentGenerator implements AICommentGeneratorAdapter {
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
        this.groqApiKey = options.groqApiKey?.trim() ?? '';
        this.groqModel = (options.groqModel ?? 'openai/gpt-oss-20b').trim();
        this.groqVisionModel = (options.groqVisionModel ?? 'openai/gpt-oss-120b').trim();
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
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const request = async (maxCompletionTokens: number): Promise<OpenAiChatCompletionPayload> => {
            await this.rateLimiter.acquire();
            const response = await fetch(`${apiUrl}/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify(
                    buildOpenAiCompatibleBody(model, messages, {
                        providerLabel,
                        temperature: 0.9,
                        maxCompletionTokens,
                    })
                ),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(
                    `${providerLabel} API error (${response.status}): ${errorBody.slice(0, 300)}`
                );
            }

            return (await response.json()) as OpenAiChatCompletionPayload;
        };

        const tokenBudget = providerLabel === 'groq' && isGroqReasoningModel(model) ? 1024 : 80;
        let payload = await request(tokenBudget);
        let text = extractChatCompletionText(payload);

        if (!text && providerLabel === 'groq') {
            logEmptyGroqCompletion(model, payload);
            payload = await request(isGroqReasoningModel(model) ? 2048 : 200);
            text = extractChatCompletionText(payload);
        }

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
        mentionHandle?: string,
        overrides?: GenerateCommentOverrides
    ): Promise<string> {
        if (this.mockComments) {
            const comment = this.generateMockComment(postText, targetUsername);
            console.log(`[AI_MOCK] Using mock comment for @${targetUsername}: "${comment}"`);
            return comment;
        }

        let imageData: MediaPayload | null = overrides?.imageData ?? null;
        let videoData: MediaPayload | null = null;
        let hasMedia = Boolean(imageData);

        if (videoUrl && this.provider === 'gemini') {
            console.log(
                `[AI_INFO] Sending video to ${this.provider} for analysis: ${videoUrl.substring(0, 80)}...`
            );
            videoData = await this.fetchVideoAsBase64(videoUrl);
            hasMedia = Boolean(videoData);
        } else if (!imageData && imageUrl) {
            console.log(`[AI_INFO] Sending image to ${this.provider} for analysis: ${imageUrl}`);
            imageData = await fetchImageAsBase64ForComment(imageUrl);
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
                    // gpt-oss text models do not reliably handle image payloads; caption is enough.
                    return await this.generateWithOpenAiCompatible(
                        'groq',
                        'https://api.groq.com/openai/v1',
                        this.groqApiKey,
                        this.groqModel,
                        this.buildOpenAiMessages(promptText, null),
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
            if (overrides?.preserveErrorMessage && error instanceof Error) {
                throw error;
            }
            throw new Error(`Failed to generate comment for @${targetUsername} using ${this.provider}.`);
        }
    }

    private buildYouTubePrompt(
        videoTitle: string,
        channelName: string,
        promptHint?: string,
        description?: string,
        channelSkillsContext?: string
    ): string {
        const sections: string[] = [
            `Write one YouTube comment on a video by ${channelName}.`,
            '',
            '## Video title',
            videoTitle.trim() || '(no title)',
        ];

        const desc = description?.trim();
        if (desc) {
            sections.push('', '## Video description (excerpt)', desc.slice(0, 800));
        }

        sections.push(
            '',
            '## Context rule',
            'Ground the comment in the video title and description. Do not write a generic comment detached from this video.'
        );

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
            'Return only the comment text. No quotes, labels, numbering, or explanation.',
            'Be conversational and relevant to the video topic.',
            'Do NOT use Instagram-style @mentions unless explicitly requested in the style guide.',
            'NEVER say you lack context or ask for more information.'
        );

        return sections.join('\n');
    }

    public async generateYouTubeComment(
        videoTitle: string,
        channelName: string,
        promptHint?: string,
        description?: string,
        channelSkillsContext?: string,
        overrides?: GenerateCommentOverrides
    ): Promise<string> {
        if (this.mockComments) {
            const comment = this.generateMockComment(videoTitle, channelName);
            console.log(`[AI_MOCK] Using mock YouTube comment for ${channelName}: "${comment}"`);
            return comment;
        }

        const promptText = this.buildYouTubePrompt(
            videoTitle,
            channelName,
            promptHint,
            description,
            channelSkillsContext
        );

        try {
            switch (this.provider) {
                case 'gemini':
                    return await this.generateWithGemini(promptText, null, null, channelName);
                case 'groq':
                    return await this.generateWithOpenAiCompatible(
                        'groq',
                        'https://api.groq.com/openai/v1',
                        this.groqApiKey,
                        this.groqModel,
                        this.buildOpenAiMessages(promptText, null),
                        channelName
                    );
                case 'local':
                    return await this.generateWithOpenAiCompatible(
                        'local',
                        this.localLlmBaseUrl,
                        undefined,
                        this.localLlmModel,
                        this.buildOpenAiMessages(promptText, null),
                        channelName
                    );
                default:
                    throw new Error(`Unsupported AI provider: ${this.provider}`);
            }
        } catch (error) {
            console.error(`[AI_ERROR] ${this.provider} YouTube request failed:`, error);
            if (overrides?.preserveErrorMessage && error instanceof Error) {
                throw error;
            }
            throw new Error(`Failed to generate YouTube comment for ${channelName} using ${this.provider}.`);
        }
    }

    private buildRelevancePrompt(
        postText: string,
        skillsContext: string,
        authorUsername?: string,
        hasMedia = false,
        compact = false
    ): string {
        const caption = (postText.trim() || '(no caption)').slice(0, compact ? 400 : 800);
        const skillsExcerpt = skillsContext.trim().slice(0, compact ? 500 : 1000);

        if (compact) {
            return [
                'Score how well this Instagram post fits the channel niche for a contextual promotional comment.',
                '',
                `Caption: ${caption}`,
                authorUsername ? `Author: @${authorUsername}` : '',
                `Channel niche: ${skillsExcerpt}`,
                '',
                'Output ONLY a JSON object with keys relevant (boolean), score (number 0-1), reason (string).',
                'Example: {"relevant":true,"score":0.72,"reason":"Exam prep and study routine content"}',
            ]
                .filter(Boolean)
                .join('\n');
        }

        const sections = [
            'Score how well this Instagram post/reel fits the channel niche for leaving a promotional comment.',
            '',
            'Caption:',
            caption,
        ];

        if (authorUsername) {
            sections.push('', `Author: @${authorUsername}`);
        }

        if (hasMedia) {
            sections.push('', 'Note: media is attached — consider visual topic as well as caption.');
        }

        sections.push(
            '',
            'Channel niche (excerpt):',
            skillsExcerpt,
            '',
            'Rules:',
            '- score 0.0–1.0 = fit for a contextual promotional comment',
            '- score >= 0.5 = clear niche match (study, exams, productivity, student life)',
            '- score 0.35–0.49 = adjacent (motivation, discipline, young adult routines)',
            '- score < 0.2 = off-niche',
            '- relevant=true when score >= 0.35',
            '',
            'Output ONLY JSON, no other text:',
            '{"relevant":true,"score":0.82,"reason":"short reason"}'
        );

        return sections.join('\n');
    }

    private async callLlmRawText(
        promptText: string,
        imageData: MediaPayload | null,
        videoData: MediaPayload | null,
        options?: { jsonMode?: boolean }
    ): Promise<string> {
        switch (this.provider) {
            case 'gemini': {
                const contents: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
                if (videoData) {
                    contents.push({
                        inlineData: { mimeType: videoData.mimeType, data: videoData.data },
                    });
                } else if (imageData) {
                    contents.push({
                        inlineData: { mimeType: imageData.mimeType, data: imageData.data },
                    });
                }
                contents.push({ text: promptText });
                await this.rateLimiter.acquire();
                const genAI = new GoogleGenAI({ apiKey: this.googleAiApiKey });
                const result = await genAI.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents,
                    config: { ...this.generationConfig, temperature: 0.2, maxOutputTokens: 120 },
                });
                return (result.text ?? '').trim();
            }
            case 'groq':
                return this.callOpenAiCompatibleRaw(
                    'groq',
                    'https://api.groq.com/openai/v1',
                    this.groqApiKey,
                    imageData && !options?.jsonMode ? this.groqVisionModel : this.groqModel,
                    this.buildOpenAiMessages(promptText, options?.jsonMode ? null : imageData),
                    options
                );
            case 'local':
                return this.callOpenAiCompatibleRaw(
                    'local',
                    this.localLlmBaseUrl,
                    undefined,
                    this.localLlmModel,
                    this.buildOpenAiMessages(promptText, options?.jsonMode ? null : imageData),
                    options
                );
            default:
                throw new Error(`Unsupported AI provider: ${this.provider}`);
        }
    }

    private async callOpenAiCompatibleRaw(
        providerLabel: 'groq' | 'local',
        apiUrl: string,
        apiKey: string | undefined,
        model: string,
        messages: OpenAiChatMessage[],
        options?: { jsonMode?: boolean }
    ): Promise<string> {
        const attempt = async (
            useJsonMode: boolean,
            maxCompletionTokens: number
        ): Promise<Response> => {
            await this.rateLimiter.acquire();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

            const requestMessages: OpenAiChatMessage[] = useJsonMode
                ? [
                      {
                          role: 'system',
                          content:
                              'Reply with a single JSON object only. No markdown or extra text.',
                      },
                      ...messages,
                  ]
                : messages;

            return fetch(`${apiUrl}/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify(
                    buildOpenAiCompatibleBody(model, requestMessages, {
                        providerLabel,
                        temperature: 0.2,
                        maxCompletionTokens,
                        jsonMode: useJsonMode,
                    })
                ),
            });
        };

        const baseTokens =
            providerLabel === 'groq' && isGroqReasoningModel(model) ? 512 : 220;

        let response = await attempt(Boolean(options?.jsonMode), baseTokens);
        if (!response.ok && options?.jsonMode) {
            const errorBody = await response.text();
            if (errorBody.includes('json_validate_failed')) {
                console.warn(
                    `[AI_WARN] ${providerLabel} JSON mode failed for ${model}; retrying without response_format`
                );
                response = await attempt(false, baseTokens);
            } else {
                throw new Error(
                    `${providerLabel} API error (${response.status}): ${errorBody.slice(0, 300)}`
                );
            }
        }

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`${providerLabel} API error (${response.status}): ${errorBody.slice(0, 300)}`);
        }

        let payload = (await response.json()) as OpenAiChatCompletionPayload;
        let text = extractChatCompletionText(payload);
        if (!text) {
            if (providerLabel === 'groq') {
                logEmptyGroqCompletion(model, payload);
            }
            console.warn(`[AI_WARN] ${providerLabel} returned empty content for ${model}; retrying once`);
            response = await attempt(false, providerLabel === 'groq' && isGroqReasoningModel(model) ? 1024 : baseTokens);
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(
                    `${providerLabel} API error (${response.status}): ${errorBody.slice(0, 300)}`
                );
            }
            payload = (await response.json()) as OpenAiChatCompletionPayload;
            text = extractChatCompletionText(payload);
        }
        return text;
    }

    public async assessSkillsRelevance(
        postText: string,
        skillsContext: string,
        options?: AssessSkillsRelevanceOptions
    ): Promise<SkillsRelevanceAssessment> {
        if (this.mockComments) {
            return {
                relevant: true,
                score: 0.85,
                reason: 'Mock mode — treating item as relevant',
            };
        }

        const skills = skillsContext?.trim();
        if (!skills) {
            return { relevant: false, score: 0, reason: 'No skills/style guide configured for this account' };
        }

        let imageData: MediaPayload | null = options?.imageData ?? null;
        let videoData: MediaPayload | null = null;
        let hasMedia = Boolean(imageData);

        if (options?.videoUrl && this.provider === 'gemini') {
            videoData = await this.fetchVideoAsBase64(options.videoUrl);
            hasMedia = Boolean(videoData);
        } else if (!imageData && options?.imageUrl && this.provider !== 'groq') {
            imageData = await fetchImageAsBase64ForComment(options.imageUrl);
            hasMedia = Boolean(imageData);
        }

        // Groq vision model often ignores JSON instructions on reel posters; caption is enough.
        if (this.provider === 'groq') {
            imageData = null;
            videoData = null;
            hasMedia = false;
        }

        const promptText = this.buildRelevancePrompt(
            postText,
            skills,
            options?.authorUsername,
            hasMedia
        );

        try {
            // Groq gpt-oss models often reject strict json_object mode; prompt + parser is more reliable.
            const useJsonMode = this.provider !== 'groq';
            let raw = await this.callLlmRawText(promptText, imageData, videoData, {
                jsonMode: useJsonMode,
            });
            let assessment = parseSkillsRelevanceResponse(raw);

            if (
                assessment.reason === 'Could not parse AI relevance response' ||
                assessment.reason === 'Invalid JSON from relevance assessment'
            ) {
                console.warn(`[AI_WARN] Relevance parse failed; raw: ${raw.slice(0, 240)}`);
                const compactPrompt = this.buildRelevancePrompt(
                    postText,
                    skills,
                    options?.authorUsername,
                    hasMedia,
                    true
                );
                raw = await this.callLlmRawText(compactPrompt, null, null, { jsonMode: false });
                assessment = parseSkillsRelevanceResponse(raw);
                if (
                    assessment.reason === 'Could not parse AI relevance response' ||
                    assessment.reason === 'Invalid JSON from relevance assessment'
                ) {
                    console.warn(`[AI_WARN] Relevance compact retry failed; raw: ${raw.slice(0, 240)}`);
                }
            }

            if (
                assessment.reason === 'Could not parse AI relevance response' ||
                assessment.reason === 'Invalid JSON from relevance assessment'
            ) {
                const heuristic = inferRelevanceFromCaption(postText, options?.authorUsername);
                if (heuristic) {
                    console.warn(
                        `[AI_WARN] Using caption keyword relevance fallback: ${heuristic.score.toFixed(2)}`
                    );
                    return heuristic;
                }
            }

            return assessment;
        } catch (error) {
            console.error(`[AI_ERROR] Relevance assessment failed:`, error);
            return {
                relevant: false,
                score: 0,
                reason: error instanceof Error ? error.message : 'Relevance assessment failed',
            };
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

const STUDY_RELEVANCE_TERMS = [
    'study',
    'studying',
    'exam',
    'focus',
    'streak',
    'pomodoro',
    'productivity',
    'student',
    'padhai',
    'neet',
    'jee',
    'revision',
    'notes',
    'planner',
    'distraction',
    'procrastinat',
    'routine',
    'discipline',
    'academic',
    'homework',
    'assignment',
];

function inferRelevanceFromCaption(
    postText: string,
    authorUsername?: string
): SkillsRelevanceAssessment | null {
    const haystack = `${postText} ${authorUsername ?? ''}`.toLowerCase();
    const matches = STUDY_RELEVANCE_TERMS.filter(term => haystack.includes(term));
    if (matches.length === 0) return null;
    const score = Math.min(0.78, 0.38 + matches.length * 0.06);
    return {
        relevant: score >= 0.35,
        score,
        reason: `Caption keyword heuristic (${matches.slice(0, 4).join(', ')})`,
    };
}

export function parseSkillsRelevanceResponse(raw: string): SkillsRelevanceAssessment {
    let trimmed = raw.trim();
    if (!trimmed) {
        return { relevant: false, score: 0, reason: 'Could not parse AI relevance response' };
    }

    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
        trimmed = fenceMatch[1].trim();
    }
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]) as {
                relevant?: boolean;
                score?: number;
                reason?: string;
            };
            const score =
                typeof parsed.score === 'number' ? Math.min(1, Math.max(0, parsed.score)) : 0;
            const relevant = score >= 0.35;
            return {
                relevant,
                score,
                reason: String(parsed.reason ?? '').trim() || 'No reason provided',
            };
        } catch {
            // fall through to loose parsing
        }
    }

    const loose = parseLooseRelevanceFields(trimmed);
    if (loose) return loose;

    return { relevant: false, score: 0, reason: 'Could not parse AI relevance response' };
}

function parseLooseRelevanceFields(raw: string): SkillsRelevanceAssessment | null {
    const scoreMatch =
        raw.match(/"score"\s*:\s*([\d.]+)/i) ?? raw.match(/\bscore\s*[=:]\s*([\d.]+)/i);
    if (!scoreMatch) return null;

    const score = Math.min(1, Math.max(0, parseFloat(scoreMatch[1])));
    if (!Number.isFinite(score)) return null;

    const relevantMatch = raw.match(/"relevant"\s*:\s*(true|false)/i);
    const relevant =
        relevantMatch != null
            ? relevantMatch[1].toLowerCase() === 'true'
            : score >= 0.35;

    const reasonMatch = raw.match(/"reason"\s*:\s*"([^"]+)"/i);
    return {
        relevant: relevant && score >= 0.35,
        score,
        reason: reasonMatch?.[1]?.trim() || 'Parsed from loose response',
    };
}

export function isRelevanceAssessmentFailure(assessment: SkillsRelevanceAssessment): boolean {
    if (assessment.score > 0) return false;
    const reason = assessment.reason.toLowerCase();
    return (
        reason.includes('api error') ||
        reason.includes('could not parse') ||
        reason.includes('invalid json') ||
        reason.includes('assessment failed') ||
        reason.includes('rate limit') ||
        reason.includes('model_not_found') ||
        reason.includes('does not exist') ||
        reason.includes('json_validate_failed')
    );
}

export function isSkillsRelevanceMatch(
    assessment: SkillsRelevanceAssessment,
    minScore: number
): boolean {
    return assessment.score >= minScore;
}
