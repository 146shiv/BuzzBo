"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AICommentGenerator = void 0;
exports.fetchImageAsBase64ForComment = fetchImageAsBase64ForComment;
exports.isSubstantiveCaption = isSubstantiveCaption;
exports.isMetaRefusalComment = isMetaRefusalComment;
exports.isLowQualityAiComment = isLowQualityAiComment;
exports.isUnusableAiComment = isUnusableAiComment;
exports.getGenericStudyFallbackComment = getGenericStudyFallbackComment;
exports.hasActionablePostContext = hasActionablePostContext;
exports.parseSkillsRelevanceResponse = parseSkillsRelevanceResponse;
exports.isSkillsRelevanceMatch = isSkillsRelevanceMatch;
const genai_1 = require("@google/genai");
/** Sliding-window limiter: max N AI API calls per 60 seconds. */
class AiRateLimiter {
    constructor(maxRequestsPerMinute) {
        this.windowMs = 60000;
        this.requestTimestamps = [];
        this.mutex = Promise.resolve();
        this.maxRequests = maxRequestsPerMinute;
    }
    async acquire() {
        const previous = this.mutex;
        let release;
        this.mutex = new Promise(resolve => {
            release = resolve;
        });
        await previous;
        try {
            await this.waitForSlot();
        }
        finally {
            release();
        }
    }
    async waitForSlot() {
        while (true) {
            const now = Date.now();
            this.requestTimestamps = this.requestTimestamps.filter(t => now - t < this.windowMs);
            if (this.requestTimestamps.length < this.maxRequests) {
                this.requestTimestamps.push(now);
                return;
            }
            const oldest = this.requestTimestamps[0];
            const waitMs = this.windowMs - (now - oldest) + 100;
            console.log(`[AI_RATE_LIMIT] AI limit (${this.maxRequests}/min) reached — waiting ${Math.ceil(waitMs / 1000)}s`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }
}
async function fetchImageAsBase64ForComment(imageUrl) {
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
    }
    catch (error) {
        console.error('Error fetching image:', error);
        return null;
    }
}
class AICommentGenerator {
    constructor(options) {
        this.mockCommentIndex = 0;
        this.mockCommentPool = [
            'The framing in this post has a nice natural flow to it',
            'There is a thoughtful quality to how this was put together',
            'The visual tone here feels cohesive and well considered',
            'This captures a moment with a clear sense of focus',
            'The details in this post come through in a subtle way',
        ];
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
    validateProviderConfig() {
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
    buildPrompt(postText, targetUsername, promptHint, hasMedia = false, channelSkillsContext, mentionHandle) {
        const caption = postText.trim();
        const sections = [
            `Write one Instagram comment on a post by @${targetUsername}.`,
            '',
            '## Post caption',
            caption || '(no caption — infer topic from attached media)',
        ];
        if (caption) {
            sections.push('', '## Context rule', 'Reuse specific words, topics, or pain points from the caption above. Do not write a generic comment detached from this post.');
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
            sections.push('', '## App mention', `Include @${handle} in the comment when it fits the style guide.`, 'Instagram needs the literal @username — do not write the name without @.');
        }
        if (promptHint?.trim()) {
            sections.push('', '## Extra hint', promptHint.trim());
        }
        sections.push('', '## Output', 'Return only the comment text. No quotes, labels, numbering, or explanation.', 'Be witty or lightly sarcastic — never bland, never a supportive student essay.', 'NEVER say you lack context, need more information, or ask anyone for details.', 'NEVER admit confusion. If unclear, write one sharp study-life one-liner with the app mention.');
        return sections.join('\n');
    }
    generateMockComment(postText, _targetUsername) {
        const caption = postText.trim();
        if (caption.length > 0) {
            const snippet = caption.length > 40 ? `${caption.slice(0, 40)}...` : caption;
            return `The way this post touches on ${snippet.toLowerCase()} feels thoughtfully done`;
        }
        const comment = this.mockCommentPool[this.mockCommentIndex % this.mockCommentPool.length];
        this.mockCommentIndex++;
        return comment;
    }
    async fetchVideoAsBase64(videoUrl) {
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
        }
        catch (error) {
            console.error('Error fetching video:', error);
            return null;
        }
    }
    sanitizeComment(text) {
        const trimmed = text.trim();
        if (!trimmed) {
            throw new Error('AI returned an empty comment.');
        }
        if (isUnusableAiComment(trimmed)) {
            throw new Error('AI returned an unusable comment (refusal or low quality).');
        }
        return trimmed.replace(/"/g, '');
    }
    buildOpenAiMessages(promptText, imageData) {
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
    async generateWithGemini(promptText, imageData, videoData, targetUsername) {
        const contents = [];
        if (videoData) {
            contents.push({
                inlineData: {
                    mimeType: videoData.mimeType,
                    data: videoData.data,
                },
            });
        }
        else if (imageData) {
            contents.push({
                inlineData: {
                    mimeType: imageData.mimeType,
                    data: imageData.data,
                },
            });
        }
        contents.push({ text: promptText });
        await this.rateLimiter.acquire();
        const genAI = new genai_1.GoogleGenAI({ apiKey: this.googleAiApiKey });
        const result = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents,
            config: this.generationConfig,
        });
        return this.sanitizeComment(result.text ?? '');
    }
    async generateWithOpenAiCompatible(providerLabel, apiUrl, apiKey, model, messages, targetUsername) {
        await this.rateLimiter.acquire();
        const headers = {
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
            throw new Error(`${providerLabel} API error (${response.status}): ${errorBody.slice(0, 300)}`);
        }
        const payload = (await response.json());
        const text = payload.choices?.[0]?.message?.content;
        if (!text) {
            throw new Error(`${providerLabel} returned an empty comment.`);
        }
        return this.sanitizeComment(text);
    }
    supportsVideoAnalysis() {
        return this.provider === 'gemini';
    }
    async generateInstagramComment(postText, targetUsername, promptHint, imageUrl, videoUrl, channelSkillsContext, mentionHandle, overrides) {
        if (this.mockComments) {
            const comment = this.generateMockComment(postText, targetUsername);
            console.log(`[AI_MOCK] Using mock comment for @${targetUsername}: "${comment}"`);
            return comment;
        }
        let imageData = overrides?.imageData ?? null;
        let videoData = null;
        let hasMedia = Boolean(imageData);
        if (videoUrl && this.provider === 'gemini') {
            console.log(`[AI_INFO] Sending video to ${this.provider} for analysis: ${videoUrl.substring(0, 80)}...`);
            videoData = await this.fetchVideoAsBase64(videoUrl);
            hasMedia = Boolean(videoData);
        }
        else if (!imageData && imageUrl) {
            console.log(`[AI_INFO] Sending image to ${this.provider} for analysis: ${imageUrl}`);
            imageData = await fetchImageAsBase64ForComment(imageUrl);
            hasMedia = Boolean(imageData);
        }
        else if (videoUrl && this.provider !== 'gemini') {
            console.log(`[AI_INFO] Video URL found but ${this.provider} cannot analyze video bytes; caption-only prompt.`);
        }
        const promptText = this.buildPrompt(postText, targetUsername, promptHint, hasMedia, channelSkillsContext, mentionHandle);
        try {
            switch (this.provider) {
                case 'gemini':
                    return await this.generateWithGemini(promptText, imageData, videoData, targetUsername);
                case 'groq':
                    return await this.generateWithOpenAiCompatible('groq', 'https://api.groq.com/openai/v1', this.groqApiKey, imageData ? this.groqVisionModel : this.groqModel, this.buildOpenAiMessages(promptText, imageData), targetUsername);
                case 'local':
                    return await this.generateWithOpenAiCompatible('local', this.localLlmBaseUrl, undefined, this.localLlmModel, this.buildOpenAiMessages(promptText, imageData), targetUsername);
                default:
                    throw new Error(`Unsupported AI provider: ${this.provider}`);
            }
        }
        catch (error) {
            console.error(`[AI_ERROR] ${this.provider} request failed:`, error);
            if (overrides?.preserveErrorMessage && error instanceof Error) {
                throw error;
            }
            throw new Error(`Failed to generate comment for @${targetUsername} using ${this.provider}.`);
        }
    }
    buildRelevancePrompt(postText, skillsContext, authorUsername, hasMedia = false) {
        const sections = [
            'Decide if an Instagram post/reel is a good match for commenting using the channel skills below.',
            '',
            '## Post caption',
            postText.trim() || '(no caption — infer topic from attached media if present)',
        ];
        if (authorUsername) {
            sections.push('', '## Author', `@${authorUsername}`);
        }
        if (hasMedia) {
            sections.push('', 'Media is attached — consider visual topic as well as caption.');
        }
        sections.push('', '## Channel skills (topics, voice, niche)', skillsContext.trim() || '(no skills defined — treat as low relevance)', '', '## Rules', '- relevant=true only when the post topic clearly overlaps the skills niche (topics, pain points, audience).', '- Generic lifestyle, unrelated humor, or off-niche content → relevant=false.', '- score is 0.0–1.0 confidence that a contextual promotional comment fits.', '', '## Output', 'Return ONLY valid JSON with keys: relevant (boolean), score (number 0-1), reason (short string).', 'Example: {"relevant":true,"score":0.82,"reason":"Exam stress and procrastination match study-app skills"}');
        return sections.join('\n');
    }
    async callLlmRawText(promptText, imageData, videoData) {
        switch (this.provider) {
            case 'gemini': {
                const contents = [];
                if (videoData) {
                    contents.push({
                        inlineData: { mimeType: videoData.mimeType, data: videoData.data },
                    });
                }
                else if (imageData) {
                    contents.push({
                        inlineData: { mimeType: imageData.mimeType, data: imageData.data },
                    });
                }
                contents.push({ text: promptText });
                await this.rateLimiter.acquire();
                const genAI = new genai_1.GoogleGenAI({ apiKey: this.googleAiApiKey });
                const result = await genAI.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents,
                    config: { ...this.generationConfig, temperature: 0.2, maxOutputTokens: 120 },
                });
                return (result.text ?? '').trim();
            }
            case 'groq':
                return this.callOpenAiCompatibleRaw('groq', 'https://api.groq.com/openai/v1', this.groqApiKey, imageData ? this.groqVisionModel : this.groqModel, this.buildOpenAiMessages(promptText, imageData));
            case 'local':
                return this.callOpenAiCompatibleRaw('local', this.localLlmBaseUrl, undefined, this.localLlmModel, this.buildOpenAiMessages(promptText, imageData));
            default:
                throw new Error(`Unsupported AI provider: ${this.provider}`);
        }
    }
    async callOpenAiCompatibleRaw(providerLabel, apiUrl, apiKey, model, messages) {
        await this.rateLimiter.acquire();
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey)
            headers.Authorization = `Bearer ${apiKey}`;
        const response = await fetch(`${apiUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.2,
                max_tokens: 120,
            }),
        });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`${providerLabel} API error (${response.status}): ${errorBody.slice(0, 300)}`);
        }
        const payload = (await response.json());
        return (payload.choices?.[0]?.message?.content ?? '').trim();
    }
    async assessSkillsRelevance(postText, skillsContext, options) {
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
        let imageData = options?.imageData ?? null;
        let videoData = null;
        let hasMedia = Boolean(imageData);
        if (options?.videoUrl && this.provider === 'gemini') {
            videoData = await this.fetchVideoAsBase64(options.videoUrl);
            hasMedia = Boolean(videoData);
        }
        else if (!imageData && options?.imageUrl) {
            imageData = await fetchImageAsBase64ForComment(options.imageUrl);
            hasMedia = Boolean(imageData);
        }
        const promptText = this.buildRelevancePrompt(postText, skills, options?.authorUsername, hasMedia);
        try {
            const raw = await this.callLlmRawText(promptText, imageData, videoData);
            return parseSkillsRelevanceResponse(raw);
        }
        catch (error) {
            console.error(`[AI_ERROR] Relevance assessment failed:`, error);
            return {
                relevant: false,
                score: 0,
                reason: error instanceof Error ? error.message : 'Relevance assessment failed',
            };
        }
    }
}
exports.AICommentGenerator = AICommentGenerator;
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
function isSubstantiveCaption(caption) {
    const trimmed = caption.trim();
    if (trimmed.length < MIN_SUBSTANTIVE_CAPTION_LENGTH) {
        return false;
    }
    if (/^@?[a-zA-Z0-9._]+$/.test(trimmed) && trimmed.replace(/^@/, '').length < 18) {
        return false;
    }
    return !CAPTION_NOISE_PATTERNS.some(pattern => pattern.test(trimmed));
}
function isMetaRefusalComment(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return true;
    return META_REFUSAL_PATTERNS.some(pattern => pattern.test(trimmed));
}
function isLowQualityAiComment(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return true;
    return LOW_QUALITY_COMMENT_PATTERNS.some(pattern => pattern.test(trimmed));
}
function isUnusableAiComment(text) {
    return isMetaRefusalComment(text) || isLowQualityAiComment(text);
}
function getGenericStudyFallbackComment(mentionHandle) {
    const handle = mentionHandle?.trim().replace(/^@/, '') || 'studyboapp';
    const template = GENERIC_FALLBACK_TEMPLATES[Math.floor(Math.random() * GENERIC_FALLBACK_TEMPLATES.length)];
    return template.replace('{handle}', handle);
}
function hasActionablePostContext(postText, imageUrl, videoUrl, videoAnalysisAvailable = false, isVideoPost = false) {
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
function parseSkillsRelevanceResponse(raw) {
    const trimmed = raw.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return { relevant: false, score: 0, reason: 'Could not parse AI relevance response' };
    }
    try {
        const parsed = JSON.parse(jsonMatch[0]);
        const score = typeof parsed.score === 'number' ? Math.min(1, Math.max(0, parsed.score)) : 0;
        const relevant = Boolean(parsed.relevant) && score >= 0.35;
        return {
            relevant,
            score,
            reason: String(parsed.reason ?? '').trim() || 'No reason provided',
        };
    }
    catch {
        return { relevant: false, score: 0, reason: 'Invalid JSON from relevance assessment' };
    }
}
function isSkillsRelevanceMatch(assessment, minScore) {
    return assessment.relevant && assessment.score >= minScore;
}
