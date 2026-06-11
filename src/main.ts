import { chromium, Browser, Page, BrowserContext, Locator } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { InstagramBot, InteractionResult } from './bot';
import {
    config,
    AccountConfig,
    normalizeAccount,
    resolveAccountSettings,
    validateEnabledAccounts,
    PostSourceMode,
} from './config';
import { generateFingerprint, Fingerprint } from './fingerprint';
import { Logger } from './logger';
import { AICommentGenerator } from './genai';
import { CommentHistoryStore } from './commentHistory';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const globalLogger = new Logger('SYSTEM');
const pauseState = { shouldPause: false };

const baseDir = path.join(__dirname, '..');
const dataDir = path.join(baseDir, 'data');
const cookiesDir = path.join(dataDir, 'cookies');
const logsDir = path.join(dataDir, 'logs');
const fingerprintsDir = path.join(dataDir, 'fingerprints');
const globalLogPath = path.join(logsDir, 'interaction_log.csv');
const commentHistoryPath = path.join(dataDir, 'comment_history.db');
const profileStatsPath = path.join(logsDir, 'profile_stats.csv');

const CSV_HEADER = 'username,post_count,follower_count\n';

interface ProfileStats {
    postCount: number;
    followerCount: number;
}

function loadProfileStatsFromCsv(): { [username: string]: ProfileStats } {
    if (!fs.existsSync(profileStatsPath)) {
        globalLogger.info('No existing profile stats file found. Will create a new one.');
        fs.writeFileSync(profileStatsPath, CSV_HEADER, 'utf-8');
        return {};
    }

    try {
        const fileContent = fs.readFileSync(profileStatsPath, 'utf-8');
        const lines = fileContent.split('\n').slice(1);
        const stats: { [username: string]: ProfileStats } = {};

        for (const line of lines) {
            if (line.trim() === '') continue;
            const [username, postCountStr, followerCountStr] = line.split(',');
            if (username && postCountStr && followerCountStr) {
                stats[username] = {
                    postCount: parseInt(postCountStr, 10),
                    followerCount: parseInt(followerCountStr, 10),
                };
            }
        }
        globalLogger.info(`Loaded existing profile stats from ${profileStatsPath}`);
        return stats;
    } catch (e: any) {
        globalLogger.error(`Could not read or parse ${profileStatsPath}. Starting fresh. Error: ${e.message}`);
        fs.writeFileSync(profileStatsPath, CSV_HEADER, 'utf-8');
        return {};
    }
}

async function updateProfileStatsInCsv(username: string, newPostCount: number, newFollowerCount: number) {
    try {
        const fileContent = await fs.promises.readFile(profileStatsPath, 'utf-8');
        let lines = fileContent.split('\n');
        let userFound = false;
        const newEntry = `${username},${newPostCount},${newFollowerCount}`;

        for (let i = 1; i < lines.length; i++) {
            if (lines[i].startsWith(`${username},`)) {
                lines[i] = newEntry;
                userFound = true;
                break;
            }
        }

        if (!userFound) {
            lines.push(newEntry);
        }

        const updatedContent = lines.filter(line => line.trim() !== '').join('\n') + '\n';
        await fs.promises.writeFile(profileStatsPath, updatedContent, 'utf-8');
    } catch (error: any) {
        globalLogger.error(`Failed to update profile stats for @${username} in CSV: ${error.message}`);
    }
}

const parseFollowerCount = (text: string): number | null => {
    if (!text) return null;
    const cleanedText = text.toLowerCase().trim().replace(/,/g, '');
    const num = parseFloat(cleanedText);
    if (isNaN(num)) return null;

    if (cleanedText.includes('k')) {
        return Math.round(num * 1000);
    }
    if (cleanedText.includes('m')) {
        return Math.round(num * 1000000);
    }
    return num;
};

async function getProfileStats(page: Page, username: string, logger: Logger): Promise<ProfileStats | null> {
    try {
        logger.debug(`Navigating to @${username} to check profile stats...`);
        await page.goto(`https://www.instagram.com/${username}/?hl=en`);
        await page.locator('main').waitFor({ timeout: 15000 });

        if ((await page.locator('h2:text-is("Sorry, this page isn\'t available.")').count()) > 0) {
            logger.warn(`Profile @${username} not found or is unavailable.`);
            return null;
        }

        if ((await page.locator('h2:text-is("This Account is Private")').count()) > 0) {
            logger.warn(`Profile @${username} is private. Cannot get stats.`);
            return null;
        }

        const statsList = page.locator('header ul')
            .filter({ has: page.locator('li', { hasText: /posts?/i }) })
            .filter({ has: page.locator('li', { hasText: /followers?/i }) });

        await statsList.waitFor({ state: 'visible', timeout: 10000 });

        const postLi = statsList.locator('li').filter({ hasText: /posts?/i }).first();
        const postText = await postLi.textContent();
        if (!postText) {
            logger.warn(`Could not find post count text for @${username}.`);
            await page.screenshot({ path: path.join(logsDir, `stats_error_${username}.png`) });
            return null;
        }
        const postCount = parseInt(postText.replace(/,/g, '').split(' ')[0], 10);
        if (isNaN(postCount)) {
            logger.warn(`Could not parse post count from text: "${postText}"`);
            return null;
        }

        const followerLi = statsList.locator('li').filter({ hasText: /followers?/i }).first();
        let followerCount: number | null = null;

        const spanWithTitle = followerLi.locator('span[title]');
        if (await spanWithTitle.count() > 0) {
            const title = await spanWithTitle.getAttribute('title');
            if (title) {
                const parsed = parseInt(title.replace(/,/g, ''), 10);
                if (!isNaN(parsed)) followerCount = parsed;
            }
        }

        if (followerCount === null) {
            const followerText = await followerLi.textContent();
            if (followerText) {
                const numberPart = followerText.replace(/,/g, '').split(' ')[0];
                followerCount = parseFollowerCount(numberPart);
            }
        }

        if (followerCount === null) {
            logger.warn(`Could not find or parse follower count for @${username}.`);
            await page.screenshot({ path: path.join(logsDir, `stats_error_${username}.png`) });
            return null;
        }

        logger.debug(`Found stats for @${username}: Posts - ${postCount}, Followers - ${followerCount}`);
        return { postCount, followerCount };

    } catch (error: any) {
        logger.error(`Error getting profile stats for @${username}: ${error.message}`);
        await page.screenshot({ path: path.join(logsDir, `stats_error_${username}.png`) });
        return null;
    }
}

