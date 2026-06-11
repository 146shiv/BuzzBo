import { Page, BrowserContext, Locator } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { AccountConfig, SettingsConfig, BehaviorConfig, HashtagSearchConfig } from './config';
import { HumanBehavior, PauseState } from './humanBehavior';
import { Logger } from './logger';
import { AICommentGenerator } from './genai';

export type InteractionResult = 'SUCCESS' | 'SKIPPED' | 'FAILED';

export interface HashtagPostCandidate {
    url: string;
    shortcode: string;
    likes: number;
    comments: number;
    engagementScore: number;
    contentType: 'post' | 'reel';
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
    private readonly aiGenerator: AICommentGenerator;
    private capturedVideoUrl: string | undefined = undefined;
    private isCapturingVideo: boolean = false;
    private readonly logsDir: string;

    constructor(
        accountConfig: AccountConfig,
        globalSettings: SettingsConfig,
        pauseState: PauseState,
        logger: Logger,
        aiGenerator: AICommentGenerator
    ) {
        this.config = accountConfig;
        this.behavior = globalSettings.behavior;
        this.cookiePath = path.join(__dirname, '..', 'data', 'cookies', `${this.config.username}.json`);
        this.globalLogPath = path.join(__dirname, '..', 'data', 'logs', 'interaction_log.csv');
        this.logsDir = path.join(__dirname, '..', 'data', 'logs');
        this.pauseState = pauseState;
        this.developerMode = globalSettings.developerMode;
        this.logger = logger;
        this.aiGenerator = aiGenerator;

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
    }

