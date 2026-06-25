import { z } from 'zod';

export const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

export const createUserSchema = z.object({
    username: z.string().min(2).max(64),
    password: z.string().min(6),
    display_name: z.string().optional(),
    role: z.enum(['admin', 'user']).optional(),
    config_id: z.string().uuid().nullable().optional(),
});

export const updateUserSchema = z.object({
    username: z.string().min(2).max(64).optional(),
    password: z.string().min(6).optional(),
    display_name: z.string().nullable().optional(),
    role: z.enum(['admin', 'user']).optional(),
    is_disabled: z.boolean().optional(),
    config_id: z.string().uuid().nullable().optional(),
});

export const configurationSchema = z.object({
    name: z.string().min(1),
    settings: z.record(z.string(), z.unknown()),
});

export const platformAccountSchema = z.object({
    platform: z.number().int().min(1).max(2),
    username: z.string().min(1),
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    skills_content: z.string().optional(),
    post_urls: z.array(z.string()).optional(),
});

export const recordCommentSchema = z.object({
    accountId: z.string().uuid(),
    platform: z.number().int().min(1).max(2),
    postId: z.string().min(1),
    postUrl: z.string().optional(),
    commentText: z.string().optional(),
});

export const generateCommentSchema = z.object({
    postText: z.string(),
    targetUsername: z.string().min(1),
    promptHint: z.string().optional(),
    imageUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    channelSkillsContext: z.string().optional(),
    mentionHandle: z.string().optional(),
    imageData: z
        .object({
            data: z.string().min(1),
            mimeType: z.string().min(1),
        })
        .optional(),
});