function getSessionInitOptions(
    account: AccountConfig,
    overrides: { headless?: boolean; waitForLoginConfirm?: () => Promise<void> } = {}
): { headless: boolean; manualLogin: boolean; waitForLoginConfirm?: () => Promise<void> } {
    const normalized = normalizeAccount(account);
    const isManual = normalized.loginMethod === 'manual';
    return {
        headless: overrides.headless ?? (isManual ? false : config.settings.headless),
        manualLogin: isManual,
        waitForLoginConfirm: isManual
            ? (overrides.waitForLoginConfirm ??
              (() =>
                  waitForEnter(
                      '>>> Log in manually in the browser, then press [ENTER] here to continue. <<<'
                  )))
            : undefined,
    };
}

async function initializeBotSession(
    accountToUse: AccountConfig,
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryStore,
    logger: Logger,
    accountSkillsCache: Map<string, string | undefined>,
    options: { headless?: boolean; forceManualLogin?: boolean; waitForLoginConfirm?: () => Promise<void> } = {}
): Promise<{ browser: Browser; bot: InstagramBot } | null> {
    const cookiePath = path.join(cookiesDir, `${accountToUse.username}.json`);
    const fingerprintPath = path.join(fingerprintsDir, `${accountToUse.username}.json`);

    let fingerprint: Fingerprint;
    if (fs.existsSync(fingerprintPath)) {
        logger.info(`Loading fingerprint for ${accountToUse.username}`);
        fingerprint = JSON.parse(fs.readFileSync(fingerprintPath, 'utf-8'));
    } else {
        logger.info(`Generating new fingerprint for ${accountToUse.username}`);
        fingerprint = generateFingerprint();
        fs.writeFileSync(fingerprintPath, JSON.stringify(fingerprint, null, 2));
    }

    const sessionOptions = getSessionInitOptions(accountToUse, options);
    const headless = options.headless ?? sessionOptions.headless;
    const useManualLogin = options.forceManualLogin ?? sessionOptions.manualLogin;
    const browser: Browser = await chromium.launch({ headless });

    try {
        const context = await browser.newContext({
            storageState: fs.existsSync(cookiePath) ? cookiePath : undefined,
            userAgent: fingerprint.userAgent,
            viewport: fingerprint.viewport,
            deviceScaleFactor: fingerprint.deviceScaleFactor,
            locale: fingerprint.locale,
            timezoneId: fingerprint.timezoneId,
            colorScheme: fingerprint.colorScheme,
            reducedMotion: fingerprint.reducedMotion,
            hasTouch: false,
            isMobile: false,
            javaScriptEnabled: true,
            geolocation: undefined,
            permissions: [],
        });

        await context.addInitScript(
            (args: any) => {
                Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => args.hardwareConcurrency });
                Object.defineProperty(navigator, 'deviceMemory', { get: () => args.deviceMemory });
                try {
                    if (WebGLRenderingContext) {
                        const getParameter = WebGLRenderingContext.prototype.getParameter;
                        WebGLRenderingContext.prototype.getParameter = function (parameter) {
                            if (parameter === 37445) return args.webgl.vendor;
                            if (parameter === 37446) return args.webgl.renderer;
                            return getParameter.apply(this, arguments as any);
                        };
                    }
                    if (WebGL2RenderingContext) {
                        const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
                        WebGL2RenderingContext.prototype.getParameter = function (parameter) {
                            if (parameter === 37445) return args.webgl.vendor;
                            if (parameter === 37446) return args.webgl.renderer;
                            return getParameter2.apply(this, arguments as any);
                        };
                    }
                } catch (e) { console.error('Failed to spoof WebGL', e); }
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            },
            {
                hardwareConcurrency: fingerprint.hardwareConcurrency,
                deviceMemory: fingerprint.deviceMemory,
                webgl: fingerprint.webgl,
            }
        );

        const channelSkillsContext = accountSkillsCache.get(accountToUse.username);
        const bot = new InstagramBot(
            accountToUse,
            config.settings,
            pauseState,
            logger,
            aiGenerator,
            commentHistory,
            channelSkillsContext
        );
        if (useManualLogin) {
            const waitForLogin = options.waitForLoginConfirm ?? sessionOptions.waitForLoginConfirm ?? waitForEnter;
            await bot.initWithManualLogin(context, waitForLogin);
        } else {
            await bot.init(context);
        }
        logger.success(`Bot session initialized for @${accountToUse.username}.`);
        return { browser, bot };
    } catch (error: any) {
        logger.error(`Bot initialization for ${accountToUse.username} failed: ${error.message}`);
        await browser.close();
        return null;
    }
}

