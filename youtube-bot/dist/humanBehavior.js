"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HumanBehavior = void 0;
const textEncoding_1 = require("./textEncoding");
class HumanBehavior {
    constructor(page, developerMode, pauseState, logger) {
        this.page = page;
        this.developerMode = developerMode;
        this.pauseState = pauseState;
        this.logger = logger;
        this.sessionVariations = {
            typingSpeedMultiplier: 0.7 + Math.random() * 0.6,
            scrollSpeedMultiplier: 0.8 + Math.random() * 0.4,
            pauseFrequency: 0.1 + Math.random() * 0.3,
            mouseAccuracy: 0.7 + Math.random() * 0.3,
        };
    }
    async checkForPause() {
        if (this.pauseState?.shouldPause) {
            this.logger.warn('Pause requested. Script is now paused.');
            this.logger.warn('Open Playwright Inspector, debug, and press the "Resume" button to continue.');
            this.pauseState.shouldPause = false;
            await this.page.pause();
            this.logger.warn('Script resumed.');
        }
    }
    async randomDelay(min, max) {
        await this.checkForPause();
        if (this.developerMode) {
            await this.page.waitForTimeout(50);
            return;
        }
        const baseDelay = Math.floor(Math.random() * (max - min) + min);
        const sessionAdjusted = baseDelay * (0.8 + Math.random() * 0.4);
        const finalDelay = Math.random() < 0.05 ? sessionAdjusted * (2 + Math.random() * 3) : sessionAdjusted;
        await this.page.waitForTimeout(finalDelay);
    }
    async naturalTyping(selector, text, options = { min: 100, max: 350, typoChance: 0.05 }) {
        await this.checkForPause();
        const element = typeof selector === 'string' ? this.page.locator(selector) : selector;
        if (this.developerMode) {
            await element.fill(text);
            return;
        }
        await element.click();
        await this.randomDelay(300, 800);
        await this.typeText(text, options);
    }
    /** Type into the focused field without clicking (for mention-aware comment entry). */
    async typeText(text, options = { min: 100, max: 350, typoChance: 0.05 }) {
        await this.checkForPause();
        if (this.developerMode) {
            await this.page.keyboard.insertText(text);
            return;
        }
        await this.typeAsciiWithKeyboard(text, options);
    }
    /**
     * Type into Instagram's contenteditable comment box.
     * ASCII uses keyboard events; emoji/Unicode uses DOM insert (CDP insertText corrupts in Lexical).
     */
    async typeTextInField(element, text, options = { min: 100, max: 350, typoChance: 0.05 }) {
        await this.checkForPause();
        await element.focus();
        if (this.developerMode) {
            await this.insertTextIntoEditable(element, text);
            return;
        }
        const runs = (0, textEncoding_1.splitIntoTypingRuns)(text);
        const adjustedMin = options.min * this.sessionVariations.typingSpeedMultiplier;
        const adjustedMax = options.max * this.sessionVariations.typingSpeedMultiplier;
        for (const run of runs) {
            await element.focus();
            if (run.kind === 'unicode') {
                await this.insertTextIntoEditable(element, run.text);
                await this.page.waitForTimeout(adjustedMin + Math.random() * (adjustedMax - adjustedMin));
                continue;
            }
            await this.typeAsciiWithKeyboard(run.text, options);
        }
    }
    /** Insert Unicode into a contenteditable via browser DOM APIs (reliable for Instagram Lexical). */
    async insertTextIntoEditable(element, text) {
        await element.click();
        const inserted = await element.evaluate((el, insertText) => {
            const resolveTarget = () => {
                const root = el;
                const active = document.activeElement;
                if (active instanceof HTMLElement && root.contains(active) && active.isContentEditable) {
                    return active;
                }
                const nested = root.querySelector('[contenteditable="true"][role="textbox"], [contenteditable="true"]');
                return nested ?? root;
            };
            const target = resolveTarget();
            target.focus();
            const selection = window.getSelection();
            if (!selection) {
                return false;
            }
            if (selection.rangeCount === 0) {
                const initialRange = document.createRange();
                initialRange.selectNodeContents(target);
                initialRange.collapse(false);
                selection.addRange(initialRange);
            }
            if (document.execCommand('insertText', false, insertText)) {
                target.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }
            try {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const textNode = document.createTextNode(insertText);
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
                target.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: false,
                    inputType: 'insertText',
                    data: insertText,
                }));
                return true;
            }
            catch {
                return false;
            }
        }, text);
        if (!inserted) {
            await this.pasteTextIntoEditable(element, text);
        }
    }
    async pasteTextIntoEditable(element, text) {
        await element.focus();
        const origin = (() => {
            try {
                return new URL(this.page.url()).origin;
            }
            catch {
                return 'https://www.instagram.com';
            }
        })();
        await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin }).catch(() => { });
        await this.page.evaluate(async (value) => {
            await navigator.clipboard.writeText(value);
        }, text);
        const pasteShortcut = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
        await this.page.keyboard.press(pasteShortcut);
        await this.randomDelay(150, 400);
    }
    async typeAsciiWithKeyboard(text, options = { min: 100, max: 350, typoChance: 0.05 }) {
        const adjustedMin = options.min * this.sessionVariations.typingSpeedMultiplier;
        const adjustedMax = options.max * this.sessionVariations.typingSpeedMultiplier;
        const graphemes = (0, textEncoding_1.splitGraphemes)(text);
        for (let i = 0; i < graphemes.length; i++) {
            const grapheme = graphemes[i];
            const typoChance = (options.typoChance || 0.05) * (1 + Math.random() * 0.5);
            const canSimulateTypo = (0, textEncoding_1.needsKeyboardType)(grapheme);
            if (canSimulateTypo && Math.random() < typoChance && i < graphemes.length - 1) {
                const typoTypes = ['adjacent', 'double', 'wrong'];
                const typoType = typoTypes[Math.floor(Math.random() * typoTypes.length)];
                if (typoType === 'double') {
                    await this.page.keyboard.type(grapheme);
                    await this.randomDelay(100, 300);
                    await this.page.keyboard.press('Backspace');
                    await this.randomDelay(150, 400);
                }
                else {
                    let typoChar = grapheme;
                    if (typoType === 'adjacent') {
                        const adjacent = {
                            a: 's',
                            s: 'a',
                            d: 'f',
                            f: 'd',
                            e: 'r',
                            r: 'e',
                            t: 'y',
                            y: 't',
                        };
                        typoChar = adjacent[grapheme.toLowerCase()] || 'x';
                    }
                    else {
                        typoChar = 'qwertyuiopasdfghjklzxcvbnm'[Math.floor(Math.random() * 26)];
                    }
                    await this.page.keyboard.type(typoChar);
                    await this.randomDelay(200, 500);
                    await this.page.keyboard.press('Backspace');
                    await this.randomDelay(150, 400);
                }
            }
            if (!(0, textEncoding_1.needsKeyboardType)(grapheme)) {
                continue;
            }
            await this.page.keyboard.type(grapheme);
            let delay = adjustedMin + Math.random() * (adjustedMax - adjustedMin);
            if (grapheme === ' ')
                delay *= 1.5;
            if ('.!?'.includes(grapheme))
                delay *= 2;
            if (i === 0)
                delay *= 1.3;
            if (Math.random() < 0.08) {
                delay += 800 + Math.random() * 2000;
            }
            await this.page.waitForTimeout(delay);
        }
    }
    async hesitateAndClick(selector, options = {}) {
        await this.checkForPause();
        const element = typeof selector === 'string' ? this.page.locator(selector) : selector;
        if (this.developerMode) {
            await element.click({ force: true, timeout: 5000 });
            return;
        }
        await this.naturalMouseMovement(element);
        if (Math.random() < 0.15) {
            const box = await element.boundingBox();
            if (box) {
                const retreatX = box.x + box.width / 2 + (50 + Math.random() * 100) * (Math.random() < 0.5 ? -1 : 1);
                const retreatY = box.y + box.height / 2 + (20 + Math.random() * 40) * (Math.random() < 0.5 ? -1 : 1);
                await this.page.mouse.move(retreatX, retreatY);
                await this.randomDelay(500, 1500);
                await this.naturalMouseMovement(element);
            }
        }
        await this.randomDelay(300, 1200);
        await element.dispatchEvent('mousedown');
        const holdDuration = options.clickDuration ?? 80 + Math.random() * 140;
        await this.page.waitForTimeout(holdDuration);
        await element.dispatchEvent('mouseup');
        await element.dispatchEvent('click');
    }
    async randomizedWait(delayConfig) {
        await this.checkForPause();
        if (this.developerMode) {
            await this.page.waitForTimeout(250);
            return;
        }
        const baseDelay = delayConfig.base;
        const variance = delayConfig.variance;
        const randomFactor = Math.pow(Math.random(), 1.5);
        const delay = baseDelay + randomFactor * variance;
        await this.page.waitForTimeout(delay);
    }
    async naturalMouseMovement(selector) {
        const element = typeof selector === 'string' ? this.page.locator(selector) : selector;
        const box = await element.boundingBox();
        if (!box)
            return;
        const accuracy = this.sessionVariations.mouseAccuracy;
        const targetVarianceX = (1 - accuracy) * box.width * 0.3;
        const targetVarianceY = (1 - accuracy) * box.height * 0.3;
        const targetX = box.x + box.width / 2 + (Math.random() - 0.5) * targetVarianceX;
        const targetY = box.y + box.height / 2 + (Math.random() - 0.5) * targetVarianceY;
        const viewportSize = await this.page.viewportSize();
        if (!viewportSize)
            return;
        const startX = viewportSize.width / 2 + (Math.random() - 0.5) * 200;
        const startY = viewportSize.height / 2 + (Math.random() - 0.5) * 200;
        const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));
        const controlPoints = Math.ceil(distance / 100) + 2;
        const controlX1 = startX + (targetX - startX) * 0.3 + (Math.random() - 0.5) * 100;
        const controlY1 = startY + (targetY - startY) * 0.3 + (Math.random() - 0.5) * 50;
        const controlX2 = startX + (targetX - startX) * 0.7 + (Math.random() - 0.5) * 80;
        const controlY2 = startY + (targetY - startY) * 0.7 + (Math.random() - 0.5) * 40;
        const points = 15 + Math.floor(distance / 30);
        for (let i = 0; i <= points; i++) {
            const t = i / points;
            const t2 = t * t;
            const t3 = t2 * t;
            const oneMinusT = 1 - t;
            const oneMinusT2 = oneMinusT * oneMinusT;
            const oneMinusT3 = oneMinusT2 * oneMinusT;
            const x = oneMinusT3 * startX + 3 * oneMinusT2 * t * controlX1 + 3 * oneMinusT * t2 * controlX2 + t3 * targetX;
            const y = oneMinusT3 * startY + 3 * oneMinusT2 * t * controlY1 + 3 * oneMinusT * t2 * controlY2 + t3 * targetY;
            const tremorX = x + (Math.random() - 0.5) * 2;
            const tremorY = y + (Math.random() - 0.5) * 2;
            await this.page.mouse.move(tremorX, tremorY);
            const speedFactor = Math.sin(t * Math.PI) * 0.5 + 0.5;
            const delay = 15 + (1 - speedFactor) * 30;
            await this.page.waitForTimeout(delay);
        }
    }
    async jitteryMovement(selector) {
        if (this.developerMode) {
            return;
        }
        await this.naturalMouseMovement(selector);
    }
    async moveMouseRandomly() {
        if (this.developerMode)
            return;
        const viewportSize = await this.page.viewportSize();
        if (!viewportSize)
            return;
        const margin = 100;
        const targetX = margin + Math.random() * (viewportSize.width - 2 * margin);
        const targetY = margin + Math.random() * (viewportSize.height - 2 * margin);
        const currentX = viewportSize.width / 2 + (Math.random() - 0.5) * 100;
        const currentY = viewportSize.height / 2 + (Math.random() - 0.5) * 100;
        const distance = Math.sqrt(Math.pow(targetX - currentX, 2) + Math.pow(targetY - currentY, 2));
        const steps = Math.max(10, Math.floor(distance / 20));
        const midX = (currentX + targetX) / 2 + (Math.random() - 0.5) * 100;
        const midY = (currentY + targetY) / 2 + (Math.random() - 0.5) * 50;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = Math.pow(1 - t, 2) * currentX + 2 * (1 - t) * t * midX + Math.pow(t, 2) * targetX;
            const y = Math.pow(1 - t, 2) * currentY + 2 * (1 - t) * t * midY + Math.pow(t, 2) * targetY;
            const jitterX = x + (Math.random() - 0.5) * 3;
            const jitterY = y + (Math.random() - 0.5) * 3;
            await this.page.mouse.move(jitterX, jitterY);
            const speed = 20 + Math.random() * 30;
            await this.page.waitForTimeout(speed);
        }
        await this.randomDelay(200, 800);
    }
}
exports.HumanBehavior = HumanBehavior;
