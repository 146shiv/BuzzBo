import { getBuildDefaultAdminApiUrl } from './buildProfile';

/** Apply electron-app build profile env (from .env.development / .env.production). */
export function loadBuzzboEnv(): void {
    const adminApiUrl = getBuildDefaultAdminApiUrl().trim();
    if (adminApiUrl) {
        process.env.BUZZBO_ADMIN_API_URL = adminApiUrl;
    }
}

loadBuzzboEnv();
