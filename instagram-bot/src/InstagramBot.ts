import { Page, BrowserContext, Locator } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import {
    AccountConfig,
    BehaviorConfig,
    MentionPolicy,
    SettingsConfig,
    UiHashtagSearchConfig,
} from '@buzzbo/core/config';
import { HumanBehavior, PauseState } from './humanBehavior';
import { Logger } from '@buzzbo/core/logger/logger';
import {
    AICommentGeneratorAdapter,
    getGenericStudyFallbackComment,
    hasActionablePostContext,
    isUnusableAiComment,
} from '@buzzbo/core/ai/genai';
import type { CommentHistoryAdapter } from '@buzzbo/core/comments';
import { extractPostShortcode } from '@buzzbo/core/comments';
import {
    computeEngagementScore,
    formatEngagementCounts,
    HashtagPostCandidate,
    rankHashtagCandidates,
} from './hashtagRanking';

export type InteractionResult = 'SUCCESS' | 'SKIPPED' | 'FAILED';
export type { HashtagPostCandidate } from './hashtagRanking';

export interface BotRuntimePaths {
    cookiePath?: string;
    logsDir?: string;
    enableCsvLog?: boolean;
}

export class InstagramBot {
    private context!: BrowserContext;
    private page!: Page;
    private readonly config: AccountConfig;
    private readonly cookiePath: string;
    private readonly actionDelays: { min: number; max: number };
    private readonly behavior: BehaviorConfig;
    private readonly pauseState: PauseState;
    private readonly globalLogPath: string;
    private humanBehavior!: HumanBehavior;
    private readonly developerMode: boolean;
    private readonly logger: Logger;
    private readonly aiGenerator: AICommentGeneratorAdapter;
    private readonly commentHistory: CommentHistoryAdapter;
    private readonly channelSkillsContext?: string;
    private readonly browserViewport: { width: number; height: number };
    private capturedVideoUrl: string | undefined = undefined;
    private isCapturingVideo: boolean = false;
    private readonly logsDir: string;
    private readonly enableCsvLog: boolean;

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
        this.browserViewport = globalSettings.browserViewport ?? { width: 1920, height: 1080 };
        this.behavior = globalSettings.behavior;
        this.cookiePath =
            runtimePaths?.cookiePath ??
            path.join(__dirname, '..', 'data', 'cookies', `${this.config.username}.json`);
        this.logsDir = runtimePaths?.logsDir ?? path.join(__dirname, '..', 'data', 'logs');
        this.globalLogPath = path.join(this.logsDir, 'interaction_log.csv');
        this.enableCsvLog = runtimePaths?.enableCsvLog ?? false;
        this.pauseState = pauseState;
        this.developerMode = globalSettings.developerMode;
        this.logger = logger;
        this.aiGenerator = aiGenerator;
        this.commentHistory = commentHistory;

        if (this.developerMode) {
            this.actionDelays = { min: 1000, max: 2000 };
            this.logger.debug('Developer mode is ON. Using short action delays.');
        } else {
            const actionDelay = accountConfig.actionDelaySeconds ?? globalSettings.defaultActionDelaySeconds;
            this.actionDelays = {
                min: actionDelay.min * 1000,
                max: actionDelay.max * 1000,
            };
            this.logger.info(`Action delay loaded: ${actionDelay.min}s - ${actionDelay.max}s`);
        }