async function launchBotForTask(
    accountToUse: AccountConfig,
    targetUsername: string,
    aiPromptHint: string | undefined,
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryStore,
    accountSkillsCache: Map<string, string | undefined>
): Promise<InteractionResult | 'LAUNCH_ERROR'> {
    const botLogger = new Logger(accountToUse.username);
    const session = await initializeBotSession(
        accountToUse,
        aiGenerator,
        commentHistory,
        botLogger,
        accountSkillsCache,
        { headless: config.settings.headless }
    );

    if (!session) {
        return 'LAUNCH_ERROR';
    }

    const { browser, bot } = session;
    try {
        const result = await bot.runCommentTask(targetUsername, aiPromptHint);
        botLogger.success(`Task for @${targetUsername} completed with status: ${result}.`);
        return result;
    } catch (error: any) {
        botLogger.error(`An unexpected error occurred during the bot task: ${error.message}`);
        return 'FAILED';
    } finally {
        await browser.close();
        globalLogger.info(`Browser closed for ${accountToUse.username}.`);
    }
}

async function runTestCommentMode(
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryStore,
    accountSkillsCache: Map<string, string | undefined>
) {
    globalLogger.header('----- RUNNING IN TEST COMMENT MODE -----');

    const testUsername = process.argv[3];
    let accountToUse: AccountConfig | undefined;

    if (testUsername) {
        globalLogger.info(`Attempting to run test for specified account: @${testUsername}`);
        accountToUse = config.accounts.find(acc => acc.username === testUsername);

        if (!accountToUse) {
            globalLogger.error(`Account with username "@${testUsername}" not found in config.ts.`);
            return;
        }
        if (!accountToUse.enabled) {
            globalLogger.error(`Account "@${testUsername}" is disabled in config.ts. Cannot run test.`);
            return;
        }
    } else {
        globalLogger.info('No specific account provided. Using the first enabled account found in config.');
        accountToUse = config.accounts.find(acc => acc.enabled);
    }

    if (!accountToUse) {
        globalLogger.error('No enabled accounts found in config.ts. Cannot run test mode.');
        return;
    }

    const normalized = normalizeAccount(accountToUse);
    globalLogger.info(`Using account: @${accountToUse.username} | sourceMode: ${normalized.sourceMode}`);

    switch (normalized.sourceMode) {
        case 'new_post_added_to_account': {
            if (!accountToUse.targets || accountToUse.targets.length === 0) {
                globalLogger.error(`Account @${accountToUse.username} has no targets defined.`);
                return;
            }
            const targetUsername = accountToUse.targets[0];
            globalLogger.info(`Targeting user: @${targetUsername}`);
            globalLogger.info('An AI comment will be generated based on the latest post.');
            await launchBotForTask(
                accountToUse,
                targetUsername,
                accountToUse.aiPromptHint,
                aiGenerator,
                commentHistory,
                accountSkillsCache
            );
            break;
        }
        case 'url_list':
            await runUrlListForAccount(accountToUse, aiGenerator, commentHistory, accountSkillsCache);
            break;
        case 'hashtag_list': {
            await runHashtagScanForAccount(
                accountToUse,
                aiGenerator,
                commentHistory,
                accountSkillsCache
            );
            break;
        }
        default:
            globalLogger.error(`Unknown sourceMode for @${accountToUse.username}.`);
    }

    globalLogger.header('----- TEST COMMENT MODE COMPLETE -----');
}

function waitForEnter(message?: string) {
    globalLogger.info(
        chalk.yellowBright(message ?? '>>> Press [ENTER] in the terminal to proceed, or CTRL+C to exit. <<<')
    );
    return new Promise<void>(resolve => {
        const onKeyPress = (str: string, key: any) => {
            if (key && key.name === 'return') {
                process.stdin.removeListener('keypress', onKeyPress);
                resolve();
            }
        };
        process.stdin.on('keypress', onKeyPress);
    });
}

function waitForEnterCheckAccounts() {
    return waitForEnter('>>> Press [ENTER] in the terminal to proceed to the next account, or CTRL+C to exit. <<<');
}

function isValidInstagramPostUrl(url: string): boolean {
    return /instagram\.com\/(p|reel)\/[^/?#\s]+/i.test(url);
}

function normalizePostUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized.startsWith('http')) {
        normalized = `https://${normalized}`;
    }
    return normalized.split('?')[0].replace(/\/$/, '') + '/';
}

function loadCommentGenerationSkills(relativeOrAbsolutePath: string): string | undefined {
    const filePath = path.isAbsolute(relativeOrAbsolutePath)
        ? relativeOrAbsolutePath
        : path.join(baseDir, relativeOrAbsolutePath);

    if (!fs.existsSync(filePath)) {
        return undefined;
    }

    const content = fs.readFileSync(filePath, 'utf-8').trim();
    return content.length > 0 ? content : undefined;
}

