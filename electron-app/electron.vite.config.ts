import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    main: {
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
});
