import { NextResponse } from 'next/server';
import { AICommentGenerator } from '@buzzbo/core/ai/genai';
import type { SettingsConfig } from '@shared/config-types';
import { DEFAULT_SETTINGS } from '@shared/config-types';
import { requireAuth, badRequest } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { generateCommentSchema } from '@/lib/validators/schemas';

export const maxDuration = 60;

export async function POST(request: Request) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    try {
        const body = await request.json();
        const parsed = generateCommentSchema.safeParse(body);
        if (!parsed.success) {
            return badRequest(parsed.error.issues[0]?.message || 'Invalid input');
        }

        const repos = getRepositories();
        const user = await repos.users.findById(session.sub);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        let settings: SettingsConfig = DEFAULT_SETTINGS;
        if (user.config_id) {
            const config = await repos.configurations.findById(user.config_id);
            if (config) settings = config.settings;
        }

        const aiGenerator = new AICommentGenerator({
            provider: settings.aiProvider ?? 'gemini',
            googleAiApiKey: settings.googleAiApiKey,
            groqApiKey: settings.groqApiKey,
            groqModel: settings.groqModel,
            groqVisionModel: settings.groqVisionModel,
            localLlmBaseUrl: settings.localLlmBaseUrl,
            localLlmModel: settings.localLlmModel,
            mockComments: settings.mockAiComments ?? false,
            maxRequestsPerMinute: settings.aiMaxRequestsPerMinute,
        });

        const {
            postText,
            targetUsername,
            promptHint,
            imageUrl,
            videoUrl,
            channelSkillsContext,
            mentionHandle,
            imageData,
        } = parsed.data;

        const comment = await aiGenerator.generateInstagramComment(
            postText,
            targetUsername,
            promptHint,
            imageUrl,
            videoUrl,
            channelSkillsContext,
            mentionHandle,
            { imageData: imageData ?? null, preserveErrorMessage: true }
        );

        await repos.users.touchLastUsed(user.id);

        return NextResponse.json({ comment });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to generate comment';
        console.error('AI generate comment error:', e);
        return NextResponse.json({ error: msg }, { status: 502 });
    }
}