function buildAccountSkillsCache(): Map<string, string | undefined> {
    const cache = new Map<string, string | undefined>();
    const skillsByPath = new Map<string, string | undefined>();

    const resolveSkillsForPath = (filePath: string): string | undefined => {
        if (!skillsByPath.has(filePath)) {
            skillsByPath.set(filePath, loadCommentGenerationSkills(filePath));
        }
        return skillsByPath.get(filePath);
    };

    for (const account of config.accounts) {
        const skillsPath = resolveAccountSettings(account).skillsFile;
        if (skillsPath) {
            cache.set(account.username, resolveSkillsForPath(skillsPath));
        }
    }

    return cache;
}

function getEnabledAccountsBySourceMode(sourceMode: PostSourceMode): AccountConfig[] {
    return config.accounts.filter(acc => acc.enabled && normalizeAccount(acc).sourceMode === sourceMode);
}

function findEnabledAccount(username?: string): AccountConfig | undefined {
    if (username) {
        const account = config.accounts.find(acc => acc.username === username);
        if (!account?.enabled) return undefined;
        return account;
    }
    return config.accounts.find(acc => acc.enabled);
}

interface UrlListResult {
    success: number;
    skipped: number;
    failed: number;
}

async function runUrlListForAccount(
    account: AccountConfig,
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryStore,
    accountSkillsCache: Map<string, string | undefined>,
    urlsFileOverride?: string
): Promise<UrlListResult> {
    const resolved = resolveAccountSettings(account);
    const urlsFilePath = urlsFileOverride ?? resolved.postUrlsFile;
    const result: UrlListResult = { success: 0, skipped: 0, failed: 0 };

    if (!urlsFilePath) {
        globalLogger.error(`@${account.username}: postUrlsFile is not configured.`);
        return result;
    }

    let postUrls: string[];
    try {
        postUrls = loadPostUrlsFromFile(urlsFilePath);
    } catch (error: any) {
        globalLogger.error(`@${account.username}: ${error.message}`);
        return result;
    }

    if (postUrls.length === 0) {
        globalLogger.error(`@${account.username}: No valid post URLs found in ${urlsFilePath}.`);
        return result;
    }

    globalLogger.info(`@${account.username}: Loaded ${postUrls.length} post URL(s) from ${urlsFilePath}.`);

    const sessionLogger = new Logger(account.username);
    const session = await initializeBotSession(
        account,
        aiGenerator,
        commentHistory,
        sessionLogger,
        accountSkillsCache
    );

    if (!session) {
        globalLogger.error(`@${account.username}: Failed to initialize browser session.`);
        return result;
    }

    const { browser, bot } = session;
    try {
        for (let i = 0; i < postUrls.length; i++) {
            const postUrl = postUrls[i];
            globalLogger.header(`----- @${account.username} URL ${i + 1}/${postUrls.length}: ${postUrl} -----`);

            const commentResult = await bot.runCommentTaskOnUrl(postUrl, account.aiPromptHint);

            if (commentResult === 'SUCCESS') result.success++;
            else if (commentResult === 'SKIPPED') result.skipped++;
            else result.failed++;

            if (i < postUrls.length - 1) {
                const waitMs = bot.getRandomActionDelayMs();
                globalLogger.info(`Waiting for ~${Math.round(waitMs / 1000)}s before next URL...`);
                await delay(waitMs);
            }
        }
    } finally {
        globalLogger.action(`Closing browser for @${account.username}...`);
        await browser.close();
    }

    return result;
}

interface HashtagScanResult {
    success: number;
    skipped: number;
    failed: number;
}

async function runHashtagScanForAccount(
    account: AccountConfig,
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryStore,
    accountSkillsCache: Map<string, string | undefined>
): Promise<HashtagScanResult> {
    const resolved = resolveAccountSettings(account);
    const hashtags = resolved.hashtags;
    const result: HashtagScanResult = { success: 0, skipped: 0, failed: 0 };

    if (hashtags.length === 0) {
        globalLogger.error(`@${account.username}: No hashtags configured in account config.`);
        return result;
    }

    globalLogger.info(
        `@${account.username}: Using ${hashtags.length} hashtag(s): ${hashtags.map(h => `#${h}`).join(', ')}`
    );

    const sessionLogger = new Logger(account.username);
    const session = await initializeBotSession(
        account,
        aiGenerator,
        commentHistory,
        sessionLogger,
        accountSkillsCache
    );

    if (!session) {
        globalLogger.error(`@${account.username}: Failed to initialize browser session.`);
        return result;
    }

    const { browser, bot } = session;
    const searchConfig = resolved.hashtagSearch;
    const commentedShortcodes = commentHistory.getCommentedShortcodes(account.username);

    try {
        for (let h = 0; h < hashtags.length; h++) {
            const hashtag = hashtags[h];
            globalLogger.header(
                `----- @${account.username} Hashtag ${h + 1}/${hashtags.length}: #${hashtag} -----`
            );

            let rankedPosts;
            try {
                rankedPosts = await bot.discoverAndRankHashtagPosts(
                    hashtag,
                    searchConfig,
                    commentedShortcodes
                );
            } catch (error: any) {
                globalLogger.error(`@${account.username}: Failed to discover posts for #${hashtag}: ${error.message}`);
                continue;
            }

            for (let i = 0; i < rankedPosts.length; i++) {
                const candidate = rankedPosts[i];
                globalLogger.header(
                    `----- @${account.username} #${hashtag} post ${i + 1}/${rankedPosts.length}: ${candidate.url} -----`
                );

                if (commentHistory.hasCommented(account.username, candidate.shortcode)) {
                    globalLogger.warn(`Already commented on ${candidate.shortcode}. Skipping.`);
                    result.skipped++;
                    continue;
                }

                const commentResult = await bot.runCommentTaskOnUrl(candidate.url, account.aiPromptHint);

                if (commentResult === 'SUCCESS') {
                    commentedShortcodes.add(candidate.shortcode);
                    result.success++;
                }
                else if (commentResult === 'SKIPPED') result.skipped++;
                else result.failed++;

                if (i < rankedPosts.length - 1) {
                    const waitMs = bot.getRandomActionDelayMs();
                    globalLogger.info(`Waiting for ~${Math.round(waitMs / 1000)}s before next post...`);
                    await delay(waitMs);
                }
            }

            if (h < hashtags.length - 1) {
                const waitMs = bot.getRandomActionDelayMs();
                globalLogger.info(`Waiting for ~${Math.round(waitMs / 1000)}s before next hashtag...`);
                await delay(waitMs);
            }
        }
    } finally {
        globalLogger.action(`Closing browser for @${account.username}...`);
        await browser.close();
    }

    return result;
}

