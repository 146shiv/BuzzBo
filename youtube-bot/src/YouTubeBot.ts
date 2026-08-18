import { Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import type { AccountConfig, BehaviorConfig, SettingsConfig } from '@buzzbo/core/config';
import { Logger } from '@buzzbo/core/logger/logger';
import type { AICommentGeneratorAdapter } from '@buzzbo/core/ai/genai';
import type { CommentHistoryAdapter } from '@buzzbo/core/comments';
import { extractYouTubeVideoId } from '@buzzbo/core/comments';
import { HumanBehavior, PauseState } from './humanBehavior';

export type InteractionResult = 'SUCCESS' | 'SKIPPED' | 'FAILED';

export interface BotRuntimePaths {
    cookiePath?: string;
    logsDir?: string;
    enableCsvLog?: boolean;
}

export class YouTubeBot {
    private context!: BrowserContext;
    private page!: Page;
    private readonly config: AccountConfig;
    private readonly cookiePath: string;
    private readonly actionDelays: { min: number; max: number };
    private readonly behavior: BehaviorConfig;
    private readonly pauseState: PauseState;
    private readonly logger: Logger;
    private readonly aiGenerator: AICommentGeneratorAdapter;
    private readonly commentHistory: CommentHistoryAdapter;
    private readonly channelSkillsContext?: string;
    private humanBehavior!: HumanBehavior;
    private readonly developerMode: boolean;

    private readonly logsDir: string;

    constructor(
        accountConfig: AccountConfig,
        globalSettings: SettingsConfig,
        pauseState: PauseState,
        logger: Logger,
        aiGenerator: AICommentGeneratorAdapter,
        commentHistory: CommentHistoryAdapter,
        channelSkillsContext?: string,
        runtimePaths?: BotRuntimePaths
    ) {
        this.config = accountConfig;
        this.channelSkillsContext = channelSkillsContext?.trim() || undefined;
        this.behavior = globalSettings.behavior;
        this.cookiePath =
            runtimePaths?.cookiePath ??
            path.join(__dirname, '..', 'data', 'cookies', `${this.config.username}.json`);
        this.pauseState = pauseState;
        this.developerMode = globalSettings.developerMode;
        this.logger = logger;
        this.aiGenerator = aiGenerator;
        this.commentHistory = commentHistory;
        this.logsDir = runtimePaths?.logsDir ?? path.join(__dirname, '..', 'data', 'logs');

        if (this.developerMode) {
            this.actionDelays = { min: 1000, max: 2000 };
        } else {
            const actionDelay = accountConfig.actionDelaySeconds ?? globalSettings.defaultActionDelaySeconds;
            this.actionDelays = {
                min: actionDelay.min * 1000,
                max: actionDelay.max * 1000,
            };
        }
    }

    public getRandomActionDelayMs(): number {
        return this.actionDelays.min + Math.random() * (this.actionDelays.max - this.actionDelays.min);
    }

    private async setupPage(context: BrowserContext): Promise<void> {
        this.context = context;
        this.page = await context.newPage();
        this.humanBehavior = new HumanBehavior(this.page, this.developerMode, this.pauseState, this.logger);
    }

    private async saveSessionCookies(): Promise<void> {
        try {
            fs.mkdirSync(path.dirname(this.cookiePath), { recursive: true });
            await this.context.storageState({ path: this.cookiePath });
            this.logger.success('YouTube session cookies saved.');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Failed to save cookies: ${msg}`);
        }
    }

    private async checkIfLoggedIn(): Promise<boolean> {
        const signInSelectors = [
            'ytd-button-renderer a[aria-label="Sign in"]',
            'a[href*="ServiceLogin"]',
            'yt-button-shape a:has-text("Sign in")',
            'tp-yt-paper-button:has-text("Sign in")',
        ];
        for (const selector of signInSelectors) {
            try {
                if (await this.page.locator(selector).first().isVisible({ timeout: 1500 })) {
                    return false;
                }
            } catch {
                /* try next */
            }
        }

        const avatarImg = this.page.locator(
            'button#avatar-btn img, ytd-topbar-menu-button-renderer #avatar-btn img'
        );
        try {
            return await avatarImg.first().isVisible({ timeout: 3000 });
        } catch {
            return false;
        }
    }

    /** True when the watch page shows an authenticated comment box (not sign-in prompt). */
    private async canPostComments(): Promise<boolean> {
        const signInPrompt = this.page.locator(
            'ytd-comment-sign-in-renderer, ytd-comments-header-renderer:has-text("Sign in to comment")'
        );
        try {
            if (await signInPrompt.first().isVisible({ timeout: 2000 })) {
                return false;
            }
        } catch {
            /* no sign-in wall */
        }

        const placeholder = this.page.locator(
            'ytd-comment-simplebox-renderer #placeholder-area, ytd-comment-simplebox-renderer #simplebox-placeholder'
        );
        try {
            return await placeholder.first().isVisible({ timeout: 3000 });
        } catch {
            return false;
        }
    }

    private async dismissConsentDialog(): Promise<void> {
        const selectors = [
            'button:has-text("Accept all")',
            'button:has-text("Reject all")',
            'button:has-text("I agree")',
            'tp-yt-paper-button:has-text("Accept all")',
        ];
        for (const selector of selectors) {
            try {
                const btn = this.page.locator(selector).first();
                if (await btn.isVisible({ timeout: 1500 })) {
                    await btn.click();
                    await this.humanBehavior.randomizedWait({ base: 800, variance: 400 });
                    return;
                }
            } catch {
                /* try next */
            }
        }
    }

    public async init(context: BrowserContext): Promise<boolean> {
        await this.setupPage(context);
        this.logger.action('Navigating to YouTube...');
        await this.page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);
        await this.dismissConsentDialog();

        if (await this.checkIfLoggedIn()) {
            this.logger.success('Already logged in to YouTube.');
            await this.saveSessionCookies();
            return true;
        }

        this.logger.warn('Not logged in to YouTube. Use Connect to sign in manually.');
        return false;
    }

    public async initWithManualLogin(
        context: BrowserContext,
        waitForLoginConfirm: () => Promise<void>
    ): Promise<boolean> {
        await this.setupPage(context);
        this.logger.action('Navigating to YouTube...');
        await this.page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);
        await this.dismissConsentDialog();

        if (await this.checkIfLoggedIn()) {
            this.logger.success('Already logged in via saved session.');
            await this.saveSessionCookies();
            return true;
        }

        this.logger.warn('Not logged in. Please sign in manually in the browser window.');

        const pollUntilLoggedIn = (async () => {
            while (true) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.dismissConsentDialog();
                if (await this.checkIfLoggedIn()) {
                    return;
                }
            }
        })();

        await Promise.race([waitForLoginConfirm(), pollUntilLoggedIn]);
        await this.dismissConsentDialog();

        if (!(await this.checkIfLoggedIn())) {
            this.logger.error('Login was not detected. Session may not work.');
            return false;
        }

        this.logger.success('YouTube login detected.');
        await this.saveSessionCookies();
        return true;
    }

    private async captureFailureScreenshot(label: string): Promise<void> {
        try {
            fs.mkdirSync(this.logsDir, { recursive: true });
            const screenshotPath = path.join(this.logsDir, `youtube-error-${label}-${Date.now()}.png`);
            await this.page.screenshot({ path: screenshotPath, fullPage: true });
            this.logger.info(`Screenshot saved: ${screenshotPath}`);
        } catch {
            /* ignore */
        }
    }

    private async extractVideoMetadata(): Promise<{ title: string; channelName: string; description: string }> {
        const title =
            (await this.page.locator('h1.ytd-watch-metadata yt-formatted-string, h1 yt-formatted-string').first().textContent())?.trim() ||
            (await this.page.locator('meta[name="title"]').getAttribute('content'))?.trim() ||
            '';

        const channelName =
            (await this.page.locator('#owner #channel-name a, ytd-channel-name a').first().textContent())?.trim() ||
            (await this.page.locator('link[itemprop="name"]').getAttribute('content'))?.trim() ||
            'Unknown channel';

        let description = '';
        try {
            const expand = this.page.locator('#expand, tp-yt-paper-button#expand').first();
            if (await expand.isVisible({ timeout: 2000 })) {
                await expand.click();
                await this.humanBehavior.randomizedWait({ base: 500, variance: 300 });
            }
            description =
                (await this.page.locator('#description-inline-expander, yt-formatted-string#description').first().textContent())?.trim() ||
                '';
        } catch {
            /* description optional */
        }

        return { title, channelName, description };
    }

    private async scrollToComments(): Promise<void> {
        for (let i = 0; i < 4; i++) {
            await this.page.mouse.wheel(0, 600);
            await this.humanBehavior.randomizedWait({ base: 400, variance: 200 });
        }
        const comments = this.page.locator('ytd-comments#comments, #comments');
        await comments.first().scrollIntoViewIfNeeded().catch(() => {});
        await this.humanBehavior.randomizedWait({ base: 800, variance: 400 });
    }

    private async submitComment(text: string): Promise<boolean> {
        if (!(await this.canPostComments())) {
            this.logger.error('Not signed in — YouTube shows "Sign in to comment". Use Connect YouTube first.');
            return false;
        }

        const commentBox = this.page.locator('ytd-comment-simplebox-renderer').first();
        const placeholder = commentBox.locator('#placeholder-area, #simplebox-placeholder');

        try {
            await placeholder.waitFor({ state: 'visible', timeout: 8000 });
            await placeholder.click();
        } catch {
            this.logger.error('Could not open the YouTube comment box.');
            return false;
        }

        await this.humanBehavior.randomizedWait({ base: 500, variance: 300 });

        const input = commentBox.locator('#contenteditable-root');
        try {
            await input.waitFor({ state: 'visible', timeout: 10000 });
            await input.click();
            await this.humanBehavior.typeTextInField(input, text);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Could not type comment: ${msg}`);
            return false;
        }

        const submitBtn = commentBox.locator(
            '#submit-button button, #submit-button yt-button-shape button, #submit-button'
        );
        try {
            await submitBtn.first().waitFor({ state: 'visible', timeout: 5000 });
            await submitBtn.first().click();
            await this.humanBehavior.randomizedWait({ base: 1500, variance: 500 });
            return true;
        } catch {
            this.logger.error('Comment submit button not found or not clickable.');
            return false;
        }
    }

    public async runCommentTaskOnUrl(videoUrl: string, aiPromptHint?: string): Promise<InteractionResult> {
        const videoId = extractYouTubeVideoId(videoUrl);
        this.logger.header(`----- Starting YouTube Comment Task for ${videoUrl} -----`);

        if (!videoId) {
            this.logger.error(`Invalid YouTube URL: ${videoUrl}`);
            return 'FAILED';
        }

        if (this.commentHistory.hasCommented(this.config.username, videoId)) {
            this.logger.warn(`Already commented on video ${videoId}. Skipping.`);
            return 'SKIPPED';
        }

        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

        try {
            this.logger.action('Navigating to video...');
            await this.page.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);
            await this.dismissConsentDialog();

            const { title, channelName, description } = await this.extractVideoMetadata();
            if (!title) {
                this.logger.error('Could not read video title.');
                await this.captureFailureScreenshot('no-title');
                return 'FAILED';
            }

            this.logger.info(`Video: "${title}" by ${channelName}`);
            await this.scrollToComments();

            if (!(await this.canPostComments())) {
                this.logger.error(
                    'YouTube session is not signed in (comments show "Sign in to comment"). Use Connect YouTube first.'
                );
                await this.captureFailureScreenshot('not-signed-in');
                return 'FAILED';
            }

            const comment = await this.aiGenerator.generateYouTubeComment(
                title,
                channelName,
                aiPromptHint ?? this.config.aiPromptHint,
                description,
                this.channelSkillsContext ?? this.config.skillsContent
            );

            if (!comment?.trim()) {
                this.logger.error('AI returned empty comment.');
                return 'FAILED';
            }

            this.logger.info(`Generated comment: ${comment.substring(0, 80)}...`);

            const submitted = await this.submitComment(comment.trim());
            if (!submitted) {
                this.logger.error('Could not submit comment — comment box or submit button not found.');
                await this.captureFailureScreenshot('submit-failed');
                return 'FAILED';
            }

            this.commentHistory.recordComment(this.config.username, videoId);
            this.logger.success('Comment posted successfully.');
            return 'SUCCESS';
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Comment task failed: ${msg}`);
            await this.captureFailureScreenshot('exception');
            return 'FAILED';
        }
    }
}
