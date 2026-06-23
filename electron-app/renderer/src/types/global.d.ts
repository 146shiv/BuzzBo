import type { BuzzboApi } from '../../../preload/index';

declare global {
    interface Window {
        buzzbo: BuzzboApi;
    }
}

export {};
