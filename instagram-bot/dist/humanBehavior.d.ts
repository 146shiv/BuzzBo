import { Page, Locator } from 'playwright';
import { DelayConfig } from '@buzzbo/core/config';
import { Logger } from '@buzzbo/core/logger/logger';
export interface PauseState {
    shouldPause: boolean;
}
export declare class HumanBehavior {
    private page;
    private developerMode;
    private pauseState?;
    private logger;
    private sessionVariations;
    constructor(page: Page, developerMode: boolean, pauseState: PauseState | undefined, logger: Logger);
    checkForPause(): Promise<void>;
    randomDelay(min: number, max: number): Promise<void>;
    naturalTyping(selector: string | Locator, text: string, options?: {
        min: number;
        max: number;
        typoChance?: number;
    }): Promise<void>;
    /** Type into the focused field without clicking (for mention-aware comment entry). */
    typeText(text: string, options?: {
        min: number;
        max: number;
        typoChance?: number;
    }): Promise<void>;
    /**
     * Type into Instagram's contenteditable comment box.
     * ASCII uses keyboard events; emoji/Unicode uses DOM insert (CDP insertText corrupts in Lexical).
     */
    typeTextInField(element: Locator, text: string, options?: {
        min: number;
        max: number;
        typoChance?: number;
    }): Promise<void>;
    /** Insert Unicode into a contenteditable via browser DOM APIs (reliable for Instagram Lexical). */
    insertTextIntoEditable(element: Locator, text: string): Promise<void>;
    private pasteTextIntoEditable;
    private typeAsciiWithKeyboard;
    hesitateAndClick(selector: string | Locator, options?: {
        clickDuration?: number;
    }): Promise<void>;
    randomizedWait(delayConfig: DelayConfig): Promise<void>;
    private naturalMouseMovement;
    jitteryMovement(selector: string | Locator): Promise<void>;
    moveMouseRandomly(): Promise<void>;
}
//# sourceMappingURL=humanBehavior.d.ts.map