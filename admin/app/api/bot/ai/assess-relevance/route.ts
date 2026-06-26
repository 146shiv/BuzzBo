import { NextResponse } from 'next/server';
import { AICommentGenerator } from '@buzzbo/core/ai/genai';
import type { SettingsConfig } from '@shared/config-types';
import { DEFAULT_SETTINGS } from '@shared/config-types';
import { requireAuth, badRequest } from '@/lib/auth/guards';
import { getRepositories } from '@/lib/db';
import { assessRelevanceSchema } from '@/lib/validators/schemas';

export const maxDuration = 60;

export async function POST(request: Request) {
    const session = await requireAuth(request, ['user', 'admin']);
    if (session instanceof NextResponse) return session;

    try {
        const body = await request.json();
        const parsed = assessRelevanceSchema.safeParse(body);
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

        const { postText, skillsContext, authorUsername, imageUrl, videoUrl, imageData } =
            parsed.data;

        const assessment = await aiGenerator.assessSkillsRelevance(postText, skillsContext, {
            authorUsername,
            imageUrl,
            videoUrl,
            imageData: imageData ?? null,
        });

        await repos.users.touchLastUsed(user.id);

        return NextResponse.json(assessment);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to assess relevance';
        console.error('AI assess relevance error:', e);
        return NextResponse.json({ error: msg }, { status: 502 });
    }
}