async function runUrlListPhase(
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryStore,
    accountSkillsCache: Map<string, string | undefined>
) {
    const urlAccounts = getEnabledAccountsBySourceMode('url_list');
    if (urlAccounts.length === 0) {
        globalLogger.info('No enabled url_list accounts. Skipping URL phase.');
        return;
    }

    globalLogger.header('----- Phase 1: URL List (once per invocation) -----');
    let totalSuccess = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const account of urlAccounts) {
        globalLogger.header(`----- URL list for @${account.username} -----`);
        const result = await runUrlListForAccount(account, aiGenerator, commentHistory, accountSkillsCache);
        totalSuccess += result.success;
        totalSkipped += result.skipped;
        totalFailed += result.failed;
    }

    globalLogger.success(
        `URL phase complete. Success: ${totalSuccess} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`
    );
}

function loadPostUrlsFromFile(relativeOrAbsolutePath: string): string[] {
    const filePath = path.isAbsolute(relativeOrAbsolutePath)
        ? relativeOrAbsolutePath
        : path.join(baseDir, relativeOrAbsolutePath);

    if (!fs.existsSync(filePath)) {
        throw new Error(`Post URLs file not found: ${filePath}`);
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const urls: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        if (!isValidInstagramPostUrl(trimmed)) {
            globalLogger.warn(`Skipping invalid Instagram post URL: ${trimmed}`);
            continue;
        }

        urls.push(normalizePostUrl(trimmed));
    }

    return urls;
}

async function runHashtagCommentMode(
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryStore,
    accountSkillsCache: Map<string, string | undefined>
) {
    globalLogger.warn(
        'hashtag-comment mode is deprecated. Use npm start with sourceMode: hashtag_list accounts instead.'
    );
    globalLogger.header('----- RUNNING IN HASHTAG COMMENT MODE (shortcut) -----');

    const cliArg = process.argv[3];
    let accounts = getEnabledAccountsBySourceMode('hashtag_list');

    if (cliArg) {
        const account = findEnabledAccount(cliArg);
        if (!account || normalizeAccount(account).sourceMode !== 'hashtag_list') {
            globalLogger.error(`Enabled hashtag_list account "@${cliArg}" not found in config.ts.`);
            return;
        }
        accounts = [account];
    }

    if (accounts.length === 0) {
        globalLogger.error('No enabled hashtag_list accounts found in config.ts.');
        return;
    }

    let totalSuccess = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const account of accounts) {
        const result = await runHashtagScanForAccount(
            account,
            aiGenerator,
            commentHistory,
            accountSkillsCache
        );
        totalSuccess += result.success;
        totalSkipped += result.skipped;
        totalFailed += result.failed;
    }

    globalLogger.header('----- HASHTAG COMMENT MODE COMPLETE -----');
    globalLogger.success(`Success: ${totalSuccess} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
}

async function runCommentUrlsMode(
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryStore,
    accountSkillsCache: Map<string, string | undefined>
) {
    globalLogger.warn(
        'comment-urls mode is deprecated. Use npm start with sourceMode: url_list accounts instead.'
    );
    globalLogger.header('----- RUNNING IN COMMENT URLS MODE (shortcut) -----');

    const cliArg = process.argv[3];
    let accounts = getEnabledAccountsBySourceMode('url_list');
    let urlsFileOverride: string | undefined;

    if (cliArg) {
        if (cliArg.includes('/') || cliArg.endsWith('.txt')) {
            urlsFileOverride = cliArg;
        } else {
            const account = findEnabledAccount(cliArg);
            if (!account || normalizeAccount(account).sourceMode !== 'url_list') {
                globalLogger.error(`Enabled url_list account "@${cliArg}" not found in config.ts.`);
                return;
            }
            accounts = [account];
        }
    }

    if (accounts.length === 0) {
        globalLogger.error('No enabled url_list accounts found in config.ts.');
        return;
    }

    let totalSuccess = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const account of accounts) {
        const result = await runUrlListForAccount(
            account,
            aiGenerator,
            commentHistory,
            accountSkillsCache,
            urlsFileOverride
        );
        totalSuccess += result.success;
        totalSkipped += result.skipped;
        totalFailed += result.failed;
    }

    globalLogger.header('----- COMMENT URLS MODE COMPLETE -----');
    globalLogger.success(`Success: ${totalSuccess} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
}

