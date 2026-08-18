import type { CommentJobRepository } from '@/lib/db/repository';

/**
 * Abstraction for comment job dispatch. Phase 2 uses DbCommentJobRepository (Supabase polling).
 * Phase 3 can add BullMqCommentJobQueue implementing the same interface.
 */
export interface CommentJobQueueAdapter {
    enqueue(jobs: Parameters<CommentJobRepository['createMany']>[0]): Promise<void>;
    claimDue(campaignId: string, limit: number): ReturnType<CommentJobRepository['claimDueJobs']>;
    complete(
        jobId: string,
        patch: Parameters<CommentJobRepository['updateJob']>[1]
    ): ReturnType<CommentJobRepository['updateJob']>;
    cancelPending(campaignId: string): ReturnType<CommentJobRepository['cancelPending']>;
}

export function createDbCommentJobQueue(repos: {
    commentJobs: CommentJobRepository;
}): CommentJobQueueAdapter {
    return {
        async enqueue(jobs) {
            await repos.commentJobs.createMany(jobs);
        },
        claimDue(campaignId, limit) {
            return repos.commentJobs.claimDueJobs(campaignId, limit);
        },
        complete(jobId, patch) {
            return repos.commentJobs.updateJob(jobId, patch);
        },
        cancelPending(campaignId) {
            return repos.commentJobs.cancelPending(campaignId);
        },
    };
}

/**
 * Placeholder for Phase 3 BullMQ + Redis migration.
 * Swap createDbCommentJobQueue() with createBullMqCommentJobQueue() when Redis is available.
 */
export function createBullMqCommentJobQueue(): CommentJobQueueAdapter {
    throw new Error(
        'BullMQ queue is not configured. Use DB-backed queue (createDbCommentJobQueue) until Redis is set up.'
    );
}