    private async logInteraction(targetUsername: string, actionType: 'comment', comment: string) {
        const timestamp = new Date().toISOString();
        const sanitizedComment = `"${comment.replace(/"/g, '""')}"`;
        const logEntry = `${timestamp},${this.config.username},${targetUsername},${actionType},${sanitizedComment}\n`;

        if (actionType === 'comment') {
            this.logger.incrementComments();
        }

        try {
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

    private async waitForPostLoaded(): Promise<void> {
        const dialog = this.page.locator('div[role="dialog"]');
        const article = this.page.locator('article');

        await Promise.race([
            dialog.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
            article.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
        ]);

        await this.page
            .locator('textarea[aria-label*="Add a comment"]')
            .first()
            .waitFor({ state: 'visible', timeout: 15000 })
            .catch(() => {});
    }

    private async extractPostAuthorUsername(): Promise<string | null> {
        try {
            const postRoot = await this.getPostRootLocator();
            const authorLink = postRoot.locator('header a[href^="/"]').first();
            if ((await authorLink.count()) === 0) return null;

            const href = await authorLink.getAttribute('href');
            if (!href) return null;

            const match = href.match(/^\/([^/?#]+)\/?$/);
            if (!match || match[1] === 'p' || match[1] === 'reel') return null;

            return match[1];
        } catch (e) {
            return null;
        }
    }

    private async commentOnOpenPost(
        targetUsername: string,
        aiPromptHint: string | undefined,
        logIdentifier: string
    ): Promise<InteractionResult> {
        const postRoot = await this.getPostRootLocator();
        this.logger.success('Post content loaded.');

        this.logger.action('Extracting post caption...');
        const captionLocator = postRoot.locator('h1').first();
        let postCaption = '';
        try {
            if (await captionLocator.isVisible({ timeout: 2000 })) {
                postCaption = (await captionLocator.textContent()) || '';
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
            const videoErrorMessage = postRoot.getByText("Sorry, we're having trouble playing this video");
            const videoElement = postRoot.locator('video');

            if ((await videoErrorMessage.count()) > 0 || (await videoElement.count()) > 0) {
                this.logger.info('Detected video post');

                if (this.capturedVideoUrl) {
                    postVideoUrl = this.capturedVideoUrl;
                    this.logger.info(`Using captured video URL: ${this.capturedVideoUrl}`);
                } else {
                    this.logger.warn('Video post detected but no video URL was captured from network requests');
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

        this.logger.action('Generating AI comment...');
        const aiComment = await this.aiGenerator.generateInstagramComment(
            postCaption,
            targetUsername,
            aiPromptHint,
            postImageUrl,
            postVideoUrl
        );
        this.logger.success(`AI Generated Comment: "${aiComment}"`);

        const commentTextarea = postRoot.locator('textarea[aria-label*="Add a comment"]');
        if ((await commentTextarea.count()) === 0) {
            this.logger.warn('Comments might be disabled for this post. Cannot find comment area.');
            await this.page.screenshot({
                path: path.join(this.logsDir, `no_comment_area_error_${this.config.username}_${logIdentifier}.png`),
            });
            return 'SKIPPED';
        }

        await this.humanBehavior.jitteryMovement(commentTextarea.first());
        await this.humanBehavior.randomDelay(1000, 3000);

        this.logger.action('Typing comment...');
        await this.humanBehavior.naturalTyping(commentTextarea.first(), aiComment);
        await this.humanBehavior.randomDelay(1500, 4000);

        const postButton = postRoot.locator('form').getByRole('button', { name: 'Post' });

        if ((await postButton.count()) === 0 || !(await postButton.isEnabled())) {
            this.logger.error('Could not find an enabled "Post" button.');
            await this.page.screenshot({
                path: path.join(this.logsDir, `no_post_button_error_${this.config.username}_${logIdentifier}.png`),
            });
            return 'FAILED';
        }

        this.logger.action('Submitting the comment...');
        await this.humanBehavior.hesitateAndClick(postButton);
        await this.humanBehavior.randomDelay(4000, 7000);

        const ourComment = postRoot.getByText(aiComment);
        if ((await ourComment.count()) > 0) {
            this.logger.success(`Successfully commented on post (${logIdentifier}).`);
        } else {
            this.logger.warn('Could not verify if comment was posted successfully.');
        }

        await this.logInteraction(logIdentifier, 'comment', aiComment);
        return 'SUCCESS';
    }

    public async runCommentTaskOnUrl(postUrl: string, aiPromptHint?: string): Promise<InteractionResult> {
        const urlMatch = postUrl.match(/instagram\.com\/(p|reel)\/([^/?#]+)/i);
        const postShortcode = urlMatch ? urlMatch[2] : postUrl;

        this.logger.header(`----- Starting Comment Task for ${postUrl} -----`);

        try {
            this.capturedVideoUrl = undefined;
            this.isCapturingVideo = true;

            this.logger.action(`Navigating to post URL...`);
            await this.page.goto(postUrl, { waitUntil: 'domcontentloaded' });
            await this.humanBehavior.randomizedWait(this.behavior.navigationWaitMs);

            if ((await this.page.getByText("Sorry, this page isn't available.").count()) > 0) {
                this.logger.warn('Post is unavailable or private. Skipping.');
                return 'SKIPPED';
            }

            await this.waitForPostLoaded();
            const authorUsername = (await this.extractPostAuthorUsername()) ?? postShortcode;

            return await this.commentOnOpenPost(authorUsername, aiPromptHint, postShortcode);
        } catch (error: any) {
            this.logger.error(`An error occurred during comment task for ${postUrl}: ${error.message}`);
            await this.page.screenshot({
                path: path.join(this.logsDir, `comment_task_error_${this.config.username}_${postShortcode}.png`),
            });
            return 'FAILED';
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
        const match = url.match(/instagram\.com\/(p|reel)\/([^/?#]+)/i);
        return match ? match[2] : null;
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

    public async discoverHashtagPostUrls(hashtag: string, searchConfig: HashtagSearchConfig): Promise<string[]> {
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
        searchConfig: HashtagSearchConfig,
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

            const engagementScore =
                likes * searchConfig.likeWeight + comments * searchConfig.commentWeight;
            const contentType: 'post' | 'reel' = url.includes('/reel/') ? 'reel' : 'post';

            candidates.push({
                url,
                shortcode,
                likes,
                comments,
                engagementScore,
                contentType,
            });

            await this.humanBehavior.randomDelay(500, 1200);
        }

        candidates.sort((a, b) => {
            if (b.engagementScore !== a.engagementScore) return b.engagementScore - a.engagementScore;
            if (b.likes !== a.likes) return b.likes - a.likes;
            return b.comments - a.comments;
        });

        const topCandidates = candidates.slice(0, searchConfig.maxPostsToComment);

        if (topCandidates.length > 0) {
            this.logger.header(`Ranked posts for #${hashtag.replace(/^#/, '')}:`);
            topCandidates.forEach((candidate, index) => {
                this.logger.info(
                    `${index + 1}. ${candidate.url} | likes: ${candidate.likes} | comments: ${candidate.comments} | score: ${candidate.engagementScore}`
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

            await this.page.waitForSelector('div[role="dialog"]', { state: 'visible', timeout: 15000 });
            this.logger.success('Post opened in a dialog.');
            await this.humanBehavior.randomizedWait(this.behavior.shortWaitMs);

            return await this.commentOnOpenPost(targetUsername, aiPromptHint, targetUsername);
        } catch (error: any) {
            this.logger.error(`An error occurred during comment task for @${targetUsername}: ${error.message}`);
            await this.page.screenshot({ path: path.join(this.logsDir, `comment_task_error_${this.config.username}_${targetUsername}.png`) });
            return 'FAILED';
        } finally {
            this.isCapturingVideo = false;
        }
    }
}