async function runCheckAccountsMode(
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryStore,
    accountSkillsCache: Map<string, string | undefined>
) {
    globalLogger.header('----- RUNNING IN ACCOUNT CHECK MODE -----');

    const enabledAccounts = config.accounts.filter(acc => acc.enabled);

    if (enabledAccounts.length === 0) {
        globalLogger.error('No enabled accounts found in config.ts. Exiting.');
        return;
    }
    
    globalLogger.info(`Found ${enabledAccounts.length} enabled account(s) to check.`);
    
    for (const account of enabledAccounts) {
        globalLogger.header(`----- Checking account: @${account.username} -----`);
        const accountLogger = new Logger(account.username);
        
        const session = await initializeBotSession(
            account,
            aiGenerator,
            commentHistory,
            accountLogger,
            accountSkillsCache,
            { headless: false }
        );

        if (!session) {
            globalLogger.warn(`Failed to initialize session for @${account.username}. It might be locked or require verification. This account will be skipped.`);
        } else {
            const { browser } = session;
            globalLogger.info('Browser window is open for manual inspection (login, popups, etc.).');
            
            await waitForEnterCheckAccounts();

            globalLogger.action(`Closing browser for @${account.username}...`);
            await browser.close();
        }

        if (enabledAccounts.indexOf(account) < enabledAccounts.length - 1) {
             globalLogger.info('Proceeding to the next account...\n');
        }
    }

    globalLogger.header('----- ACCOUNT CHECK MODE COMPLETE -----');
}

