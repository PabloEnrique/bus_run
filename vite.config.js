import os from 'node:os';
import { defineConfig, loadEnv } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

function detectLanHost() {
    const interfaces = os.networkInterfaces();
    for (const addresses of Object.values(interfaces)) {
        for (const address of addresses ?? []) {
            if (address.family !== 'IPv4' || address.internal) continue;
            if (
                address.address.startsWith('192.168.') ||
                address.address.startsWith('10.') ||
                /^172\.(1[6-9]|2\d|3[0-1])\./.test(address.address)
            ) {
                return address.address;
            }
        }
    }
    return 'localhost';
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const vitePort = Number(env.VITE_PORT || 5173);
    const viteHost = env.VITE_HMR_HOST || detectLanHost();
    const viteOrigin = env.VITE_DEV_SERVER_URL || `http://${viteHost}:${vitePort}`;
    const gamePort = env.VITE_GAME_SERVER_PORT || '2567';

    return {
        resolve: {
            alias: {
                '@': resolve(__dirname, 'resources/js'),
            },
        },
        plugins: [
            laravel({
                input: ['resources/css/app.css', 'resources/js/app.js'],
                refresh: true,
            }),
            tailwindcss(),
            vue({
                template: {
                    transformAssetUrls: {
                        base: null,
                        includeAbsolute: false,
                    },
                },
            }),
        ],
        server: {
            host: '0.0.0.0',
            port: vitePort,
            origin: viteOrigin,
            hmr: {
                host: viteHost,
                protocol: 'ws',
                port: vitePort,
                clientPort: vitePort,
            },
            cors: true,
            watch: {
                ignored: ['**/storage/framework/views/**'],
            },
            proxy: {
                '/colyseus': {
                    target: `ws://localhost:${gamePort}`,
                    ws: true,
                    changeOrigin: true,
                },
            },
        },
    };
});
