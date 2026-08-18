import { BrowserContext } from 'playwright';
import type { AccountConfig, SettingsConfig } from '@buzzbo/core/config';
import { Logger } from '@buzzbo/core/logger/logger';
import type { AICommentGeneratorAdapter } from '@buzzbo/core/ai/genai';
import type { CommentHistoryAdapter } from '@buzzbo/core/comments';
import { PauseState } from './humanBehavior';
export type InteractionResult = 'SUCCESS' | 'SKIPPED' | 'FAILED';
export interface BotRuntimePaths {
    cookiePath?: string;
    logsDir?: string;
    enableCsvLog?: boolean;
}
export declare class YouTubeBot {
    private context;
    private page;
    private readonly config;
    private readonly cookiePath;
    private readonly actionDelays;
    private readonly behavior;
    private readonly pauseState;
    private readonly logger;
    private readonly aiGenerator;
    private readonly commentHistory;
    private readonly channelSkillsContext?;
    private humanBehavior;
    private readonly developerMode;
    private readonly logsDir;
    constructor(accountConfig: AccountConfig, globalSettings: SettingsConfig, pauseState: PauseState, logger: Logger, aiGenerator: AICommentGeneratorAdapter, commentHistory: CommentHistoryAdapter, channelSkillsContext?: string, runtimePaths?: BotRuntimePaths);
    getRandomActionDelayMs(): number;
    private setupPage;
    private saveSessionCookies;
    private checkIfLoggedIn;
    /** True when the watch page shows an authenticated comment box (not sign-in prompt). */
    private canPostComments;
    private dismissConsentDialog;
    init(context: BrowserContext): Promise<boolean>;
    initWithManualLogin(context: BrowserContext, waitForLoginConfirm: () => Promise<void>): Promise<boolean>;
    private captureFailureScreenshot;
    private extractVideoMetadata;
    private scrollToComments;
    private submitComment;
    runCommentTaskOnUrl(videoUrl: string, aiPromptHint?: string): Promise<InteractionResult>;
}
//# sourceMappingURL=YouTubeBot.d.ts.map