async function runMonitorLoop(
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryStore,
    accountSkillsCache: Map<string, string | undefined>
) {
    globalLogger.header('----- Phase 2: Monitor Loop -----');

    const monitorAccounts = getEnabledAccountsBySourceMode('new_post_added_to_account');
    const hashtagAccounts = getEnabledAccountsBySourceMode('hashtag_list');

    const targetMap = new Map<string, { account: AccountConfig }[]>();
    monitorAccounts.forEach(account => {
        (account.targets ?? []).forEach(targetUsername => {
            if (!targetMap.has(targetUsername)) {
                targetMap.set(targetUsername, []);
            }
            targetMap.get(targetUsername)!.push({ account });
        });
    });

    const sharedTargets: { target: string; accounts: string[] }[] = [];
    for (const [targetUsername, tasks] of targetMap.entries()) {
        if (tasks.length > 1) {
            sharedTargets.push({
                target: targetUsername,
                accounts: tasks.map(task => task.account.username),
            });
        }
    }

    if (sharedTargets.length > 0) {
        globalLogger.header('----- SHARED TARGET WARNING -----');
        globalLogger.warn('The following targets are shared by multiple accounts:');
        for (const shared of sharedTargets) {
            globalLogger.warn(
                `  - Target: ${chalk.cyan(shared.target)} | Accounts: ${chalk.yellow(shared.accounts.join(', '))}`
            );
        }
        globalLogger.warn(
            'This is not an error, but be aware that all listed accounts will attempt to comment sequentially on new posts from these targets.'
        );
    }

    if (targetMap.size > 0) {
        globalLogger.info(`Monitoring ${targetMap.size} unique targets across new_post_added_to_account accounts.`);
    }
    if (hashtagAccounts.length > 0) {
        globalLogger.info(`Hashtag scanning enabled for ${hashtagAccounts.length} account(s) each cycle.`);
    }

    let monitorSession: { browser: Browser; bot: InstagramBot } | null = null;
    if (targetMap.size > 0) {
        const monitorAccount = monitorAccounts[0];
        globalLogger.info(`Using account @${monitorAccount.username} for profile stat checks.`);
        const monitorLogger = new Logger(`${monitorAccount.username}-MONITOR`);

        monitorSession = await initializeBotSession(
            monitorAccount,
            aiGenerator,
            commentHistory,
            monitorLogger,
            accountSkillsCache,
            { headless: config.settings.headless }
        );

        if (!monitorSession) {
            globalLogger.error(`Could not initialize monitor account @${monitorAccount.username}. Exiting.`);
            return;
        }
    }

    const profileStats = loadProfileStatsFromCsv();

    try {
        while (true) {
            globalLogger.header('----- Starting Monitoring Cycle -----');

            if (monitorSession && targetMap.size > 0) {
                const monitorPage = monitorSession.bot.getPage();
                const monitoredUsernames = Array.from(targetMap.keys());

                for (const targetUsername of monitoredUsernames) {
                    globalLogger.info(`Checking target: @${targetUsername}`);
                    const currentStats = await getProfileStats(monitorPage, targetUsername, globalLogger);

                    const interProfileDelay = 20000 + Math.random() * 20000;
                    globalLogger.debug(`Waiting ~${Math.round(interProfileDelay / 1000)}s before next check.`);
                    await delay(interProfileDelay);

                    if (currentStats === null) {
                        globalLogger.warn(`Could not get profile stats for @${targetUsername}. Skipping.`);
                        continue;
                    }

                    const previousStats = profileStats[targetUsername];
                    const { postCount: currentPostCount, followerCount: currentFollowerCount } = currentStats;

                    if (previousStats === undefined) {
                        globalLogger.info(
                            `Initialized @${targetUsername} with ${currentPostCount} posts and ${currentFollowerCount} followers. Will monitor for changes.`
                        );
                        profileStats[targetUsername] = currentStats;
                        await updateProfileStatsInCsv(targetUsername, currentPostCount, currentFollowerCount);
                    } else {
                        const { postCount: previousPostCount, followerCount: previousFollowerCount } = previousStats;

                        if (currentPostCount > previousPostCount) {
                            globalLogger.success(
                                `>>> NEW POST DETECTED for @${targetUsername}! Posts: ${previousPostCount} -> ${currentPostCount} <<<`
                            );

                            const tasks = targetMap.get(targetUsername) || [];
                            if (tasks.length > 0) {
                                globalLogger.action(
                                    `Found ${tasks.length} account(s) tasked to comment on this post.`
                                );
                            }

                            let allTasksSucceededOrSkipped = true;

                            for (const task of tasks) {
                                globalLogger.action(
                                    `--- Starting task for account: @${task.account.username} ---`
                                );
                                const result = await launchBotForTask(
                                    task.account,
                                    targetUsername,
                                    task.account.aiPromptHint,
                                    aiGenerator,
                                    commentHistory,
                                    accountSkillsCache
                                );

                                if (result === 'FAILED' || result === 'LAUNCH_ERROR') {
                                    allTasksSucceededOrSkipped = false;
                                    globalLogger.warn(
                                        `Task for @${task.account.username} on @${targetUsername} failed.`
                                    );
                                }

                                if (tasks.length > 1) {
                                    const interBotDelay = 15000 + Math.random() * 25000;
                                    globalLogger.info(
                                        `Waiting for ~${Math.round(interBotDelay / 1000)}s before next bot launch...`
                                    );
                                    await delay(interBotDelay);
                                }
                            }

                            if (allTasksSucceededOrSkipped) {
                                globalLogger.success(
                                    `All tasks for @${targetUsername} succeeded. Updating stats to P:${currentPostCount}, F:${currentFollowerCount}.`
                                );
                                profileStats[targetUsername] = currentStats;
                                await updateProfileStatsInCsv(
                                    targetUsername,
                                    currentPostCount,
                                    currentFollowerCount
                                );
                            } else {
                                globalLogger.warn(
                                    `One or more tasks failed for @${targetUsername}. Stats will NOT be updated to allow a retry on the next cycle.`
                                );
                            }
                        } else if (currentPostCount < previousPostCount) {
                            globalLogger.warn(
                                `Posts were deleted for @${targetUsername}. Old: ${previousPostCount}, New: ${currentPostCount}. Stats updated.`
                            );
                            profileStats[targetUsername] = currentStats;
                            await updateProfileStatsInCsv(targetUsername, currentPostCount, currentFollowerCount);
                        } else if (currentFollowerCount !== previousFollowerCount) {
                            globalLogger.info(
                                `Follower count changed for @${targetUsername}. Old: ${previousFollowerCount}, New: ${currentFollowerCount}. Stats updated.`
                            );
                            profileStats[targetUsername] = currentStats;
                            await updateProfileStatsInCsv(targetUsername, currentPostCount, currentFollowerCount);
                        } else {
                            globalLogger.info(
                                `No new posts or follower changes for @${targetUsername}. Posts: ${currentPostCount}, Followers: ${currentFollowerCount}.`
                            );
                        }
                    }
                }
            }

            if (hashtagAccounts.length > 0) {
                globalLogger.header('----- Hashtag Scanning -----');
                for (const account of hashtagAccounts) {
                    await runHashtagScanForAccount(
                        account,
                        aiGenerator,
                        commentHistory,
                        accountSkillsCache
                    );
                }
            }

            const { min, max } = config.settings.monitoringIntervalSeconds;
            const waitSeconds = min + Math.random() * (max - min);
            globalLogger.header(
                `----- Monitoring Cycle Complete. Waiting for ~${Math.round(waitSeconds / 60)} minutes. -----`
            );
            await delay(waitSeconds * 1000);
        }
    } catch (error: any) {
        globalLogger.error(`A critical error occurred in monitor loop: ${error.message}`);
        throw error;
    } finally {
        if (monitorSession) {
            globalLogger.info('Closing monitor browser...');
            await monitorSession.browser.close();
        }
    }
}

async function runUnifiedMode(
    aiGenerator: AICommentGenerator,
    commentHistory: CommentHistoryStore,
    accountSkillsCache: Map<string, string | undefined>
) {
    globalLogger.header('----- Instagram AI Commenter Bot (Unified Mode) -----');

    const enabledAccounts = config.accounts.filter(acc => acc.enabled);
    if (enabledAccounts.length === 0) {
        globalLogger.error('No enabled accounts found in config.ts. Exiting.');
        return;
    }

    await runUrlListPhase(aiGenerator, commentHistory, accountSkillsCache);

    const hasMonitorWork = enabledAccounts.some(acc => {
        const mode = normalizeAccount(acc).sourceMode;
        return mode === 'new_post_added_to_account' || mode === 'hashtag_list';
    });

    if (!hasMonitorWork) {
        globalLogger.info('No monitor or hashtag accounts enabled. Exiting after URL phase.');
        return;
    }

    await runMonitorLoop(aiGenerator, commentHistory, accountSkillsCache);
}

