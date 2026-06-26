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
exports.InstagramBot = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const humanBehavior_1 = require("./humanBehavior");
const textEncoding_1 = require("./textEncoding");
const genai_1 = require("@buzzbo/core/ai/genai");
const comments_1 = require("@buzzbo/core/comments");
const hashtagRanking_1 = require("./hashtagRanking");
class InstagramBot {
    constructor(accountConfig, globalSettings, pauseState, logger, aiGenerator, commentHistory, channelSkillsContext, runtimePaths) {
        this.capturedVideoUrl = undefined;
        this.isCapturingVideo = false;
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
        }
        else {
            const actionDelay = accountConfig.actionDelaySeconds ?? globalSettings.defaultActionDelaySeconds;
            this.actionDelays = {
                min: actionDelay.min * 1000,
                max: actionDelay.max * 1000,
            };
            this.logger.info(`Action delay loaded: ${actionDelay.min}s - ${actionDelay.max}s`);
        }
        try {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
        catch {
            /* ignore */
        }
    }
    async logInteraction(targetUsername, actionType, comment) {
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
        }
        catch (error) {
            this.logger.error(`Failed to write to global CSV log: ${error.message}`);
        }
    }
    async ensureCookiesAreSaved() {
        if (!fs.existsSync(this.cookiePath)) {
            this.logger.action('Session is active but cookie file is missing. Saving now...');
            try {
                await this.context.storageState({ path: this.cookiePath });
                this.logger.success(`Cookies saved successfully.`);
            }
            catch (e) {
                this.logger.error(`Failed to save cookies: ${e.message}`);
            }
        }
    }
    getPage() {
        return this.page;
    }
    getRandomActionDelayMs() {
        return this.actionDelays.min + Math.random() * (this.actionDelays.max - this.actionDelays.min);
    }
    async saveSessionCookies() {
        this.logger.action('Saving session cookies to disk...');
        try {
            await this.context.storageState({ path: this.cookiePath });
            this.logger.success('Session cookies saved.');
        }
        catch (e) {
            this.logger.error(`Failed to save cookies: ${e.message}`);
        }
    }
    async setupPage(context) {
        this.context = context;
        this.page = await this.context.newPage();
        this.humanBehavior = new humanBehavior_1.HumanBehavior(this.page, this.developerMode, this.pauseState, this.logger);
        this.page.on('response', async (response) => {
            try {
                if (!this.isCapturingVideo)
                    return;
                if (this.capturedVideoUrl)
                    return;
                const url = response.url();
                const contentType = response.headers()['content-type'];
                if (contentType &&
                    contentType.includes('video/mp4') &&
                    url.includes('fbcdn.net') &&
                    (url.includes('instagram') || url.includes('ig'))) {
                    this.capturedVideoUrl = url;
                    this.logger.info(`Captured video URL: ${url.substring(0, 80)}...`);
                }
            }
            catch (e) { }
        });
    }
    async init(context) {
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
            }
            else {
                this.logger.info('Not logged in. Performing login.');
                await this.login();
                return true;
            }
        }
        catch (e) {
            this.logger.error(`Error during init: ${e.message}. Attempting login...`);
            await this.login();
            return true;
        }
    }
    async initWithManualLogin(context, waitForLoginConfirm) {
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
    async checkIfLoggedInGeneric() {
        try {
            const usernameInput = this.page.locator('input[name="username"]');
            if ((await usernameInput.count()) > 0 && (await usernameInput.first().isVisible())) {
                return false;
            }
            const homeIcon = this.page.locator('svg[aria-label="Home"]');
            if ((await homeIcon.count()) > 0)
                return true;
            const createIcon = this.page.locator('svg[aria-label="New post"], svg[aria-label="Create"]');
            if ((await createIcon.count()) > 0)
                return true;
            const exploreIcon = this.page.locator('svg[aria-label="Explore"]');
            if ((await exploreIcon.count()) > 0)
                return true;
            return false;
        }
        catch (e) {
            this.logger.error(`Error checking login status: ${e.message}`);
            return false;
        }
    }
    async checkIfLoggedIn() {
        try {
            const profileLink = this.page.locator(`a[href="/${this.config.username}/"]`);
            if ((await profileLink.count()) > 0)
                return true;
            const homeIcon = this.page.locator('svg[aria-label="Home"]');
            if ((await homeIcon.count()) > 0)
                return true;
            const usernameInput = this.page.locator('input[name="username"]');
            if ((await usernameInput.count()) > 0)
                return false;
            return false;
        }
        catch (e) {
            this.logger.error(`Error checking login status: ${e.message}`);
            return false;
        }
    }
    async dismissCommonPopups() {
        try {
            const allowCookiesButton = this.page.getByRole('button', { name: 'Allow all cookies' });
            if ((await allowCookiesButton.count()) > 0) {
                this.logger.action('Dismissing "Allow all cookies" popup...');
                await this.humanBehavior.hesitateAndClick(allowCookiesButton);
                await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            }
        }
        catch (e) { }
        try {
            const saveInfoButton = this.page.getByRole('button', { name: 'Save Info' });
            if ((await saveInfoButton.count()) > 0) {
                this.logger.action('Dismissing "Save Info" popup...');
                await this.humanBehavior.hesitateAndClick(saveInfoButton);
                await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            }
        }
        catch (e) { }
        try {
            const notNowButton = this.page.getByRole('button', { name: 'Not Now' });
            if ((await notNowButton.count()) > 0) {
                this.logger.action('Dismissing "Turn on Notifications" popup...');
                await this.humanBehavior.hesitateAndClick(notNowButton.first());
                await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            }
        }
        catch (e) { }
    }
    async login() {
        if (!this.config.password?.trim()) {
            throw new Error(`No password configured for @${this.config.username}. Set password or use loginMethod: 'manual'.`);
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
        }
        catch (e) {
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
        await this.humanBehavior.naturalTyping(passwordSelector, this.config.password, {
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
        }
        catch (e) { }
        try {
            const profileLinkSelector = `a[href="/${this.config.username}/"]`;
            await this.page.waitForSelector(profileLinkSelector, { timeout: 15000, state: 'visible' });
        }
        catch (error) {
            const screenshotPath = path.join(this.logsDir, `login_error_${this.config.username}.png`);
            await this.page.screenshot({ path: screenshotPath });
            throw new Error(`Login failed. Screenshot saved to: ${screenshotPath}`);
        }
        await this.dismissCommonPopups();
        this.logger.action('Saving cookies to disk...');
        await this.context.storageState({ path: this.cookiePath });
    }
    isReelUrl(url) {
        return /\/reels?\//i.test(url ?? this.page.url());
    }
    getMentionHandle() {
        const handle = this.config.mentionUsername?.trim().replace(/^@/, '');
        return handle || undefined;
    }
    getMentionPolicy() {
        return this.config.mentionPolicy ?? 'ai_only';
    }
    ensureChannelMention(comment) {
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
    async confirmInstagramMention(handle) {
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
            }
            catch {
                continue;
            }
        }
        this.logger.warn(`Mention autocomplete for @${handle} not found; accepting keyboard suggestion.`);
        await this.page.keyboard.press('ArrowDown').catch(() => { });
        await this.humanBehavior.randomDelay(150, 350);
        await this.page.keyboard.press('Enter');
        await this.humanBehavior.randomDelay(300, 600);
    }
    async readCommentInputValue(input) {
        return input.evaluate((el) => {
            if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
                return el.value;
            }
            return el.innerText || el.textContent || '';
        });
    }
    async repairCommentInputEncoding(commentInput, expected) {
        let actual = await this.readCommentInputValue(commentInput);
        if (!(0, textEncoding_1.commentTextHasEncodingCorruption)(expected, actual)) {
            return;
        }
        const replacementCount = (actual.match(/\uFFFD/g) ?? []).length;
        for (let i = 0; i < replacementCount; i++) {
            await commentInput.focus();
            await this.page.keyboard.press('Backspace');
            await this.humanBehavior.randomDelay(80, 150);
        }
        actual = await this.readCommentInputValue(commentInput);
        const expectedEmoji = expected.match(/\p{Extended_Pictographic}+/gu) ?? [];
        for (const emoji of expectedEmoji) {
            if (!actual.includes(emoji)) {
                await this.humanBehavior.insertTextIntoEditable(commentInput, emoji);
                await this.humanBehavior.randomDelay(200, 400);
            }
        }
    }
    async typeCommentWithMentions(commentInput, text) {
        const mentionPattern = /@[a-zA-Z0-9._]+/g;
        const parts = text.split(mentionPattern);
        const mentions = text.match(mentionPattern) ?? [];
        await commentInput.click();
        await this.humanBehavior.randomDelay(300, 800);
        if (mentions.length === 0) {
            await this.humanBehavior.typeTextInField(commentInput, text);
            return;
        }
        for (let i = 0; i < parts.length; i++) {
            const segment = parts[i];
            if (segment) {
                await this.humanBehavior.typeTextInField(commentInput, segment);
            }
            const mention = mentions[i];
            if (mention) {
                await this.confirmInstagramMention(mention.replace(/^@/, ''));
            }
        }
    }
    resolveCommentNavigationUrl(postUrl) {
        const shortcode = (0, comments_1.extractPostShortcode)(postUrl);
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
    async ensurePostViewLayout(reloadAfterResize = false) {
        const target = this.browserViewport;
        const current = this.page.viewportSize();
        const needsResize = !current || current.width !== target.width || current.height !== target.height;
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
    async verifyCommentPosted(commentScope, aiComment) {
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
                    .evaluate((el) => {
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
    getCommentTextareaLocator(scope) {
        return scope.locator(InstagramBot.COMMENT_INPUT_SELECTORS);
    }
    getCommentInputCandidates(scope) {
        return [
            scope.getByRole('textbox', { name: /add a comment/i }),
            scope.getByPlaceholder(/add a comment/i),
            this.getCommentTextareaLocator(scope),
        ];
    }
    async findVisibleCommentInput(scope) {
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
            }
            catch {
                continue;
            }
        }
        return null;
    }
    async hasVideoPlaybackError() {
        return ((await this.page.getByText("Sorry, we're having trouble playing this video", { exact: false }).count()) >
            0);
    }
    async recoverFromVideoPlaybackError(postShortcode) {
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
            this.logger.warn('Video still unavailable after recovery. Set settings.browserChannel to "chrome" — bundled Chromium lacks H.264 codecs for Instagram reels.');
        }
        else {
            this.logger.success('Post layout loaded without video playback error.');
        }
    }
    async isCommentTextareaVisible(scope) {
        return (await this.findVisibleCommentInput(scope)) !== null;
    }
    async areCommentsDisabled() {
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
    async clickCommentToggle() {
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
            }
            catch {
                continue;
            }
        }
        return false;
    }
    async waitForCommentInputVisible(timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const input = await this.findVisibleCommentInput(this.page.locator('body'));
            if (input) {
                return;
            }
            await this.humanBehavior.randomDelay(300, 600);
        }
    }
    async resolveCommentScope(postRoot) {
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
    async openCommentSectionIfNeeded(postRoot) {
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
    async getPostRootLocator() {
        const dialog = this.page.locator('div[role="dialog"]').first();
        if ((await dialog.count()) > 0) {
            try {
                if (await dialog.isVisible({ timeout: 2000 })) {
                    return dialog;
                }
            }
            catch (e) { }
        }
        if (/\/reels?\/?$/i.test(this.page.url()) || this.isReelsFeedUrl()) {
            return this.getActiveReelsFeedRoot();
        }
        const article = this.page.locator('article').first();
        if ((await article.count()) > 0) {
            return article;
        }
        return this.page.locator('main').first();
    }
    async isPageUnavailable() {
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
    async hasLoadablePostContent() {
        if (await this.isPageUnavailable()) {
            return false;
        }
        if ((await this.page.locator('input[name="username"]').count()) > 0) {
            return false;
        }
        const shortcode = (0, comments_1.extractPostShortcode)(this.page.url());
        if (!shortcode && !/\/(p|reels?)\//i.test(this.page.url())) {
            return false;
        }
        const dialog = this.page.locator('div[role="dialog"]').first();
        const article = this.page.locator('article').first();
        const video = this.page.locator('video').first();
        const postMedia = this.page.locator('main img[src*="cdninstagram"], main img[src*="instagram"], div[role="dialog"] img[src*="instagram"]');
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
    async skipUnreadablePost(postShortcode, reason) {
        this.logger.warn(`${reason} Skipping.`);
        await this.page.screenshot({
            path: path.join(this.logsDir, `skip_unreadable_${this.config.username}_${postShortcode}.png`),
        });
        return 'SKIPPED';
    }
    async waitForPostLoaded() {
        const isReel = this.isReelUrl();
        const dialog = this.page.locator('div[role="dialog"]');
        const article = this.page.locator('article');
        const video = this.page.locator('video');
        await Promise.race([
            dialog.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => { }),
            article.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => { }),
            ...(isReel ? [video.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => { })] : []),
        ]);
        // Comment panel opens after AI generation — opening here closes before typing.
        await this.humanBehavior.randomDelay(500, 1200);
    }
    parseProfileHref(href) {
        if (!href) {
            return null;
        }
        let path = href.trim();
        try {
            if (path.startsWith('http')) {
                path = new URL(path).pathname;
            }
        }
        catch {
            return null;
        }
        const match = path.match(/^\/([^/?#]+)\/?$/);
        if (!match || InstagramBot.RESERVED_PROFILE_SEGMENTS.has(match[1].toLowerCase())) {
            return null;
        }
        return match[1];
    }
    parseUsernameFromProfileAlt(alt) {
        if (!alt) {
            return null;
        }
        const patterns = [
            /^@?([a-zA-Z0-9._]+)'s profile picture$/i,
            /^@?([a-zA-Z0-9._]+)'s profile$/i,
            /^Profile picture of @?([a-zA-Z0-9._]+)$/i,
            /^@?([a-zA-Z0-9._]+)$/,
        ];
        for (const pattern of patterns) {
            const match = alt.trim().match(pattern);
            if (match?.[1] && !InstagramBot.RESERVED_PROFILE_SEGMENTS.has(match[1].toLowerCase())) {
                return match[1];
            }
        }
        return null;
    }
    isReelsFeedUrl(url = this.page.url()) {
        try {
            const path = new URL(url).pathname.replace(/\/$/, '') || '/';
            return path === '/reels';
        }
        catch {
            return false;
        }
    }
    async extractPostAuthorUsername() {
        try {
            if (this.isReelsFeedUrl()) {
                const fromDom = await this.extractReelsFeedItemFromDom();
                if (fromDom?.authorUsername) {
                    return fromDom.authorUsername;
                }
            }
            const postRoot = await this.getPostRootLocator();
            const authorCandidates = [
                postRoot.locator('header a[href^="/"]').first(),
                postRoot.locator('a[href^="/"][role="link"]').first(),
                postRoot.locator('a[href*="/"]').filter({ has: postRoot.locator('img') }).first(),
                this.page.locator('header a[href^="/"]').first(),
                this.page.locator('section a[href^="/"]').first(),
                this.page.locator('article header a[href^="/"]').first(),
            ];
            for (const authorLink of authorCandidates) {
                if ((await authorLink.count()) === 0) {
                    continue;
                }
                const href = await this.getAttributeSafe(authorLink, 'href', 1500);
                const username = this.parseProfileHref(href);
                if (username) {
                    return username;
                }
            }
            const allProfileLinks = postRoot.locator('a[href^="/"]');
            const linkCount = await allProfileLinks.count();
            for (let i = 0; i < Math.min(linkCount, 24); i++) {
                const href = await this.getAttributeSafe(allProfileLinks.nth(i), 'href', 1000);
                const username = this.parseProfileHref(href);
                if (username) {
                    return username;
                }
            }
            const profileImages = postRoot.locator('img[alt*="profile" i], header img[alt], img[alt]');
            const imageCount = await profileImages.count();
            for (let i = 0; i < Math.min(imageCount, 6); i++) {
                const alt = await this.getAttributeSafe(profileImages.nth(i), 'alt', 1000);
                const fromAlt = this.parseUsernameFromProfileAlt(alt);
                if (fromAlt) {
                    return fromAlt;
                }
            }
            return null;
        }
        catch (e) {
            return null;
        }
    }
    looksLikeUsernameOnly(text) {
        const trimmed = text.trim().replace(/^@/, '');
        if (!trimmed || trimmed.includes(' ')) {
            return false;
        }
        return /^[a-zA-Z0-9._]+$/.test(trimmed) && trimmed.length < 25;
    }
    async expandCaptionIfNeeded(postRoot) {
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
            }
            catch {
                continue;
            }
        }
    }
    async extractPostCaption(postRoot) {
        await this.expandCaptionIfNeeded(postRoot);
        const authorUsername = (await this.extractPostAuthorUsername())?.toLowerCase();
        const candidates = [];
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
                }
                catch {
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
    async extractPostMediaFromRoot(postRoot, isReel) {
        let postImageUrl;
        let postVideoUrl;
        try {
            const videoPlaybackFailed = await this.hasVideoPlaybackError();
            const videoElement = postRoot.locator('video');
            if (videoPlaybackFailed) {
                this.logger.warn('Video playback failed on page; using caption only for AI comment.');
            }
            else if ((await videoElement.count()) > 0) {
                this.logger.info('Detected video post');
                if (this.capturedVideoUrl) {
                    postVideoUrl = this.capturedVideoUrl;
                    this.logger.info(`Using captured video URL: ${this.capturedVideoUrl.substring(0, 80)}...`);
                }
                else {
                    this.logger.warn('Video post detected but no video URL was captured from network requests');
                }
                const poster = await videoElement.first().getAttribute('poster');
                if (poster && !poster.includes('static') && !poster.includes('sprite')) {
                    postImageUrl = poster;
                    this.logger.info(`Using video poster thumbnail for AI: ${poster.substring(0, 80)}...`);
                }
            }
            else if (!isReel) {
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
        }
        catch {
            this.logger.warn('Could not extract post media.');
        }
        return { postImageUrl, postVideoUrl };
    }
    async buildCommentForPost(targetUsername, aiPromptHint, postCaption, postImageUrl, postVideoUrl, isReel) {
        const isVideoPost = isReel || Boolean(postVideoUrl);
        const hasContext = (0, genai_1.hasActionablePostContext)(postCaption, postImageUrl, postVideoUrl, this.aiGenerator.supportsVideoAnalysis(), isVideoPost);
        let aiComment;
        if (!hasContext) {
            aiComment = (0, genai_1.getGenericStudyFallbackComment)(this.getMentionHandle());
            this.logger.warn(isVideoPost
                ? 'Video post lacks analyzable caption/media for AI; using generic study fallback comment.'
                : 'No post context available; using generic study fallback comment.');
        }
        else {
            this.logger.action('Generating AI comment...');
            try {
                aiComment = await this.aiGenerator.generateInstagramComment(postCaption, targetUsername, aiPromptHint, postImageUrl, postVideoUrl, this.channelSkillsContext, this.getMentionHandle());
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                this.logger.warn(`AI generation failed (${msg}); using generic study fallback.`);
                aiComment = (0, genai_1.getGenericStudyFallbackComment)(this.getMentionHandle());
            }
            if ((0, genai_1.isUnusableAiComment)(aiComment)) {
                this.logger.warn('AI returned unusable comment; using generic study fallback.');
                aiComment = (0, genai_1.getGenericStudyFallbackComment)(this.getMentionHandle());
            }
        }
        const finalComment = this.ensureChannelMention(aiComment);
        if (finalComment !== aiComment) {
            this.logger.info(`Final comment with mention: "${finalComment}"`);
        }
        else {
            this.logger.success(`AI Generated Comment: "${aiComment}"`);
        }
        return finalComment;
    }
    async submitTopLevelComment(postRoot, finalComment, postShortcode, isReel) {
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
            this.logger.warn(videoFailed
                ? 'Cannot find comment area — video failed to play (use settings.browserChannel: "chrome").'
                : 'Cannot find comment area — reel comment panel may be blocked or hidden.');
            await this.page.screenshot({
                path: path.join(this.logsDir, `no_comment_area_error_${this.config.username}_${postShortcode}.png`),
            });
            return 'SKIPPED';
        }
        await this.humanBehavior.jitteryMovement(commentInput);
        await this.humanBehavior.randomDelay(1000, 3000);
        this.logger.action('Typing comment...');
        await this.typeCommentWithMentions(commentInput, finalComment);
        const typedComment = await this.readCommentInputValue(commentInput);
        if ((0, textEncoding_1.commentTextHasEncodingCorruption)(finalComment, typedComment)) {
            await this.repairCommentInputEncoding(commentInput, finalComment);
        }
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
        }
        else {
            this.logger.warn('Could not verify if comment was posted successfully.');
            await this.page.screenshot({
                path: path.join(this.logsDir, `comment_verify_error_${this.config.username}_${postShortcode}.png`),
            });
            return 'FAILED';
        }
        const postUrl = (0, comments_1.extractPostShortcode)(this.page.url()) ? this.page.url() : undefined;
        this.commentHistory.recordComment(this.config.username, postShortcode, {
            postUrl,
            commentText: finalComment,
        });
        await this.logInteraction(postShortcode, 'comment', finalComment);
        return 'SUCCESS';
    }
    async commentOnOpenPost(targetUsername, aiPromptHint, postShortcode) {
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
            }
            else {
                this.logger.info('No caption found on this post.');
            }
        }
        catch (e) {
            this.logger.warn('Could not extract post caption.');
        }
        this.logger.action('Extracting post media (image/video)...');
        const { postImageUrl, postVideoUrl } = await this.extractPostMediaFromRoot(postRoot, isReel);
        const finalComment = await this.buildCommentForPost(targetUsername, aiPromptHint, postCaption, postImageUrl, postVideoUrl, isReel);
        return this.submitTopLevelComment(postRoot, finalComment, postShortcode, isReel);
    }
    async runCommentTaskOnUrl(postUrl, aiPromptHint) {
        const postShortcode = (0, comments_1.extractPostShortcode)(postUrl) ?? postUrl;
        this.logger.header(`----- Starting Comment Task for ${postUrl} -----`);
        if (!(0, comments_1.extractPostShortcode)(postUrl)) {
            return await this.skipUnreadablePost(postShortcode, `Invalid Instagram post/reel URL: ${postUrl}.`);
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
                return await this.skipUnreadablePost(postShortcode, 'Post is unavailable or private.');
            }
            await this.recoverFromVideoPlaybackError(postShortcode);
            await this.ensurePostViewLayout();
            await this.waitForPostLoaded();
            if (!(await this.hasLoadablePostContent())) {
                return await this.skipUnreadablePost(postShortcode, 'Could not load post or reel content from URL.');
            }
            const authorUsername = (await this.extractPostAuthorUsername()) ?? postShortcode;
            return await this.commentOnOpenPost(authorUsername, aiPromptHint, postShortcode);
        }
        catch (error) {
            return await this.skipUnreadablePost(postShortcode, `Could not load post from ${postUrl}: ${error.message}.`);
        }
        finally {
            this.isCapturingVideo = false;
        }
    }
    parseEngagementCount(text) {
        if (!text)
            return null;
        const cleanedText = text.toLowerCase().trim().replace(/,/g, '');
        const match = cleanedText.match(/([\d.]+)\s*(k|m)?/);
        if (!match)
            return null;
        const num = parseFloat(match[1]);
        if (isNaN(num))
            return null;
        if (match[2] === 'k')
            return Math.round(num * 1000);
        if (match[2] === 'm')
            return Math.round(num * 1000000);
        return Math.round(num);
    }
    normalizePostUrl(url) {
        let normalized = url.trim();
        if (!normalized.startsWith('http')) {
            normalized = `https://www.instagram.com${normalized.startsWith('/') ? '' : '/'}${normalized}`;
        }
        return normalized.split('?')[0].replace(/\/$/, '') + '/';
    }
    extractShortcodeFromUrl(url) {
        return (0, comments_1.extractPostShortcode)(url);
    }
    async tryClickHashtagTopTab() {
        const topTabCandidates = [
            this.page.getByRole('link', { name: 'Top', exact: true }),
            this.page.getByRole('tab', { name: 'Top', exact: true }),
            this.page.getByText('Top', { exact: true }),
        ];
        for (const candidate of topTabCandidates) {
            if ((await candidate.count()) === 0)
                continue;
            const tab = candidate.first();
            if (!(await tab.isVisible({ timeout: 2000 })))
                continue;
            this.logger.action('Switching hashtag view to Top...');
            await this.humanBehavior.hesitateAndClick(tab);
            await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            return;
        }
        this.logger.info('Top tab not found on hashtag page; using default view.');
    }
    async getHashtagPostLinkLocator() {
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
    async collectHashtagPostUrls(maxPosts) {
        const seenShortcodes = new Set();
        const urls = [];
        let stagnantScrolls = 0;
        await this.page
            .locator('a[href*="/p/"], a[href*="/reel/"]')
            .first()
            .waitFor({ state: 'attached', timeout: 15000 })
            .catch(() => { });
        while (urls.length < maxPosts && stagnantScrolls < 4) {
            const links = await this.getHashtagPostLinkLocator();
            const count = await links.count();
            let foundNew = false;
            for (let i = 0; i < count; i++) {
                const href = await links.nth(i).getAttribute('href');
                if (!href)
                    continue;
                const fullUrl = this.normalizePostUrl(href);
                const shortcode = this.extractShortcodeFromUrl(fullUrl);
                if (!shortcode || seenShortcodes.has(shortcode))
                    continue;
                seenShortcodes.add(shortcode);
                urls.push(fullUrl);
                foundNew = true;
                if (urls.length >= maxPosts)
                    break;
            }
            if (urls.length >= maxPosts)
                break;
            if (!foundNew) {
                stagnantScrolls++;
            }
            else {
                stagnantScrolls = 0;
            }
            await this.page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.85));
            await this.humanBehavior.randomDelay(800, 1800);
        }
        return urls;
    }
    async discoverHashtagPostUrls(hashtag, searchConfig) {
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
        await this.page.locator('main').waitFor({ state: 'visible', timeout: 15000 }).catch(() => { });
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
    async extractPostEngagement(postUrl) {
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
                if (!title)
                    continue;
                const parsed = this.parseEngagementCount(title);
                if (parsed !== null && parsed > likes) {
                    likes = parsed;
                }
            }
            const likeTextLocator = postRoot.getByText(/\d[\d,.]*\s+likes?/i);
            if ((await likeTextLocator.count()) > 0) {
                const likeText = (await likeTextLocator.first().textContent()) || '';
                const parsed = this.parseEngagementCount(likeText);
                if (parsed !== null)
                    likes = Math.max(likes, parsed);
            }
            const commentTextLocator = postRoot.getByText(/\d[\d,.]*\s+comments?/i);
            if ((await commentTextLocator.count()) > 0) {
                const commentText = (await commentTextLocator.first().textContent()) || '';
                const parsed = this.parseEngagementCount(commentText);
                if (parsed !== null)
                    comments = parsed;
            }
            if (comments === 0) {
                const commentItems = postRoot.locator('ul ul li');
                const commentItemCount = await commentItems.count();
                if (commentItemCount > 0) {
                    comments = commentItemCount;
                }
            }
        }
        catch (e) {
            this.logger.warn(`Could not fully parse engagement for ${postUrl}: ${e.message}`);
        }
        this.logger.debug(`Engagement for ${postUrl}: ${likes} likes, ${comments} comments`);
        return { likes, comments };
    }
    async discoverAndRankHashtagPosts(hashtag, searchConfig, skipShortcodes = new Set()) {
        const urls = await this.discoverHashtagPostUrls(hashtag, searchConfig);
        const candidates = [];
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
                this.logger.info(`Skipping ${url} — below thresholds (likes: ${likes}, comments: ${comments}).`);
                await this.humanBehavior.randomDelay(500, 1200);
                continue;
            }
            const contentType = url.includes('/reel/') ? 'reel' : 'post';
            candidates.push({
                url,
                shortcode,
                likes,
                comments,
                engagementScore: (0, hashtagRanking_1.computeEngagementScore)(likes, comments, searchConfig),
                contentType,
            });
            await this.humanBehavior.randomDelay(500, 1200);
        }
        const topCandidates = (0, hashtagRanking_1.rankHashtagCandidates)(candidates, searchConfig);
        if (topCandidates.length > 0) {
            this.logger.header(`Ranked posts for #${hashtag.replace(/^#/, '')}:`);
            topCandidates.forEach((candidate, index) => {
                this.logger.info(`${index + 1}. ${candidate.url} | ${(0, hashtagRanking_1.formatEngagementCounts)(candidate)} | score: ${candidate.engagementScore}`);
            });
        }
        else {
            this.logger.warn(`No qualifying posts found for #${hashtag.replace(/^#/, '')}.`);
        }
        return topCandidates;
    }
    async runCommentTask(targetUsername, aiPromptHint) {
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
                    this.logger.warn(`Could not find any non-pinned posts on @${targetUsername}'s profile. All visible posts may be pinned. Skipping.`);
                }
                else {
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
                this.page.waitForSelector('div[role="dialog"]', { state: 'visible', timeout: 15000 }).catch(() => { }),
                this.page.waitForURL(/\/(p|reel)\//, { timeout: 15000 }).catch(() => { }),
            ]);
            await this.waitForPostLoaded();
            this.logger.success('Post or reel opened.');
            await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            const postShortcode = (0, comments_1.extractPostShortcode)(this.page.url());
            if (!postShortcode) {
                this.logger.warn('Could not determine post shortcode from URL. Skipping.');
                return 'SKIPPED';
            }
            return await this.commentOnOpenPost(targetUsername, aiPromptHint, postShortcode);
        }
        catch (error) {
            this.logger.error(`An error occurred during comment task for @${targetUsername}: ${error.message}`);
            await this.page.screenshot({ path: path.join(this.logsDir, `comment_task_error_${this.config.username}_${targetUsername}.png`) });
            return 'FAILED';
        }
        finally {
            this.isCapturingVideo = false;
        }
    }
    parseShortcodeFromHref(href) {
        if (!href) {
            return null;
        }
        return (0, comments_1.extractPostShortcode)(href.startsWith('http') ? href : `https://www.instagram.com${href}`);
    }
    async getAttributeSafe(locator, attribute, timeoutMs = 2000) {
        try {
            if ((await locator.count()) === 0) {
                return null;
            }
            const el = locator.first();
            if (!(await el.isVisible({ timeout: timeoutMs }).catch(() => false))) {
                return null;
            }
            return await el.getAttribute(attribute, { timeout: timeoutMs });
        }
        catch {
            return null;
        }
    }
    async extractReelsFeedItemFromDom() {
        return this.page.evaluate(() => {
            const reserved = new Set([
                'p',
                'reel',
                'reels',
                'explore',
                'accounts',
                'stories',
                'direct',
                'tags',
                'legal',
                'about',
                'developer',
            ]);
            const videos = Array.from(document.querySelectorAll('video'));
            let bestVideo = null;
            let bestArea = 0;
            for (const video of videos) {
                const rect = video.getBoundingClientRect();
                if (rect.width < 120 || rect.height < 120) {
                    continue;
                }
                if (rect.bottom < 0 || rect.top > window.innerHeight) {
                    continue;
                }
                const area = rect.width * rect.height;
                if (area > bestArea) {
                    bestArea = area;
                    bestVideo = video;
                }
            }
            if (!bestVideo) {
                return null;
            }
            let root = bestVideo;
            for (let depth = 0; depth < 14 && root; depth++) {
                if (root.tagName === 'ARTICLE' ||
                    root.getAttribute('role') === 'presentation' ||
                    root.querySelector('a[href*="/reel/"], a[href*="/p/"]')) {
                    break;
                }
                root = root.parentElement;
            }
            root = root ?? bestVideo.parentElement ?? bestVideo;
            let shortcode = null;
            let authorUsername = null;
            const links = Array.from(root.querySelectorAll('a[href]'));
            for (const link of links) {
                const href = link.getAttribute('href') || '';
                const mediaMatch = href.match(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/i);
                if (mediaMatch && !shortcode) {
                    const candidate = mediaMatch[1];
                    if (!reserved.has(candidate.toLowerCase()) && candidate.length >= 5) {
                        shortcode = candidate;
                    }
                }
                const profileMatch = href.match(/^\/([^/?#]+)\/?$/);
                if (profileMatch) {
                    const user = profileMatch[1];
                    if (!reserved.has(user.toLowerCase()) && user.length >= 2) {
                        authorUsername = user;
                    }
                }
            }
            if (!shortcode || !authorUsername) {
                for (const link of Array.from(document.querySelectorAll('main a[href*="/reel/"], main a[href*="/p/"], main a[href^="/"]'))) {
                    const rect = link.getBoundingClientRect();
                    if (rect.bottom < 0 || rect.top > window.innerHeight) {
                        continue;
                    }
                    const href = link.getAttribute('href') || '';
                    const mediaMatch = href.match(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/i);
                    if (mediaMatch && !shortcode) {
                        const candidate = mediaMatch[1];
                        if (!reserved.has(candidate.toLowerCase()) && candidate.length >= 5) {
                            shortcode = candidate;
                        }
                    }
                    const profileMatch = href.match(/^\/([^/?#]+)\/?(?:\?.*)?$/);
                    if (profileMatch && !authorUsername) {
                        const user = profileMatch[1];
                        if (!reserved.has(user.toLowerCase()) && user.length >= 2) {
                            authorUsername = user;
                        }
                    }
                }
            }
            if (!authorUsername) {
                for (const img of Array.from(document.querySelectorAll('main img[alt]'))) {
                    const rect = img.getBoundingClientRect();
                    if (rect.bottom < 0 || rect.top > window.innerHeight) {
                        continue;
                    }
                    const alt = img.getAttribute('alt') || '';
                    const profileMatch = alt.match(/^@?([a-zA-Z0-9._]+)'s profile picture$/i);
                    if (profileMatch) {
                        authorUsername = profileMatch[1];
                        break;
                    }
                }
            }
            const captionCandidates = [];
            for (const span of Array.from(root.querySelectorAll('span[dir="auto"], h1'))) {
                const text = (span.textContent || '').replace(/\s+/g, ' ').trim();
                if (text.length < 8) {
                    continue;
                }
                if (/^(more|less|follow|following|like|comment|share|save)$/i.test(text)) {
                    continue;
                }
                if (authorUsername && text.replace(/^@/, '').toLowerCase() === authorUsername.toLowerCase()) {
                    continue;
                }
                captionCandidates.push(text);
            }
            captionCandidates.sort((a, b) => b.length - a.length);
            return {
                shortcode,
                authorUsername,
                caption: captionCandidates[0] || '',
            };
        }).then(async (result) => {
            if (result?.shortcode) {
                return result;
            }
            const fromUrl = this.parseShortcodeFromHref(this.page.url());
            if (!fromUrl || !result) {
                return result;
            }
            return { ...result, shortcode: fromUrl };
        });
    }
    async waitForReelUrlShortcode(timeoutMs = 4000) {
        try {
            await this.page.waitForURL(/\/(reel|p)\/[A-Za-z0-9_-]{5,}/i, { timeout: timeoutMs });
        }
        catch {
            /* URL may stay on /reels/ — DOM fallback handles that */
        }
        return this.parseShortcodeFromHref(this.page.url());
    }
    async getActiveReelsFeedRoot() {
        const sectionWithVideo = this.page.locator('main section').filter({
            has: this.page.locator('video'),
        });
        if ((await sectionWithVideo.count()) > 0) {
            return sectionWithVideo.first();
        }
        const articleWithVideo = this.page.locator('main article').filter({
            has: this.page.locator('video'),
        });
        if ((await articleWithVideo.count()) > 0) {
            return articleWithVideo.first();
        }
        return this.page.locator('main').first();
    }
    async extractAuthorFromArticle(article) {
        const authorLocators = [
            article.locator('header a[href^="/"]'),
            article.locator('a[href^="/"][role="link"]'),
            article.locator('span a[href^="/"]'),
            article.locator('a[href^="/"]'),
        ];
        for (const locator of authorLocators) {
            const count = await locator.count();
            for (let i = 0; i < Math.min(count, 6); i++) {
                const href = await this.getAttributeSafe(locator.nth(i), 'href', 1500);
                const username = this.parseProfileHref(href);
                if (username) {
                    return username;
                }
            }
        }
        return null;
    }
    getWatchItemDelayMs(config) {
        const { min, max } = config.watchItemSeconds;
        return (min + Math.random() * Math.max(0, max - min)) * 1000;
    }
    feedBrowseLimitsReached(config, state) {
        return (state.itemsScanned >= config.maxItemsToScan ||
            state.commentsPosted >= config.maxCommentsPerRun);
    }
    async openReelsFeed() {
        this.logger.action('Opening Reels feed...');
        this.capturedVideoUrl = undefined;
        this.isCapturingVideo = true;
        await this.page.goto('https://www.instagram.com/reels/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);
        await this.dismissCommonPopups();
        await this.page
            .locator('video')
            .first()
            .waitFor({ state: 'visible', timeout: 20000 })
            .catch(() => { });
        await this.humanBehavior.randomDelay(1500, 3000);
        this.logger.success('Reels feed loaded.');
    }
    async openHomeFeed() {
        this.logger.action('Opening home feed...');
        this.capturedVideoUrl = undefined;
        this.isCapturingVideo = true;
        await this.page.goto('https://www.instagram.com/?hl=en', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);
        await this.dismissCommonPopups();
        await this.page
            .locator('main article')
            .first()
            .waitFor({ state: 'visible', timeout: 20000 })
            .catch(() => { });
        this.logger.success('Home feed loaded.');
    }
    async resolveVisibleReelShortcode() {
        const fromUrl = this.parseShortcodeFromHref(this.page.url());
        if (fromUrl) {
            return fromUrl;
        }
        const fromDom = await this.extractReelsFeedItemFromDom();
        if (fromDom?.shortcode) {
            return fromDom.shortcode;
        }
        const reelLinkSelectors = [
            'main a[href*="/reel/"]',
            'main a[href*="/p/"]',
            'a[href*="/reel/"]',
            'a[href*="/p/"]',
        ];
        for (const selector of reelLinkSelectors) {
            const links = this.page.locator(selector);
            const count = await links.count();
            for (let i = 0; i < Math.min(count, 12); i++) {
                const href = await this.getAttributeSafe(links.nth(i), 'href', 1000);
                const shortcode = this.parseShortcodeFromHref(href);
                if (shortcode) {
                    return shortcode;
                }
            }
        }
        return null;
    }
    async resolveCurrentReelShortcodeOnFeed() {
        await this.waitForReelUrlShortcode(2000);
        const domItem = await this.extractReelsFeedItemFromDom();
        if (domItem?.shortcode) {
            return domItem.shortcode;
        }
        return this.resolveVisibleReelShortcode();
    }
    async buildFeedItemContextFromPostPage(postUrl, shortcode, isReel) {
        this.capturedVideoUrl = undefined;
        const navigateUrl = this.resolveCommentNavigationUrl(postUrl);
        this.logger.action(`Opening ${isReel ? 'reel' : 'post'} ${shortcode} for context...`);
        try {
            await this.page.goto(navigateUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            await this.dismissCommonPopups();
            await this.waitForPostLoaded();
            if (!(await this.hasLoadablePostContent())) {
                this.logger.warn(`Could not load content for ${shortcode}.`);
                return null;
            }
            const authorUsername = await this.extractPostAuthorUsername();
            if (!authorUsername) {
                this.logger.warn(`Reel ${shortcode}: author not found on post page.`);
                return null;
            }
            const postRoot = await this.getPostRootLocator();
            const caption = await this.extractPostCaption(postRoot);
            const { postImageUrl, postVideoUrl } = await this.extractPostMediaFromRoot(postRoot, isReel);
            return {
                authorUsername,
                caption,
                shortcode,
                postUrl,
                postImageUrl,
                postVideoUrl: postVideoUrl ?? this.capturedVideoUrl,
                isReel,
                contentType: isReel ? 'reel' : 'post',
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Failed to open ${shortcode}: ${msg}`);
            return null;
        }
    }
    async returnToReelsFeed() {
        if (this.isReelsFeedUrl()) {
            return;
        }
        await this.page.goto('https://www.instagram.com/reels/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
        await this.dismissCommonPopups();
        await this.page
            .locator('video')
            .first()
            .waitFor({ state: 'visible', timeout: 15000 })
            .catch(() => { });
        await this.humanBehavior.randomDelay(1000, 2000);
    }
    async extractCurrentReelContext() {
        const shortcode = await this.resolveCurrentReelShortcodeOnFeed();
        if (!shortcode) {
            this.logger.info('Reel shortcode not found in URL or DOM.');
            return null;
        }
        const postUrl = `https://www.instagram.com/reel/${shortcode}/`;
        return this.buildFeedItemContextFromPostPage(postUrl, shortcode, true);
    }
    async collectVisibleHomeFeedLinks() {
        const links = await this.page.evaluate(() => {
            const reserved = new Set(['reels', 'reel', 'p', 'explore', 'accounts', 'stories', 'direct']);
            const seen = new Set();
            const results = [];
            const viewportPad = 240;
            const anchors = Array.from(document.querySelectorAll('article a[href*="/p/"], article a[href*="/reel/"], main a[href*="/p/"], main a[href*="/reel/"]'));
            for (const anchor of anchors) {
                const rect = anchor.getBoundingClientRect();
                if (rect.bottom < -viewportPad || rect.top > window.innerHeight + viewportPad) {
                    continue;
                }
                const href = anchor.getAttribute('href') || '';
                const match = href.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/i);
                if (!match) {
                    continue;
                }
                const shortcode = match[2];
                if (reserved.has(shortcode.toLowerCase()) || shortcode.length < 5 || seen.has(shortcode)) {
                    continue;
                }
                seen.add(shortcode);
                results.push({
                    shortcode,
                    postUrl: href.startsWith('http') ? href : `https://www.instagram.com${href}`,
                    isReel: match[1].toLowerCase() === 'reel',
                });
            }
            return results;
        });
        return links;
    }
    async extractCaptionFromArticle(article) {
        const spans = article.locator('span[dir="auto"]');
        const count = await spans.count();
        const candidates = [];
        for (let i = 0; i < Math.min(count, 15); i++) {
            const text = (await spans.nth(i).textContent())?.replace(/\s+/g, ' ').trim() ?? '';
            if (text.length < 8)
                continue;
            if (/^(more|less|follow|following|like|comment|share|save)$/i.test(text))
                continue;
            if (this.looksLikeUsernameOnly(text) && text.length < 18)
                continue;
            candidates.push(text);
        }
        if (candidates.length === 0) {
            return '';
        }
        const unique = [...new Set(candidates)];
        unique.sort((a, b) => b.length - a.length);
        return unique[0];
    }
    async extractHomeFeedItemContext(article) {
        try {
            const postLink = article.locator('a[href*="/p/"], a[href*="/reel/"]').first();
            if ((await postLink.count()) === 0) {
                return null;
            }
            const href = await this.getAttributeSafe(postLink, 'href', 2000);
            if (!href) {
                return null;
            }
            const postUrl = this.normalizePostUrl(href);
            const shortcode = this.parseShortcodeFromHref(postUrl);
            if (!shortcode) {
                return null;
            }
            const authorUsername = await this.extractAuthorFromArticle(article);
            if (!authorUsername) {
                return null;
            }
            const isReel = /\/reel\//i.test(postUrl);
            const caption = await this.extractCaptionFromArticle(article);
            let postImageUrl;
            const image = article.locator('img[src*="cdninstagram"], img[src*="instagram"]').first();
            const src = await this.getAttributeSafe(image, 'src', 1500);
            if (src && !src.includes('static') && !src.includes('sprite')) {
                postImageUrl = src;
            }
            return {
                authorUsername,
                caption,
                shortcode,
                postUrl,
                postImageUrl,
                isReel,
                contentType: isReel ? 'reel' : 'post',
            };
        }
        catch {
            return null;
        }
    }
    async processFeedItem(context, config, aiPromptHint) {
        if (this.commentHistory.hasCommented(this.config.username, context.shortcode)) {
            this.logger.warn(`Already commented on ${context.shortcode}. Skipping.`);
            return 'SKIPPED';
        }
        const hasContext = (0, genai_1.hasActionablePostContext)(context.caption, context.postImageUrl, context.postVideoUrl, this.aiGenerator.supportsVideoAnalysis(), context.isReel || Boolean(context.postVideoUrl));
        if (!hasContext) {
            this.logger.info(`Skipping ${context.shortcode} — not enough caption/media context.`);
            return 'SKIPPED';
        }
        if (!this.channelSkillsContext?.trim()) {
            this.logger.warn('No skills/style guide configured — skipping feed item.');
            return 'SKIPPED';
        }
        this.logger.action('Assessing skills relevance...');
        const assessment = await this.aiGenerator.assessSkillsRelevance(context.caption, this.channelSkillsContext, {
            imageUrl: context.postImageUrl,
            videoUrl: context.postVideoUrl,
            authorUsername: context.authorUsername,
        });
        this.logger.info(`Relevance score ${assessment.score.toFixed(2)} — ${assessment.reason}`);
        if (!(0, genai_1.isSkillsRelevanceMatch)(assessment, config.minRelevanceScore)) {
            this.logger.info(`Skipping @${context.authorUsername} ${context.shortcode} — below relevance threshold (${config.minRelevanceScore}).`);
            return 'SKIPPED';
        }
        const postRoot = await this.getPostRootLocator();
        const finalComment = await this.buildCommentForPost(context.authorUsername, aiPromptHint, context.caption, context.postImageUrl, context.postVideoUrl, context.isReel);
        return this.submitTopLevelComment(postRoot, finalComment, context.shortcode, context.isReel);
    }
    async scrollToNextReel(previousShortcode) {
        const before = previousShortcode ?? (await this.resolveVisibleReelShortcode());
        const videoUrlBefore = this.capturedVideoUrl;
        this.capturedVideoUrl = undefined;
        const video = this.page.locator('main video').first();
        if ((await video.count()) > 0) {
            await video.hover({ timeout: 3000 }).catch(() => { });
        }
        await this.page.keyboard.press('ArrowDown');
        await this.humanBehavior.randomDelay(800, 1500);
        if ((await video.count()) > 0) {
            await this.page.mouse.wheel(0, 900);
            await this.humanBehavior.randomDelay(800, 1500);
        }
        const deadline = Date.now() + 12000;
        while (Date.now() < deadline) {
            const now = await this.resolveVisibleReelShortcode();
            if (now && now !== before) {
                return true;
            }
            if (this.capturedVideoUrl &&
                this.capturedVideoUrl !== videoUrlBefore) {
                return true;
            }
            await this.humanBehavior.randomDelay(400, 800);
        }
        return false;
    }
    async closePostDialogIfOpen() {
        const dialog = this.page.locator('div[role="dialog"]');
        if ((await dialog.count()) > 0 && (await dialog.first().isVisible().catch(() => false))) {
            await this.page.keyboard.press('Escape');
            await this.humanBehavior.randomDelay(500, 1200);
        }
    }
    async openHomeFeedPost(context) {
        this.capturedVideoUrl = undefined;
        const navigateUrl = this.resolveCommentNavigationUrl(context.postUrl);
        this.logger.action(`Opening feed post ${navigateUrl}...`);
        try {
            await this.page.goto(navigateUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
            await this.dismissCommonPopups();
            await this.waitForPostLoaded();
            if (!(await this.hasLoadablePostContent())) {
                return false;
            }
            return true;
        }
        catch {
            return false;
        }
    }
    async runFeedBrowseReels(config, aiPromptHint, callbacks, state) {
        await this.openReelsFeed();
        const seenShortcodes = new Set();
        let stagnantScrolls = 0;
        let lastShortcode = null;
        while (!this.feedBrowseLimitsReached(config, state) && !callbacks.shouldStop?.()) {
            await this.humanBehavior.randomDelay(config.watchItemSeconds.min * 1000, config.watchItemSeconds.max * 1000);
            const shortcode = await this.resolveCurrentReelShortcodeOnFeed();
            if (!shortcode) {
                stagnantScrolls++;
                this.logger.warn('Could not read current reel shortcode.');
                if (stagnantScrolls >= 4) {
                    this.logger.warn('Reels feed scroll stalled — stopping reels browse.');
                    break;
                }
                const advanced = await this.scrollToNextReel(lastShortcode);
                if (!advanced)
                    stagnantScrolls++;
                continue;
            }
            if (seenShortcodes.has(shortcode) && shortcode === lastShortcode) {
                stagnantScrolls++;
                if (stagnantScrolls >= 4) {
                    this.logger.warn('Reels feed stopped advancing — ending reels browse.');
                    break;
                }
                await this.scrollToNextReel(shortcode);
                continue;
            }
            const postUrl = `https://www.instagram.com/reel/${shortcode}/`;
            const context = await this.buildFeedItemContextFromPostPage(postUrl, shortcode, true);
            if (!context) {
                stagnantScrolls++;
                this.logger.warn(`Could not load reel page for ${shortcode}.`);
                if (stagnantScrolls >= 4) {
                    this.logger.warn('Reels feed scroll stalled — stopping reels browse.');
                    break;
                }
                await this.returnToReelsFeed();
                await this.scrollToNextReel(shortcode);
                continue;
            }
            stagnantScrolls = 0;
            seenShortcodes.add(shortcode);
            lastShortcode = shortcode;
            state.itemsScanned++;
            this.logger.header(`Reels item ${state.itemsScanned}/${config.maxItemsToScan}: @${context.authorUsername} (${context.shortcode})`);
            const result = await this.processFeedItem(context, config, aiPromptHint);
            callbacks.onItemComplete?.(context, result);
            if (result === 'SUCCESS') {
                state.commentsPosted++;
                const waitMs = this.getRandomActionDelayMs();
                this.logger.info(`Waiting ~${Math.round(waitMs / 1000)}s before next reel...`);
                await this.humanBehavior.randomDelay(waitMs, waitMs + 500);
            }
            await this.returnToReelsFeed();
            if (this.feedBrowseLimitsReached(config, state) || callbacks.shouldStop?.()) {
                break;
            }
            const advanced = await this.scrollToNextReel(context.shortcode);
            if (!advanced) {
                stagnantScrolls++;
                if (stagnantScrolls >= 4)
                    break;
            }
        }
    }
    async runFeedBrowseHome(config, aiPromptHint, callbacks, state) {
        await this.openHomeFeed();
        const seenShortcodes = new Set();
        let stagnantScrolls = 0;
        while (!this.feedBrowseLimitsReached(config, state) && !callbacks.shouldStop?.()) {
            const visibleLinks = await this.collectVisibleHomeFeedLinks();
            if (visibleLinks.length === 0) {
                this.logger.info('No home feed posts visible in viewport — scrolling...');
            }
            let processedThisPass = false;
            for (const link of visibleLinks) {
                if (this.feedBrowseLimitsReached(config, state) || callbacks.shouldStop?.()) {
                    break;
                }
                if (seenShortcodes.has(link.shortcode)) {
                    continue;
                }
                try {
                    seenShortcodes.add(link.shortcode);
                    state.itemsScanned++;
                    processedThisPass = true;
                    stagnantScrolls = 0;
                    const postUrl = this.normalizePostUrl(link.postUrl);
                    const context = await this.buildFeedItemContextFromPostPage(postUrl, link.shortcode, link.isReel);
                    if (!context) {
                        state.itemsScanned = Math.max(0, state.itemsScanned - 1);
                        seenShortcodes.delete(link.shortcode);
                        continue;
                    }
                    this.logger.header(`Home item ${state.itemsScanned}/${config.maxItemsToScan}: @${context.authorUsername} (${context.shortcode})`);
                    await this.humanBehavior.randomDelay(config.watchItemSeconds.min * 1000, config.watchItemSeconds.max * 1000);
                    const result = await this.processFeedItem(context, config, aiPromptHint);
                    callbacks.onItemComplete?.(context, result);
                    if (result === 'SUCCESS') {
                        state.commentsPosted++;
                        const waitMs = this.getRandomActionDelayMs();
                        this.logger.info(`Waiting ~${Math.round(waitMs / 1000)}s before next feed post...`);
                        await this.humanBehavior.randomDelay(waitMs, waitMs + 500);
                    }
                    await this.page.goto('https://www.instagram.com/?hl=en', {
                        waitUntil: 'domcontentloaded',
                    });
                    await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);
                    await this.dismissCommonPopups();
                    if (this.feedBrowseLimitsReached(config, state)) {
                        break;
                    }
                }
                catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    this.logger.warn(`Home feed post ${link.shortcode} skipped: ${msg}`);
                    continue;
                }
            }
            if (this.feedBrowseLimitsReached(config, state) || callbacks.shouldStop?.()) {
                break;
            }
            if (!processedThisPass) {
                stagnantScrolls++;
                if (stagnantScrolls >= 4) {
                    this.logger.warn('Home feed scroll stalled — ending home browse.');
                    break;
                }
            }
            await this.page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9));
            await this.humanBehavior.randomDelay(1000, 2200);
        }
    }
}
exports.InstagramBot = InstagramBot;
InstagramBot.COMMENT_INPUT_SELECTORS = 'textarea[aria-label*="comment" i], textarea[placeholder*="comment" i], ' +
    '[contenteditable="true"][aria-label*="comment" i], div[role="textbox"][aria-label*="comment" i]';
InstagramBot.RESERVED_PROFILE_SEGMENTS = new Set([
    'p',
    'reel',
    'reels',
    'explore',
    'accounts',
    'stories',
    'direct',
    'tags',
    'legal',
    'about',
    'developer',
]);
