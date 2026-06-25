/** Injected at build time via electron.vite.config.ts `define`. */
declare const __BUZZBO_ADMIN_API_URL__: string;
declare const __BUZZBO_PRODUCT_NAME__: string;

export function getBuildDefaultAdminApiUrl(): string {
    return typeof __BUZZBO_ADMIN_API_URL__ !== 'undefined' ? __BUZZBO_ADMIN_API_URL__ : '';
}

export function getProductName(): string {
    return typeof __BUZZBO_PRODUCT_NAME__ !== 'undefined' ? __BUZZBO_PRODUCT_NAME__ : 'Buzzbo';
}
