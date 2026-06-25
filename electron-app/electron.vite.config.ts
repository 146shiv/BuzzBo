import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function requireEnv(env: Record<string, string>, key: string, mode: string): string {
    const value = env[key]?.trim();
    if (!value) {
        throw new Error(`${key} is required in electron-app/.env.${mode}`);
    }
    return value;
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');
    const adminApiUrl = requireEnv(env, 'BUZZBO_ADMIN_API_URL', mode);
    const productName = requireEnv(env, 'BUZZBO_PRODUCT_NAME', mode);

    return {
        main: {
            define: {
                __BUZZBO_ADMIN_API_URL__: JSON.stringify(adminApiUrl),
                __BUZZBO_PRODUCT_NAME__: JSON.stringify(productName),
            },
            plugins: [externalizeDepsPlugin()],
            build: {
                outDir: 'out/main',
                rollupOptions: {
                    input: resolve(__dirname, 'main/index.ts'),
                },
            },
        },
        preload: {
            plugins: [externalizeDepsPlugin()],
            build: {
                outDir: 'out/preload',
                rollupOptions: {
                    input: resolve(__dirname, 'preload/index.ts'),
                },
            },
        },
        renderer: {
            root: resolve(__dirname, 'renderer'),
            build: {
                outDir: 'out/renderer',
                rollupOptions: {
                    input: resolve(__dirname, 'renderer/index.html'),
                },
            },
            plugins: [react(), tailwindcss()],
            resolve: {
                alias: {
                    '@': resolve(__dirname, 'renderer/src'),
                    '@buzzbo/core/ui/account-settings': resolve(
                        __dirname,
                        '../core/src/ui/account-settings'
                    ),
                },
            },
        },
    };
});
