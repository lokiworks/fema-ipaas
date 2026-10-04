/// <reference types='vitest' />
import path from 'path';

import tsconfigPaths from 'vite-tsconfig-paths';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import tailwindcss from '@tailwindcss/vite';
import customHtmlPlugin from './vite-plugins/html-plugin';

export default defineConfig(({ command, mode }) => {
  const API_PORT = process.env.FEMA_DEV_API_PORT ?? '3000';
  const WEB_PORT = process.env.FEMA_DEV_WEB_PORT ?? '4200';
  const isDev = command === 'serve' || mode === 'development';

  const FEMA_TITLE = 'Integration Platform';
  const FEMA_FAVICON = '/favicon.ico';

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/packages/web',
    server: {
      // allowedHosts: ['wozcsvaint.loclx.io'],
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${API_PORT}`,
          secure: false,
          changeOrigin: true,
          headers: {
            Host: `127.0.0.1:${WEB_PORT}`,
          },
          ws: true,
        },
        '/ingest': {
          target: `http://127.0.0.1:${API_PORT}`,
          secure: false,
          changeOrigin: true,
        },
        '^/mcp(/|$)': {
          target: `http://127.0.0.1:${API_PORT}`,
          secure: false,
          changeOrigin: true,
          headers: {
            'X-Forwarded-Host': `localhost:${WEB_PORT}`,
          },
          rewrite: (p: string) => p,
        },
        '/.well-known': {
          target: `http://127.0.0.1:${API_PORT}`,
          secure: false,
          changeOrigin: true,
          headers: {
            'X-Forwarded-Host': `localhost:${WEB_PORT}`,
          },
        },
        '/register': {
          target: `http://127.0.0.1:${API_PORT}`,
          secure: false,
          changeOrigin: true,
          headers: {
            'X-Forwarded-Host': `localhost:${WEB_PORT}`,
          },
        },
        '/authorize': {
          target: `http://127.0.0.1:${API_PORT}`,
          secure: false,
          changeOrigin: true,
          headers: {
            'X-Forwarded-Host': `localhost:${WEB_PORT}`,
          },
        },
        '/token': {
          target: `http://127.0.0.1:${API_PORT}`,
          secure: false,
          changeOrigin: true,
          headers: {
            'X-Forwarded-Host': `localhost:${WEB_PORT}`,
          },
        },
        '/revoke': {
          target: `http://127.0.0.1:${API_PORT}`,
          secure: false,
          changeOrigin: true,
          headers: {
            'X-Forwarded-Host': `localhost:${WEB_PORT}`,
          },
        },
      },
      port: Number(WEB_PORT),
      host: '0.0.0.0',
    },

    preview: {
      port: 4300,
      host: 'localhost',
    },
    resolve: {
      dedupe: [
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/commands',
      ],
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@fema-ipaas/shared': path.resolve(
          __dirname,
          '../../packages/core/shared/src',
        ),
        '@fema-ipaas/connector-sdk': path.resolve(
          __dirname,
          '../../packages/connectors/sdk/src',
        ),
        '@fema-ipaas/component-sdk': path.resolve(
          __dirname,
          '../../packages/components/sdk/src',
        ),
        '@fema-ipaas/core-utils': path.resolve(
          __dirname,
          '../../packages/core/utils/src',
        ),
        '@fema-ipaas/expression': path.resolve(
          __dirname,
          '../../packages/core/formula/src',
        ),
        '@fema-ipaas/connector-types': path.resolve(
          __dirname,
          '../../packages/core/connector-types/src',
        ),
        '@fema-ipaas/workflow-core': path.resolve(
          __dirname,
          '../../packages/core/execution/src',
        ),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      tsconfigPaths(),
      customHtmlPlugin({
        title: FEMA_TITLE,
        icon: FEMA_FAVICON,
      }),
      ...(isDev
        ? [
            checker({
              typescript: {
                buildMode: true,
                tsconfigPath: './tsconfig.json',
                root: __dirname,
              },
            }),
          ]
        : []),
    ],

    build: {
      outDir: '../../dist/packages/web',
      emptyOutDir: true,
      reportCompressedSize: true,
      sourcemap: 'hidden',
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {
        onLog(level, log, handler) {
          if (
            log.cause &&
            log.message.includes(`Can't resolve original location of error.`)
          ) {
            return;
          }
          handler(level, log);
        },
      },
    },
  };
});