(async () => {
    if (process.stdin.isTTY) {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.on('keypress', (str, key) => {
            if (key.ctrl && key.name === 'c') {
                process.exit();
            }
            if (key.name === 'i') {
                globalLogger.warn('\n[DEBUG] Pause requested. Script will pause at the next opportunity.');
                pauseState.shouldPause = true;
            }
        });
    }

    if (!fs.existsSync(cookiesDir)) fs.mkdirSync(cookiesDir, { recursive: true });
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    if (!fs.existsSync(fingerprintsDir)) fs.mkdirSync(fingerprintsDir, { recursive: true });

    if (!fs.existsSync(globalLogPath)) {
        const header = 'timestamp,account_username,target_username,action_type,details\n';
        fs.writeFileSync(globalLogPath, header, 'utf-8');
        globalLogger.info('Created global interaction log file.');
    }

    if (!config.settings.mockAiComments) {
        const { aiProvider, googleAiApiKey, groqApiKey, localLlmBaseUrl, localLlmModel } =
            config.settings;
        const missingKey =
            (aiProvider === 'gemini' &&
                (!googleAiApiKey || googleAiApiKey === 'YOUR_GOOGLE_AI_API_KEY_HERE')) ||
            (aiProvider === 'groq' &&
                (!groqApiKey || groqApiKey === 'YOUR_GROQ_API_KEY_HERE')) ||
            (aiProvider === 'local' && (!localLlmBaseUrl?.trim() || !localLlmModel?.trim()));

        if (missingKey) {
            globalLogger.error(
                `AI provider "${aiProvider}" is not configured in config.ts. Set the required key/URL and retry.`
            );
            process.exit(1);
        }
    }

    if (config.settings.mockAiComments) {
        globalLogger.warn('mockAiComments is ON — AI API calls are skipped; using placeholder comments.');
    } else {
        globalLogger.info(`AI provider: ${config.settings.aiProvider}`);
    }

    const enabledAccounts = config.accounts.filter(acc => acc.enabled);
    if (enabledAccounts.length > 0) {
        try {
            validateEnabledAccounts(config.accounts);
        } catch (error: any) {
            globalLogger.error(error.message);
            process.exit(1);
        }
    }

    globalLogger.header('----- Account Summary -----');
    config.accounts.forEach(account => {
        const normalized = normalizeAccount(account);
        const resolved = resolveAccountSettings(account);
        const enabledStatus = account.enabled ? chalk.greenBright('Yes') : chalk.redBright('No');
        const modeDetail =
            normalized.sourceMode === 'new_post_added_to_account'
                ? `Targets: ${chalk.yellow(String(account.targets?.length ?? 0))}`
                : normalized.sourceMode === 'url_list'
                  ? `URLs: ${chalk.yellow(resolved.postUrlsFile ?? 'not set')}`
                  : `Hashtags: ${chalk.yellow(resolved.hashtags.map(h => `#${h}`).join(', ') || 'not set')}`;

        globalLogger.action(
            `Account: ${chalk.cyan(account.username)} | Enabled: ${enabledStatus} | Login: ${normalized.loginMethod} | Mode: ${normalized.sourceMode} | Skills: ${chalk.yellow(resolved.skillsFile || 'not set')} | ${modeDetail}`
        );
    });

    const accountSkillsCache = buildAccountSkillsCache();
    const enabledWithSkills = config.accounts.filter(
        acc => acc.enabled && accountSkillsCache.get(acc.username)
    );
    const enabledMissingSkills = config.accounts.filter(
        acc => acc.enabled && !accountSkillsCache.get(acc.username)
    );
    if (enabledWithSkills.length > 0) {
        globalLogger.info(`Skills loaded for ${enabledWithSkills.length} enabled account(s).`);
    }
    for (const account of enabledMissingSkills) {
        globalLogger.warn(
            `@${account.username}: skills file missing or empty at ${account.skillsFile ?? '(not set)'}`
        );
    }

    const commentHistory = new CommentHistoryStore(commentHistoryPath);
    if (commentHistory.getTotalCount() === 0) {
        const imported = commentHistory.importFromInteractionLog(globalLogPath);
        if (imported > 0) {
            globalLogger.info(
                `Imported ${imported} prior comment(s) from interaction_log.csv into comment history.`
            );
        }
    }

    const aiGenerator = new AICommentGenerator({
        provider: config.settings.aiProvider,
        googleAiApiKey: config.settings.googleAiApiKey,
        groqApiKey: config.settings.groqApiKey,
        groqModel: config.settings.groqModel,
        groqVisionModel: config.settings.groqVisionModel,
        localLlmBaseUrl: config.settings.localLlmBaseUrl,
        localLlmModel: config.settings.localLlmModel,
        mockComments: config.settings.mockAiComments,
        maxRequestsPerMinute: config.settings.aiMaxRequestsPerMinute,
    });
    const mode = process.argv[2];

    if (mode === 'test-comment') {
        await runTestCommentMode(aiGenerator, commentHistory, accountSkillsCache);
    } else if (mode === 'check-accounts') {
        await runCheckAccountsMode(aiGenerator, commentHistory, accountSkillsCache);
    } else if (mode === 'comment-urls') {
        await runCommentUrlsMode(aiGenerator, commentHistory, accountSkillsCache);
    } else if (mode === 'hashtag-comment') {
        await runHashtagCommentMode(aiGenerator, commentHistory, accountSkillsCache);
    } else {
        await runUnifiedMode(aiGenerator, commentHistory, accountSkillsCache);
    }

    commentHistory.close();
})();