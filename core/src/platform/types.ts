export type InteractionResult = 'SUCCESS' | 'SKIPPED' | 'FAILED';

export interface PlatformBot {
    login(): Promise<boolean>;
    commentOnPost(postUrl: string): Promise<InteractionResult>;
    close(): Promise<void>;
}