        try {
            fs.mkdirSync(this.logsDir, { recursive: true });
        } catch {
            /* ignore */
        }
    }

    private async logInteraction(targetUsername: string, actionType: 'comment', comment: string) {
        const timestamp = new Date().toISOString();
        const sanitizedComment = `"${comment.replace(/"/g, '""')}"`;
        const logEntry = `${timestamp},${this.config.username},${targetUsername},${actionType},${sanitizedComment}\n`;

        if (actionType === 'comment') {
            this.logger.incrementComments();
        }

        if (!this.enableCsvLog) {
            return;
        }

        try {
            fs.mkdirSync(this.logsDir, { recursive: true });
            fs.appendFileSync(this.globalLogPath, logEntry, 'utf-8');
        } catch (error: any) {
            this.logger.error(`Failed to write to global CSV log: ${error.message}`);
        }
    }

    private async ensureCookiesAreSaved() {
        if (!fs.existsSync(this.cookiePath)) {
            this.logger.action('Session is active but cookie file is missing. Saving now...');
            try {
                await this.context.storageState({ path: this.cookiePath });
                this.logger.success(`Cookies saved successfully.`);
            } catch (e: any) {
                this.logger.error(`Failed to save cookies: ${e.message}`);
            }
        }
    }

    public getPage(): Page {
        return this.page;
    }

    public getRandomActionDelayMs(): number {
        return this.actionDelays.min + Math.random() * (this.actionDelays.max - this.actionDelays.min);
    }

    private async saveSessionCookies() {
        this.logger.action('Saving session cookies to disk...');
        try {
            await this.context.storageState({ path: this.cookiePath });
            this.logger.success('Session cookies saved.');
        } catch (e: any) {
            this.logger.error(`Failed to save cookies: ${e.message}`);
        }
    }

    private async setupPage(context: BrowserContext) {
        this.context = context;
        this.page = await this.context.newPage();
        this.humanBehavior = new HumanBehavior(this.page, this.developerMode, this.pauseState, this.logger);

        this.page.on('response', async response => {
            try {
                if (!this.isCapturingVideo) return;

                if (this.capturedVideoUrl) return;

                const url = response.url();
                const contentType = response.headers()['content-type'];

                if (
                    contentType &&
                    contentType.includes('video/mp4') &&
                    url.includes('fbcdn.net') &&
                    (url.includes('instagram') || url.includes('ig'))
                ) {
                    this.capturedVideoUrl = url;
                    this.logger.info(`Captured video URL: ${url.substring(0, 80)}...`);
                }
            } catch (e) {}
        });
    }

    public async init(context: BrowserContext) {
        await this.setupPage(context);

        this.logger.action('Navigating to Instagram...');
        await this.page.goto('https://www.instagram.com/?hl=en');
        await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);

        await this.humanBehavior.moveMouseRandomly();
        this.logger.info('Checking login status...');

        try {
            await this.dismissCommonPopups();
            if (await this.checkIfLoggedIn()) {
                this.logger.success('Already logged in.');
                await this.ensureCookiesAreSaved();
                return true;
            } else {
                this.logger.info('Not logged in. Performing login.');
                await this.login();
                return true;
            }
        } catch (e: any) {
            this.logger.error(`Error during init: ${e.message}. Attempting login...`);
            await this.login();
            return true;
        }
    }

    public async initWithManualLogin(
        context: BrowserContext,
        waitForLoginConfirm: () => Promise<void>
    ): Promise<boolean> {
        await this.setupPage(context);

        this.logger.action('Navigating to Instagram...');
        await this.page.goto('https://www.instagram.com/?hl=en');
        await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);
        await this.humanBehavior.moveMouseRandomly();

        await this.dismissCommonPopups();

        if (await this.checkIfLoggedInGeneric()) {
            this.logger.success('Already logged in via saved session.');
            await this.saveSessionCookies();
            return true;
        }

        this.logger.warn('Not logged in. Please log in manually in the browser window.');
        this.logger.info('Press ENTER in the terminal once you are logged in (auto-detection also runs every 2s).');

        const pollUntilLoggedIn = (async () => {
            while (true) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.dismissCommonPopups();
                if (await this.checkIfLoggedInGeneric()) {
                    return;
                }
            }
        })();

        await Promise.race([waitForLoginConfirm(), pollUntilLoggedIn]);

        await this.dismissCommonPopups();
        if (!(await this.checkIfLoggedInGeneric())) {
            await this.page.screenshot({
                path: path.join(this.logsDir, `manual_login_error_${this.config.username}.png`),
            });
            throw new Error('Login not detected. Please log in and try again.');
        }

        this.logger.success('Manual login detected.');
        await this.saveSessionCookies();
        return true;
    }

    private async checkIfLoggedInGeneric(): Promise<boolean> {
        try {
            const usernameInput = this.page.locator('input[name="username"]');
            if ((await usernameInput.count()) > 0 && (await usernameInput.first().isVisible())) {
                return false;
            }

            const homeIcon = this.page.locator('svg[aria-label="Home"]');
            if ((await homeIcon.count()) > 0) return true;

            const createIcon = this.page.locator('svg[aria-label="New post"], svg[aria-label="Create"]');
            if ((await createIcon.count()) > 0) return true;

            const exploreIcon = this.page.locator('svg[aria-label="Explore"]');
            if ((await exploreIcon.count()) > 0) return true;

            return false;
        } catch (e: any) {
            this.logger.error(`Error checking login status: ${e.message}`);
            return false;
        }
    }

    private async checkIfLoggedIn(): Promise<boolean> {
        try {
            const profileLink = this.page.locator(`a[href="/${this.config.username}/"]`);
            if ((await profileLink.count()) > 0) return true;

            const homeIcon = this.page.locator('svg[aria-label="Home"]');
            if ((await homeIcon.count()) > 0) return true;

            const usernameInput = this.page.locator('input[name="username"]');
            if ((await usernameInput.count()) > 0) return false;

            return false;
        } catch (e: any) {
            this.logger.error(`Error checking login status: ${e.message}`);
            return false;
        }
    }

    private async dismissCommonPopups() {
        try {
            const allowCookiesButton = this.page.getByRole('button', { name: 'Allow all cookies' });
            if ((await allowCookiesButton.count()) > 0) {
                this.logger.action('Dismissing "Allow all cookies" popup...');
                await this.humanBehavior.hesitateAndClick(allowCookiesButton);
                await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            }
        } catch (e) {}

        try {
            const saveInfoButton = this.page.getByRole('button', { name: 'Save Info' });
            if ((await saveInfoButton.count()) > 0) {
                this.logger.action('Dismissing "Save Info" popup...');
                await this.humanBehavior.hesitateAndClick(saveInfoButton);
                await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            }
        } catch (e) {}

        try {
            const notNowButton = this.page.getByRole('button', { name: 'Not Now' });
            if ((await notNowButton.count()) > 0) {
                this.logger.action('Dismissing "Turn on Notifications" popup...');
                await this.humanBehavior.hesitateAndClick(notNowButton.first());
                await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            }
        } catch (e) {}
    }

    private async login() {
        if (!this.config.password?.trim()) {
            throw new Error(
                `No password configured for @${this.config.username}. Set password or use loginMethod: 'manual'.`
            );
        }

        if ((await this.page.locator('input[name="username"]').count()) === 0) {
            this.logger.action('Navigating to login page...');
            await this.page.goto('https://www.instagram.com/accounts/login/?hl=en');
            await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);
            await this.humanBehavior.moveMouseRandomly();
        }

        await this.dismissCommonPopups();

        try {
            await this.page.waitForSelector('input[name="username"]', { timeout: 10000 });
        } catch (e) {
            await this.page.screenshot({ path: path.join(this.logsDir, `login_page_error_${this.config.username}.png`) });
            if (await this.checkIfLoggedIn()) {
                this.logger.success('Detected that we are already logged in!');
                await this.ensureCookiesAreSaved();
                return;
            }
            throw new Error('Could not find username input on login page');
        }

        this.logger.action('Typing credentials...');
        await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);

        const usernameSelector = 'input[name="username"]';
        const passwordSelector = 'input[name="password"]';

        await this.humanBehavior.naturalTyping(usernameSelector, this.config.username, {
            min: 80,
            max: 250,
            typoChance: 0.07,
        });

        await this.humanBehavior.randomDelay(500, 1500);

        await this.humanBehavior.naturalTyping(passwordSelector, this.config.password!, {
            min: 100,
            max: 300,
            typoChance: 0.03,
        });

        this.logger.action('Submitting login form...');
        await this.humanBehavior.randomDelay(800, 2000);

        const loginButton = this.page.getByRole('button', { name: 'Log in', exact: true });
        await this.humanBehavior.hesitateAndClick(loginButton);

        try {
            const saveInfoButton = this.page.getByRole('button', { name: 'Save info' });
            await saveInfoButton.waitFor({ timeout: 8000 });
            this.logger.action('Saving login info...');
            await this.humanBehavior.randomDelay(500, 1500);
            await this.humanBehavior.hesitateAndClick(saveInfoButton);
            await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);
        } catch (e) {}

        try {
            const profileLinkSelector = `a[href="/${this.config.username}/"]`;
            await this.page.waitForSelector(profileLinkSelector, { timeout: 15000, state: 'visible' });
        } catch (error) {
            const screenshotPath = path.join(this.logsDir, `login_error_${this.config.username}.png`);
            await this.page.screenshot({ path: screenshotPath });
            throw new Error(`Login failed. Screenshot saved to: ${screenshotPath}`);
        }

        await this.dismissCommonPopups();
        this.logger.action('Saving cookies to disk...');
        await this.context.storageState({ path: this.cookiePath });
    }

    private isReelUrl(url?: string): boolean {
        return /\/reels?\//i.test(url ?? this.page.url());
    }

    private getMentionHandle(): string | undefined {
        const handle = this.config.mentionUsername?.trim().replace(/^@/, '');
        return handle || undefined;
    }

    private getMentionPolicy(): MentionPolicy {
        return this.config.mentionPolicy ?? 'ai_only';
    }

    private ensureChannelMention(comment: string): string {
        const handle = this.getMentionHandle();
        const policy = this.getMentionPolicy();
        if (!handle || policy === 'ai_only') {
            return comment;
        }

        const mention = `@${handle}`;
        const mentionPattern = new RegExp(`@${handle}\\b`, 'i');
        if (mentionPattern.test(comment)) {
            return comment;
        }

        if (policy === 'append_if_missing' || policy === 'always') {
            this.logger.info(`Appending channel mention ${mention} to comment.`);
            return `${comment.trimEnd()} ${mention}`;
        }

        return comment;
    }

    private async confirmInstagramMention(handle: string): Promise<void> {
        await this.page.keyboard.type('@');
        await this.humanBehavior.randomDelay(250, 500);

        for (const char of handle) {
            await this.page.keyboard.type(char);
            await this.humanBehavior.randomDelay(70, 160);
        }

        await this.humanBehavior.randomDelay(900, 1600);

        const suggestionCandidates = [
            this.page.getByRole('button', { name: new RegExp(handle, 'i') }),
            this.page.locator('[role="listbox"] [role="button"]').filter({ hasText: new RegExp(handle, 'i') }),
            this.page.locator('ul[role="listbox"] li, div[role="listbox"] div').filter({
                hasText: new RegExp(handle, 'i'),
            }),
            this.page.getByText(new RegExp(`^${handle}$`, 'i')),
        ];

        for (const candidate of suggestionCandidates) {
            if ((await candidate.count()) === 0) {
                continue;
            }

            const option = candidate.first();
            try {
                if (await option.isVisible({ timeout: 2000 })) {
                    await this.humanBehavior.hesitateAndClick(option);
                    await this.humanBehavior.randomDelay(300, 600);
                    this.logger.debug(`Selected @${handle} from mention suggestions.`);
                    return;
                }
            } catch {
                continue;
            }
        }

        this.logger.warn(`Mention autocomplete for @${handle} not found; accepting keyboard suggestion.`);
        await this.page.keyboard.press('ArrowDown').catch(() => {});
        await this.humanBehavior.randomDelay(150, 350);
        await this.page.keyboard.press('Enter');
        await this.humanBehavior.randomDelay(300, 600);
    }

    private async typeCommentWithMentions(commentInput: Locator, text: string): Promise<void> {
        const mentionPattern = /@[a-zA-Z0-9._]+/g;
        const parts = text.split(mentionPattern);
        const mentions = text.match(mentionPattern) ?? [];

        await commentInput.click();
        await this.humanBehavior.randomDelay(300, 800);

        if (mentions.length === 0) {
            await this.humanBehavior.typeText(text);
            return;
        }

        for (let i = 0; i < parts.length; i++) {
            const segment = parts[i];
            if (segment) {
                await this.humanBehavior.typeText(segment);
            }

            const mention = mentions[i];
            if (mention) {
                await this.confirmInstagramMention(mention.replace(/^@/, ''));
            }
        }
    }

    private resolveCommentNavigationUrl(postUrl: string): string {
        const shortcode = extractPostShortcode(postUrl);
        if (!shortcode) {
            return postUrl;
        }

        // Full-page /reel/ layout clips the comment panel in automation; /p/ opens stable post modal.
        if (/\/reels?\//i.test(postUrl)) {
            const postLayoutUrl = `https://www.instagram.com/p/${shortcode}/`;
            this.logger.info(`Using post modal URL for commenting: ${postLayoutUrl}`);
            return postLayoutUrl;
        }

        return postUrl.startsWith('http')
            ? postUrl
            : `https://www.instagram.com/p/${shortcode}/`;
    }

    private async ensurePostViewLayout(reloadAfterResize = false): Promise<void> {
        const target = this.browserViewport;
        const current = this.page.viewportSize();
        const needsResize =
            !current || current.width !== target.width || current.height !== target.height;

        if (needsResize) {
            this.logger.action(`Setting viewport to ${target.width}x${target.height}...`);
            await this.page.setViewportSize(target);
            await this.humanBehavior.randomDelay(400, 800);
        }

        if ((needsResize || reloadAfterResize) && /instagram\.com/i.test(this.page.url())) {
            this.logger.action('Reloading page to apply viewport layout...');
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            await this.dismissCommonPopups();
        }
    }

    private async verifyCommentPosted(commentScope: Locator, aiComment: string): Promise<boolean> {
        const snippets = [
            aiComment,
            aiComment.slice(0, Math.min(60, aiComment.length)),
            aiComment
                .replace(/[^\p{L}\p{N}\s]/gu, '')
                .trim()
                .slice(0, 40),
        ].filter((text, index, arr) => text.length >= 8 && arr.indexOf(text) === index);

        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            for (const snippet of snippets) {
                if ((await commentScope.getByText(snippet, { exact: false }).count()) > 0) {
                    return true;
                }
                if ((await this.page.locator('body').getByText(snippet, { exact: false }).count()) > 0) {
                    return true;
                }
            }

            const input = await this.findVisibleCommentInput(this.page.locator('body'));
            if (input) {
                const remaining = await input
                    .evaluate((el: HTMLTextAreaElement | HTMLElement) => {
                        if (el instanceof HTMLTextAreaElement) {
                            return el.value.trim();
                        }
                        return (el.textContent ?? '').trim();
                    })
                    .catch(() => 'pending');
                if (remaining === '') {
                    return true;
                }
            }

            await this.humanBehavior.randomDelay(1500, 2500);
        }

        return false;
    }

    private static readonly COMMENT_INPUT_SELECTORS =
        'textarea[aria-label*="comment" i], textarea[placeholder*="comment" i], ' +
        '[contenteditable="true"][aria-label*="comment" i], div[role="textbox"][aria-label*="comment" i]';

    private getCommentTextareaLocator(scope: Locator): Locator {
        return scope.locator(InstagramBot.COMMENT_INPUT_SELECTORS);
    }

    private getCommentInputCandidates(scope: Locator): Locator[] {
        return [
            scope.getByRole('textbox', { name: /add a comment/i }),
            scope.getByPlaceholder(/add a comment/i),
            this.getCommentTextareaLocator(scope),
        ];
    }

    private async findVisibleCommentInput(scope: Locator): Promise<Locator | null> {
        for (const candidate of this.getCommentInputCandidates(scope)) {
            if ((await candidate.count()) === 0) {
                continue;
            }

            const input = candidate.first();
            try {
                if (await input.isVisible({ timeout: 1500 })) {
                    await input.scrollIntoViewIfNeeded();
                    return input;
                }
            } catch {
                continue;
            }
        }

        return null;
    }

    private async hasVideoPlaybackError(): Promise<boolean> {
        return (
            (await this.page.getByText("Sorry, we're having trouble playing this video", { exact: false }).count()) >
            0
        );
    }

    private async recoverFromVideoPlaybackError(postShortcode: string): Promise<void> {
        if (!(await this.hasVideoPlaybackError())) {
            return;
        }

        this.logger.warn('Video playback error detected. Retrying page load...');
        this.capturedVideoUrl = undefined;

        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);
        await this.dismissCommonPopups();

        if (!(await this.hasVideoPlaybackError())) {
            this.logger.success('Media loaded after reload.');
            return;
        }

        if (!this.isReelUrl()) {
            return;
        }

        const postLayoutUrl = `https://www.instagram.com/p/${postShortcode}/`;
        this.logger.action(`Trying post layout instead of reel player: ${postLayoutUrl}`);
        this.capturedVideoUrl = undefined;

        await this.page.goto(postLayoutUrl, { waitUntil: 'domcontentloaded' });
        await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);
        await this.dismissCommonPopups();

        if (await this.hasVideoPlaybackError()) {
            this.logger.warn(
                'Video still unavailable after recovery. Set settings.browserChannel to "chrome" — bundled Chromium lacks H.264 codecs for Instagram reels.'
            );
        } else {
            this.logger.success('Post layout loaded without video playback error.');
        }
    }

    private async isCommentTextareaVisible(scope: Locator): Promise<boolean> {
        return (await this.findVisibleCommentInput(scope)) !== null;
    }

    private async areCommentsDisabled(): Promise<boolean> {
        const disabledMessages = [
            'Comments on this post have been limited',
            'Comments on this reel have been limited',
            'Commenting has been turned off',
            'comments are turned off',
        ];

        for (const message of disabledMessages) {
            if ((await this.page.getByText(message, { exact: false }).count()) > 0) {
                return true;
            }
        }

        return false;
    }

    private async clickCommentToggle(): Promise<boolean> {
        const isReel = this.isReelUrl();
        const reelToggles = [
            this.page.locator('main section svg[aria-label="Comment"]').locator('xpath=ancestor::button[1]'),
            this.page.locator('main section svg[aria-label="Comment"]').locator('xpath=ancestor::*[@role="button"][1]'),
        ];
        const commonToggles = [
            this.page.getByRole('button', { name: /^Comment$/i }),
            this.page.getByRole('button', { name: /^View all comments$/i }),
            this.page.getByText(/View all \d+ comments/i),
            this.page.getByText(/\d+\s+comments?/i),
            this.page.locator('svg[aria-label="Comment"]').locator('xpath=ancestor::button[1]'),
            this.page.locator('svg[aria-label="Comment"]').locator('xpath=ancestor::*[@role="button"][1]'),
            this.page.locator('article').getByRole('button', { name: /^Comment$/i }),
            this.page.locator('section svg[aria-label="Comment"]').locator('xpath=ancestor::*[@role="button"][1]'),
        ];
        const toggleCandidates = isReel ? [...reelToggles, ...commonToggles] : commonToggles;

        for (const candidate of toggleCandidates) {
            if ((await candidate.count()) === 0) {
                continue;
            }

            const toggle = candidate.first();
            try {
                if (!(await toggle.isVisible({ timeout: 1500 }))) {
                    continue;
                }

                this.logger.action('Opening comment section...');
                await toggle.scrollIntoViewIfNeeded();
                await this.humanBehavior.hesitateAndClick(toggle);
                await this.humanBehavior.randomDelay(isReel ? 2000 : 1000, isReel ? 4000 : 2500);
                return true;
            } catch {
                continue;
            }
        }

        return false;
    }

    private async waitForCommentInputVisible(timeoutMs: number): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const input = await this.findVisibleCommentInput(this.page.locator('body'));
            if (input) {
                return;
            }
            await this.humanBehavior.randomDelay(300, 600);
        }
    }

    private async resolveCommentScope(postRoot: Locator): Promise<Locator> {
        const dialogWithComment = this.page.locator('div[role="dialog"]').filter({
            has: this.page
                .getByRole('textbox', { name: /add a comment/i })
                .or(this.page.locator(InstagramBot.COMMENT_INPUT_SELECTORS)),
        });

        if ((await dialogWithComment.count()) > 0) {
            const dialog = dialogWithComment.first();
            if (await dialog.isVisible({ timeout: 1500 }).catch(() => false)) {
                return dialog;
            }
        }

        const scopes = [postRoot, this.page.locator('main').first(), this.page.locator('body')];
        for (const scope of scopes) {
            if (await this.isCommentTextareaVisible(scope)) {
                return scope;
            }
        }

        return postRoot;
    }

    private async openCommentSectionIfNeeded(postRoot: Locator): Promise<Locator> {
        if (await this.areCommentsDisabled()) {
            return postRoot;
        }

        const inputTimeout = this.isReelUrl() ? 10000 : 8000;
        let commentScope = await this.resolveCommentScope(postRoot);
        if (await this.isCommentTextareaVisible(commentScope)) {
            return commentScope;
        }

        if (await this.clickCommentToggle()) {
            await this.waitForCommentInputVisible(inputTimeout);
            commentScope = await this.resolveCommentScope(postRoot);
        }

        if (!(await this.isCommentTextareaVisible(commentScope))) {
            if (await this.clickCommentToggle()) {
                await this.waitForCommentInputVisible(inputTimeout);
                commentScope = await this.resolveCommentScope(postRoot);
            }
        }

        return commentScope;
    }

    private async getPostRootLocator(): Promise<Locator> {
        const dialog = this.page.locator('div[role="dialog"]').first();
        if ((await dialog.count()) > 0) {
            try {
                if (await dialog.isVisible({ timeout: 2000 })) {
                    return dialog;
                }
            } catch (e) {}
        }

        const article = this.page.locator('article').first();
        if ((await article.count()) > 0) {
            return article;
        }

        return this.page.locator('main').first();
    }

    private async isPageUnavailable(): Promise<boolean> {
        const unavailableMessages = [
            "Sorry, this page isn't available.",
            "This content isn't available right now",
            'Page Not Found',
        ];

        for (const message of unavailableMessages) {
            if ((await this.page.getByText(message, { exact: false }).count()) > 0) {
                return true;
            }
        }

        return false;
    }

    private async hasLoadablePostContent(): Promise<boolean> {
        if (await this.isPageUnavailable()) {
            return false;
        }

        if ((await this.page.locator('input[name="username"]').count()) > 0) {
            return false;
        }

        const shortcode = extractPostShortcode(this.page.url());
        if (!shortcode && !/\/(p|reels?)\//i.test(this.page.url())) {
            return false;
        }

        const dialog = this.page.locator('div[role="dialog"]').first();
        const article = this.page.locator('article').first();
        const video = this.page.locator('video').first();
        const postMedia = this.page.locator(
            'main img[src*="cdninstagram"], main img[src*="instagram"], div[role="dialog"] img[src*="instagram"]'
        );

        const [hasDialog, hasArticle, hasVideo, hasImage] = await Promise.all([
            dialog.isVisible({ timeout: 2000 }).catch(() => false),
            article.isVisible({ timeout: 2000 }).catch(() => false),
            video.isVisible({ timeout: 2000 }).catch(() => false),
            postMedia
                .first()
                .isVisible({ timeout: 2000 })
                .catch(() => false),
        ]);

        if (hasDialog || hasArticle || hasVideo || hasImage) {
            return true;
        }

        const postRoot = await this.getPostRootLocator();
        const caption = await this.extractPostCaption(postRoot);
        return caption.trim().length > 0;
    }

    private async skipUnreadablePost(postShortcode: string, reason: string): Promise<InteractionResult> {
        this.logger.warn(`${reason} Skipping.`);
        await this.page.screenshot({
            path: path.join(this.logsDir, `skip_unreadable_${this.config.username}_${postShortcode}.png`),
        });
        return 'SKIPPED';
    }

    private async waitForPostLoaded(): Promise<void> {
        const isReel = this.isReelUrl();
        const dialog = this.page.locator('div[role="dialog"]');
        const article = this.page.locator('article');
        const video = this.page.locator('video');

        await Promise.race([
            dialog.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
            article.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
            ...(isReel ? [video.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})] : []),
        ]);

        // Comment panel opens after AI generation — opening here closes before typing.
        await this.humanBehavior.randomDelay(500, 1200);
    }

    private parseProfileHref(href: string | null): string | null {
        if (!href) {
            return null;
        }

        const match = href.match(/^\/([^/?#]+)\/?$/);
        if (!match || match[1] === 'p' || match[1] === 'reel' || match[1] === 'reels') {
            return null;
        }

        return match[1];
    }

    private async extractPostAuthorUsername(): Promise<string | null> {
        try {
            const postRoot = await this.getPostRootLocator();
            const authorCandidates = [
                postRoot.locator('header a[href^="/"]').first(),
                postRoot.locator('a[href^="/"][role="link"]').first(),
                this.page.locator('header a[href^="/"]').first(),
                this.page.locator('section a[href^="/"]').first(),
            ];

            for (const authorLink of authorCandidates) {
                if ((await authorLink.count()) === 0) {
                    continue;
                }

                const href = await authorLink.getAttribute('href');
                const username = this.parseProfileHref(href);
                if (username) {
                    return username;
                }
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    private looksLikeUsernameOnly(text: string): boolean {
        const trimmed = text.trim().replace(/^@/, '');
        if (!trimmed || trimmed.includes(' ')) {
            return false;
        }
        return /^[a-zA-Z0-9._]+$/.test(trimmed) && trimmed.length < 25;
    }

    private async expandCaptionIfNeeded(postRoot: Locator): Promise<void> {
        const moreCandidates = [
            postRoot.getByRole('button', { name: /^more$/i }),
            postRoot.locator('span').filter({ hasText: /^more$/i }),
            this.page.getByRole('button', { name: /^more$/i }),
            this.page.locator('span').filter({ hasText: /^more$/i }),
        ];

        for (const candidate of moreCandidates) {
            try {
                if ((await candidate.count()) === 0) {
                    continue;
                }
                const button = candidate.first();
                if (await button.isVisible({ timeout: 1000 })) {
                    await this.humanBehavior.hesitateAndClick(button);
                    await this.humanBehavior.randomDelay(400, 900);
                    return;
                }
            } catch {
                continue;
            }
        }
    }

    private async extractPostCaption(postRoot: Locator): Promise<string> {
        await this.expandCaptionIfNeeded(postRoot);

        const authorUsername = (await this.extractPostAuthorUsername())?.toLowerCase();
        const candidates: string[] = [];

        const captionLocators = [
            postRoot.locator('h1'),
            postRoot.locator('ul li span[dir="auto"]'),
            postRoot.locator('span[dir="auto"]'),
            this.page.locator('article h1'),
            this.page.locator('article ul li span[dir="auto"]'),
            this.page.locator('article span[dir="auto"]'),
            this.page.locator('h1'),
            this.page.locator('span[dir="auto"]'),
        ];

        for (const locator of captionLocators) {
            const count = await locator.count();
            for (let i = 0; i < Math.min(count, 20); i++) {
                try {
                    const el = locator.nth(i);
                    if (!(await el.isVisible({ timeout: 500 }).catch(() => false))) {
                        continue;
                    }

                    const text = (await el.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
                    if (text.length < 3) {
                        continue;
                    }
                    if (authorUsername && text.replace(/^@/, '').toLowerCase() === authorUsername) {
                        continue;
                    }
                    if (this.looksLikeUsernameOnly(text) && text.length < 18) {
                        continue;
                    }
                    if (/^(more|less|follow|following|like|comment|share|save)$/i.test(text)) {
                        continue;
                    }
                    candidates.push(text);
                } catch {
                    continue;
                }
            }
        }

        if (candidates.length === 0) {
            return '';
        }

        const unique = [...new Set(candidates)];
        unique.sort((a, b) => b.length - a.length);
        return unique[0];
    }

    private async commentOnOpenPost(
        targetUsername: string,
        aiPromptHint: string | undefined,
        postShortcode: string
    ): Promise<InteractionResult> {
        if (this.commentHistory.hasCommented(this.config.username, postShortcode)) {
            this.logger.warn(`Already commented on post ${postShortcode}. Skipping.`);
            return 'SKIPPED';
        }

        const postRoot = await this.getPostRootLocator();
        const isReel = this.isReelUrl();
        this.logger.success(isReel ? 'Reel content loaded.' : 'Post content loaded.');

        this.logger.action('Extracting post caption...');
        let postCaption = '';
        try {
            postCaption = await this.extractPostCaption(postRoot);
            if (postCaption) {
                this.logger.info(`Found caption: "${postCaption.substring(0, 50)}..."`);
            } else {
                this.logger.info('No caption found on this post.');
            }
        } catch (e) {
            this.logger.warn('Could not extract post caption.');
        }

        this.logger.action('Extracting post media (image/video)...');
        let postImageUrl: string | undefined;
        let postVideoUrl: string | undefined;

        try {
            const videoPlaybackFailed = await this.hasVideoPlaybackError();
            const videoElement = postRoot.locator('video');

            if (videoPlaybackFailed) {
                this.logger.warn('Video playback failed on page; using caption only for AI comment.');
            } else if ((await videoElement.count()) > 0) {
                this.logger.info('Detected video post');

                if (this.capturedVideoUrl) {
                    postVideoUrl = this.capturedVideoUrl;
                    this.logger.info(`Using captured video URL: ${this.capturedVideoUrl.substring(0, 80)}...`);
                } else {
                    this.logger.warn('Video post detected but no video URL was captured from network requests');
                }

                if (!postImageUrl) {
                    const poster = await videoElement.first().getAttribute('poster');
                    if (poster && !poster.includes('static') && !poster.includes('sprite')) {
                        postImageUrl = poster;
                        this.logger.info(`Using video poster thumbnail for AI: ${poster.substring(0, 80)}...`);
                    }
                }
            } else {
                const imageLocators = [
                    postRoot.locator('img[src*="instagram"]').first(),
                    postRoot.locator('img[alt]').first(),
                    postRoot.locator('article img').first(),
                ];

                for (const imageLocator of imageLocators) {
                    if ((await imageLocator.count()) > 0 && (await imageLocator.isVisible({ timeout: 2000 }))) {
                        const src = await imageLocator.getAttribute('src');
                        if (src && !src.includes('static') && !src.includes('sprite')) {
                            postImageUrl = src;
                            this.logger.info(`Found post image: ${src.substring(0, 80)}...`);
                            break;
                        }
                    }
                }

                if (!postImageUrl) {
                    this.logger.info('No post image found or image could not be extracted.');
                }
            }
        } catch (e) {
            this.logger.warn('Could not extract post media.');
        }

        const isVideoPost = isReel || Boolean(postVideoUrl);
        const hasContext = hasActionablePostContext(
            postCaption,
            postImageUrl,
            postVideoUrl,
            this.aiGenerator.supportsVideoAnalysis(),
            isVideoPost
        );

        let aiComment: string;
        if (!hasContext) {
            aiComment = getGenericStudyFallbackComment(this.getMentionHandle());
            this.logger.warn(
                isVideoPost
                    ? 'Video post lacks analyzable caption/media for AI; using generic study fallback comment.'
                    : 'No post context available; using generic study fallback comment.'
            );
        } else {
            this.logger.action('Generating AI comment...');
            try {
                aiComment = await this.aiGenerator.generateInstagramComment(
                    postCaption,
                    targetUsername,
                    aiPromptHint,
                    postImageUrl,
                    postVideoUrl,
                    this.channelSkillsContext,
                    this.getMentionHandle()
                );
            } catch (error: any) {
                this.logger.warn(`AI generation failed (${error.message}); using generic study fallback.`);
                aiComment = getGenericStudyFallbackComment(this.getMentionHandle());
            }

            if (isUnusableAiComment(aiComment)) {
                this.logger.warn('AI returned unusable comment; using generic study fallback.');
                aiComment = getGenericStudyFallbackComment(this.getMentionHandle());
            }
        }

        const finalComment = this.ensureChannelMention(aiComment);
        if (finalComment !== aiComment) {
            this.logger.info(`Final comment with mention: "${finalComment}"`);
        } else {
            this.logger.success(`AI Generated Comment: "${aiComment}"`);
        }

        if (await this.areCommentsDisabled()) {
            this.logger.warn('Comments are disabled or limited on this post/reel. Skipping.');
            await this.page.screenshot({
                path: path.join(this.logsDir, `comments_disabled_${this.config.username}_${postShortcode}.png`),
            });
            return 'SKIPPED';
        }

        const commentScope = await this.openCommentSectionIfNeeded(postRoot);
        const commentInput = await this.findVisibleCommentInput(commentScope);

        if (!commentInput) {
            const videoFailed = await this.hasVideoPlaybackError();
            this.logger.warn(
                videoFailed
                    ? 'Cannot find comment area — video failed to play (use settings.browserChannel: "chrome").'
                    : 'Cannot find comment area — reel comment panel may be blocked or hidden.'
            );
            await this.page.screenshot({
                path: path.join(this.logsDir, `no_comment_area_error_${this.config.username}_${postShortcode}.png`),
            });
            return 'SKIPPED';
        }

        await this.humanBehavior.jitteryMovement(commentInput);
        await this.humanBehavior.randomDelay(1000, 3000);

        this.logger.action('Typing comment...');
        await this.typeCommentWithMentions(commentInput, finalComment);
        await this.humanBehavior.randomDelay(1500, 4000);

        let postButton = commentScope.locator('form').getByRole('button', { name: 'Post' });
        if ((await postButton.count()) === 0) {
            postButton = commentScope.getByRole('button', { name: 'Post' });
        }

        if ((await postButton.count()) === 0 || !(await postButton.isEnabled())) {
            this.logger.error('Could not find an enabled "Post" button.');
            await this.page.screenshot({
                path: path.join(this.logsDir, `no_post_button_error_${this.config.username}_${postShortcode}.png`),
            });
            return 'FAILED';
        }

        this.logger.action('Submitting the comment...');
        await postButton.first().scrollIntoViewIfNeeded();
        await this.humanBehavior.hesitateAndClick(postButton.first());
        await this.humanBehavior.randomDelay(3000, 5000);

        const verified = await this.verifyCommentPosted(commentScope, finalComment);
        if (verified) {
            this.logger.success(`Successfully commented on ${isReel ? 'reel' : 'post'} (${postShortcode}).`);
        } else {
            this.logger.warn('Could not verify if comment was posted successfully.');
            await this.page.screenshot({
                path: path.join(this.logsDir, `comment_verify_error_${this.config.username}_${postShortcode}.png`),
            });
            return 'FAILED';
        }

        const postUrl = extractPostShortcode(this.page.url()) ? this.page.url() : undefined;
        this.commentHistory.recordComment(this.config.username, postShortcode, {
            postUrl,
            commentText: finalComment,
        });
        await this.logInteraction(postShortcode, 'comment', finalComment);
        return 'SUCCESS';
    }

    public async runCommentTaskOnUrl(postUrl: string, aiPromptHint?: string): Promise<InteractionResult> {
        const postShortcode = extractPostShortcode(postUrl) ?? postUrl;

        this.logger.header(`----- Starting Comment Task for ${postUrl} -----`);

        if (!extractPostShortcode(postUrl)) {
            return await this.skipUnreadablePost(
                postShortcode,
                `Invalid Instagram post/reel URL: ${postUrl}.`
            );
        }

        if (this.commentHistory.hasCommented(this.config.username, postShortcode)) {
            this.logger.warn(`Already commented on post ${postShortcode}. Skipping.`);
            return 'SKIPPED';
        }

        try {
            this.capturedVideoUrl = undefined;
            this.isCapturingVideo = true;

            const navigateUrl = this.resolveCommentNavigationUrl(postUrl);
            await this.ensurePostViewLayout();

            this.logger.action(`Navigating to post URL...`);
            await this.page.goto(navigateUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);
            await this.ensurePostViewLayout(true);

            if (await this.isPageUnavailable()) {
                return await this.skipUnreadablePost(
                    postShortcode,
                    'Post is unavailable or private.'
                );
            }

            await this.recoverFromVideoPlaybackError(postShortcode);
            await this.ensurePostViewLayout();
            await this.waitForPostLoaded();

            if (!(await this.hasLoadablePostContent())) {
                return await this.skipUnreadablePost(
                    postShortcode,
                    'Could not load post or reel content from URL.'
                );
            }

            const authorUsername = (await this.extractPostAuthorUsername()) ?? postShortcode;

            return await this.commentOnOpenPost(authorUsername, aiPromptHint, postShortcode);
        } catch (error: any) {
            return await this.skipUnreadablePost(
                postShortcode,
                `Could not load post from ${postUrl}: ${error.message}.`
            );
        } finally {
            this.isCapturingVideo = false;
        }
    }

    private parseEngagementCount(text: string): number | null {
        if (!text) return null;
        const cleanedText = text.toLowerCase().trim().replace(/,/g, '');
        const match = cleanedText.match(/([\d.]+)\s*(k|m)?/);
        if (!match) return null;

        const num = parseFloat(match[1]);
        if (isNaN(num)) return null;

        if (match[2] === 'k') return Math.round(num * 1000);
        if (match[2] === 'm') return Math.round(num * 1000000);
        return Math.round(num);
    }

    private normalizePostUrl(url: string): string {
        let normalized = url.trim();
        if (!normalized.startsWith('http')) {
            normalized = `https://www.instagram.com${normalized.startsWith('/') ? '' : '/'}${normalized}`;
        }
        return normalized.split('?')[0].replace(/\/$/, '') + '/';
    }

    private extractShortcodeFromUrl(url: string): string | null {
        return extractPostShortcode(url);
    }

    private async tryClickHashtagTopTab(): Promise<void> {
        const topTabCandidates = [
            this.page.getByRole('link', { name: 'Top', exact: true }),
            this.page.getByRole('tab', { name: 'Top', exact: true }),
            this.page.getByText('Top', { exact: true }),
        ];

        for (const candidate of topTabCandidates) {
            if ((await candidate.count()) === 0) continue;
            const tab = candidate.first();
            if (!(await tab.isVisible({ timeout: 2000 }))) continue;

            this.logger.action('Switching hashtag view to Top...');
            await this.humanBehavior.hesitateAndClick(tab);
            await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            return;
        }

        this.logger.info('Top tab not found on hashtag page; using default view.');
    }

    private async getHashtagPostLinkLocator(): Promise<Locator> {
        const selectors = [
            'main a[href*="/p/"], main a[href*="/reel/"]',
            'article a[href*="/p/"], article a[href*="/reel/"]',
            'a[href*="/p/"], a[href*="/reel/"]',
        ];

        for (const selector of selectors) {
            const locator = this.page.locator(selector);
            if ((await locator.count()) > 0) {
                return locator;
            }
        }

        return this.page.locator('a[href*="/p/"], a[href*="/reel/"]');
    }

    private async collectHashtagPostUrls(maxPosts: number): Promise<string[]> {
        const seenShortcodes = new Set<string>();
        const urls: string[] = [];
        let stagnantScrolls = 0;

        await this.page
            .locator('a[href*="/p/"], a[href*="/reel/"]')
            .first()
            .waitFor({ state: 'attached', timeout: 15000 })
            .catch(() => {});

        while (urls.length < maxPosts && stagnantScrolls < 4) {
            const links = await this.getHashtagPostLinkLocator();
            const count = await links.count();
            let foundNew = false;

            for (let i = 0; i < count; i++) {
                const href = await links.nth(i).getAttribute('href');
                if (!href) continue;

                const fullUrl = this.normalizePostUrl(href);
                const shortcode = this.extractShortcodeFromUrl(fullUrl);
                if (!shortcode || seenShortcodes.has(shortcode)) continue;

                seenShortcodes.add(shortcode);
                urls.push(fullUrl);
                foundNew = true;

                if (urls.length >= maxPosts) break;
            }

            if (urls.length >= maxPosts) break;

            if (!foundNew) {
                stagnantScrolls++;
            } else {
                stagnantScrolls = 0;
            }

            await this.page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.85));
            await this.humanBehavior.randomDelay(800, 1800);
        }

        return urls;
    }

    public async discoverHashtagPostUrls(hashtag: string, searchConfig: UiHashtagSearchConfig): Promise<string[]> {
        const normalizedTag = hashtag.replace(/^#/, '').toLowerCase();
        this.logger.action(`Discovering posts for #${normalizedTag}...`);

        await this.page.goto(`https://www.instagram.com/explore/tags/${normalizedTag}/?hl=en`, {
            waitUntil: 'domcontentloaded',
        });
        await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);

        if ((await this.page.getByText("Sorry, this page isn't available.").count()) > 0) {
            this.logger.warn(`Hashtag #${normalizedTag} is unavailable.`);
            await this.page.screenshot({
                path: path.join(this.logsDir, `hashtag_error_${this.config.username}_${normalizedTag}.png`),
            });
            return [];
        }

        await this.page.locator('main').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        await this.dismissCommonPopups();

        if (searchConfig.preferTopTab) {
            await this.tryClickHashtagTopTab();
        }

        await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);

        const urls = await this.collectHashtagPostUrls(searchConfig.maxPostsToScan);
        if (urls.length === 0) {
            await this.page.screenshot({
                path: path.join(this.logsDir, `hashtag_error_${this.config.username}_${normalizedTag}.png`),
            });
        }
        this.logger.info(`Collected ${urls.length} post/reel URL(s) for #${normalizedTag}.`);
        return urls;
    }

    public async extractPostEngagement(postUrl: string): Promise<{ likes: number; comments: number }> {
        this.logger.debug(`Reading engagement for ${postUrl}...`);

        await this.page.goto(postUrl, { waitUntil: 'domcontentloaded' });
        await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);

        if ((await this.page.getByText("Sorry, this page isn't available.").count()) > 0) {
            this.logger.warn(`Post unavailable while reading engagement: ${postUrl}`);
            return { likes: 0, comments: 0 };
        }

        await this.waitForPostLoaded();
        const postRoot = await this.getPostRootLocator();

        let likes = 0;
        let comments = 0;

        try {
            const likeSpans = postRoot.locator('span[title]');
            const likeSpanCount = await likeSpans.count();
            for (let i = 0; i < likeSpanCount; i++) {
                const title = await likeSpans.nth(i).getAttribute('title');
                if (!title) continue;
                const parsed = this.parseEngagementCount(title);
                if (parsed !== null && parsed > likes) {
                    likes = parsed;
                }
            }

            const likeTextLocator = postRoot.getByText(/\d[\d,.]*\s+likes?/i);
            if ((await likeTextLocator.count()) > 0) {
                const likeText = (await likeTextLocator.first().textContent()) || '';
                const parsed = this.parseEngagementCount(likeText);
                if (parsed !== null) likes = Math.max(likes, parsed);
            }

            const commentTextLocator = postRoot.getByText(/\d[\d,.]*\s+comments?/i);
            if ((await commentTextLocator.count()) > 0) {
                const commentText = (await commentTextLocator.first().textContent()) || '';
                const parsed = this.parseEngagementCount(commentText);
                if (parsed !== null) comments = parsed;
            }

            if (comments === 0) {
                const commentItems = postRoot.locator('ul ul li');
                const commentItemCount = await commentItems.count();
                if (commentItemCount > 0) {
                    comments = commentItemCount;
                }
            }
        } catch (e: any) {
            this.logger.warn(`Could not fully parse engagement for ${postUrl}: ${e.message}`);
        }

        this.logger.debug(`Engagement for ${postUrl}: ${likes} likes, ${comments} comments`);
        return { likes, comments };
    }

    public async discoverAndRankHashtagPosts(
        hashtag: string,
        searchConfig: UiHashtagSearchConfig,
        skipShortcodes: Set<string> = new Set()
    ): Promise<HashtagPostCandidate[]> {
        const urls = await this.discoverHashtagPostUrls(hashtag, searchConfig);
        const candidates: HashtagPostCandidate[] = [];

        for (const url of urls) {
            const shortcode = this.extractShortcodeFromUrl(url);
            if (!shortcode || skipShortcodes.has(shortcode)) {
                if (shortcode) {
                    this.logger.info(`Skipping already-seen shortcode: ${shortcode}`);
                }
                continue;
            }

            const { likes, comments } = await this.extractPostEngagement(url);

            if (likes < searchConfig.minLikes || comments < searchConfig.minComments) {
                this.logger.info(
                    `Skipping ${url} — below thresholds (likes: ${likes}, comments: ${comments}).`
                );
                await this.humanBehavior.randomDelay(500, 1200);
                continue;
            }

            const contentType: 'post' | 'reel' = url.includes('/reel/') ? 'reel' : 'post';

            candidates.push({
                url,
                shortcode,
                likes,
                comments,
                engagementScore: computeEngagementScore(likes, comments, searchConfig),
                contentType,
            });

            await this.humanBehavior.randomDelay(500, 1200);
        }

        const topCandidates = rankHashtagCandidates(candidates, searchConfig);

        if (topCandidates.length > 0) {
            this.logger.header(`Ranked posts for #${hashtag.replace(/^#/, '')}:`);
            topCandidates.forEach((candidate, index) => {
                this.logger.info(
                    `${index + 1}. ${candidate.url} | ${formatEngagementCounts(candidate)} | score: ${candidate.engagementScore}`
                );
            });
        } else {
            this.logger.warn(`No qualifying posts found for #${hashtag.replace(/^#/, '')}.`);
        }

        return topCandidates;
    }

    public async runCommentTask(targetUsername: string, aiPromptHint?: string): Promise<InteractionResult> {
        this.logger.header(`----- Starting Comment Task for @${targetUsername} -----`);

        try {
            this.capturedVideoUrl = undefined;
            this.isCapturingVideo = false;

            this.logger.action(`Navigating to @${targetUsername}'s profile page...`);
            await this.page.goto(`https://www.instagram.com/${targetUsername}/?hl=en`);
            await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);

            const isPrivate = (await this.page.getByText('This Account Is Private').count()) > 0;
            if (isPrivate) {
                this.logger.warn(`@${targetUsername} is private. Cannot comment on posts.`);
                return 'SKIPPED';
            }

            this.logger.action(`Looking for the latest, non-pinned post...`);
            const allPostLinks = this.page.locator('main a[href*="/p/"], main a[href*="/reel/"]');

            const nonPinnedPostLinks = allPostLinks.filter({
                hasNot: this.page.locator('svg[aria-label="Pinned post icon"]'),
            });

            const postCount = await nonPinnedPostLinks.count();

            if (postCount === 0) {
                if ((await allPostLinks.count()) > 0) {
                    this.logger.warn(
                        `Could not find any non-pinned posts on @${targetUsername}'s profile. All visible posts may be pinned. Skipping.`
                    );
                } else {
                    this.logger.warn(`Could not find any posts on @${targetUsername}'s profile. Skipping.`);
                }
                await this.page.screenshot({ path: path.join(this.logsDir, `no_posts_error_${this.config.username}_${targetUsername}.png`) });
                return 'SKIPPED';
            }

            const latestPost = nonPinnedPostLinks.first();
            this.logger.action(`Opening latest post...`);

            this.isCapturingVideo = true;

            await this.humanBehavior.hesitateAndClick(latestPost);

            await Promise.race([
                this.page.waitForSelector('div[role="dialog"]', { state: 'visible', timeout: 15000 }).catch(() => {}),
                this.page.waitForURL(/\/(p|reel)\//, { timeout: 15000 }).catch(() => {}),
            ]);
            await this.waitForPostLoaded();
            this.logger.success('Post or reel opened.');
            await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);

            const postShortcode = extractPostShortcode(this.page.url());
            if (!postShortcode) {
                this.logger.warn('Could not determine post shortcode from URL. Skipping.');
                return 'SKIPPED';
            }

            return await this.commentOnOpenPost(targetUsername, aiPromptHint, postShortcode);
        } catch (error: any) {
            this.logger.error(`An error occurred during comment task for @${targetUsername}: ${error.message}`);
            await this.page.screenshot({ path: path.join(this.logsDir, `comment_task_error_${this.config.username}_${targetUsername}.png`) });
            return 'FAILED';
        } finally {
            this.isCapturingVideo = false;
        }
    }
}