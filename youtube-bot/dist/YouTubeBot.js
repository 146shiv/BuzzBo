"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTubeBot = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const comments_1 = require("@buzzbo/core/comments");
const humanBehavior_1 = require("./humanBehavior");
class YouTubeBot {
    constructor(accountConfig, globalSettings, pauseState, logger, aiGenerator, commentHistory, channelSkillsContext, runtimePaths) {
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
        }
        else {
            const actionDelay = accountConfig.actionDelaySeconds ?? globalSettings.defaultActionDelaySeconds;
            this.actionDelays = {
                min: actionDelay.min * 1000,
                max: actionDelay.max * 1000,
            };
        }
    }
    getRandomActionDelayMs() {
        return this.actionDelays.min + Math.random() * (this.actionDelays.max - this.actionDelays.min);
    }
    async setupPage(context) {
        this.context = context;
        this.page = await context.newPage();
        this.humanBehavior = new humanBehavior_1.HumanBehavior(this.page, this.developerMode, this.pauseState, this.logger);
    }
    async saveSessionCookies() {
        try {
            fs.mkdirSync(path.dirname(this.cookiePath), { recursive: true });
            await this.context.storageState({ path: this.cookiePath });
            this.logger.success('YouTube session cookies saved.');
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Failed to save cookies: ${msg}`);
        }
    }
    async checkIfLoggedIn() {
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
            }
            catch {
                /* try next */
            }
        }
        const avatarImg = this.page.locator('button#avatar-btn img, ytd-topbar-menu-button-renderer #avatar-btn img');
        try {
            return await avatarImg.first().isVisible({ timeout: 3000 });
        }
        catch {
            return false;
        }
    }
    /** True when the watch page shows an authenticated comment box (not sign-in prompt). */
    async canPostComments() {
        const signInPrompt = this.page.locator('ytd-comment-sign-in-renderer, ytd-comments-header-renderer:has-text("Sign in to comment")');
        try {
            if (await signInPrompt.first().isVisible({ timeout: 2000 })) {
                return false;
            }
        }
        catch {
            /* no sign-in wall */
        }
        const placeholder = this.page.locator('ytd-comment-simplebox-renderer #placeholder-area, ytd-comment-simplebox-renderer #simplebox-placeholder');
        try {
            return await placeholder.first().isVisible({ timeout: 3000 });
        }
        catch {
            return false;
        }
    }
    async dismissConsentDialog() {
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
            }
            catch {
                /* try next */
            }
        }
    }
    async init(context) {
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
    async initWithManualLogin(context, waitForLoginConfirm) {
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
    async captureFailureScreenshot(label) {
        try {
            fs.mkdirSync(this.logsDir, { recursive: true });
            const screenshotPath = path.join(this.logsDir, `youtube-error-${label}-${Date.now()}.png`);
            await this.page.screenshot({ path: screenshotPath, fullPage: true });
            this.logger.info(`Screenshot saved: ${screenshotPath}`);
        }
        catch {
            /* ignore */
        }
    }
    async extractVideoMetadata() {
        const title = (await this.page.locator('h1.ytd-watch-metadata yt-formatted-string, h1 yt-formatted-string').first().textContent())?.trim() ||
            (await this.page.locator('meta[name="title"]').getAttribute('content'))?.trim() ||
            '';
        const channelName = (await this.page.locator('#owner #channel-name a, ytd-channel-name a').first().textContent())?.trim() ||
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
        }
        catch {
            /* description optional */
        }
        return { title, channelName, description };
    }
    async scrollToComments() {
        for (let i = 0; i < 4; i++) {
            await this.page.mouse.wheel(0, 600);
            await this.humanBehavior.randomizedWait({ base: 400, variance: 200 });
        }
        const comments = this.page.locator('ytd-comments#comments, #comments');
        await comments.first().scrollIntoViewIfNeeded().catch(() => { });
        await this.humanBehavior.randomizedWait({ base: 800, variance: 400 });
    }
    async submitComment(text) {
        if (!(await this.canPostComments())) {
            this.logger.error('Not signed in — YouTube shows "Sign in to comment". Use Connect YouTube first.');
            return false;
        }
        const commentBox = this.page.locator('ytd-comment-simplebox-renderer').first();
        const placeholder = commentBox.locator('#placeholder-area, #simplebox-placeholder');
        try {
            await placeholder.waitFor({ state: 'visible', timeout: 8000 });
            await placeholder.click();
        }
        catch {
            this.logger.error('Could not open the YouTube comment box.');
            return false;
        }
        await this.humanBehavior.randomizedWait({ base: 500, variance: 300 });
        const input = commentBox.locator('#contenteditable-root');
        try {
            await input.waitFor({ state: 'visible', timeout: 10000 });
            await input.click();
            await this.humanBehavior.typeTextInField(input, text);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Could not type comment: ${msg}`);
            return false;
        }
        const submitBtn = commentBox.locator('#submit-button button, #submit-button yt-button-shape button, #submit-button');
        try {
            await submitBtn.first().waitFor({ state: 'visible', timeout: 5000 });
            await submitBtn.first().click();
            await this.humanBehavior.randomizedWait({ base: 1500, variance: 500 });
            return true;
        }
        catch {
            this.logger.error('Comment submit button not found or not clickable.');
            return false;
        }
    }
    async runCommentTaskOnUrl(videoUrl, aiPromptHint) {
        const videoId = (0, comments_1.extractYouTubeVideoId)(videoUrl);
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
                this.logger.error('YouTube session is not signed in (comments show "Sign in to comment"). Use Connect YouTube first.');
                await this.captureFailureScreenshot('not-signed-in');
                return 'FAILED';
            }
            const comment = await this.aiGenerator.generateYouTubeComment(title, channelName, aiPromptHint ?? this.config.aiPromptHint, description, this.channelSkillsContext ?? this.config.skillsContent);
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
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Comment task failed: ${msg}`);
            await this.captureFailureScreenshot('exception');
            return 'FAILED';
        }
    }
}
exports.YouTubeBot = YouTubeBot;
