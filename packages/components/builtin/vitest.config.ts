import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: [path.resolve(__dirname, 'test/**/*.test.ts')],
    },
    resolve: {
        alias: {
            '@fema-ipaas/component-sdk': path.resolve(__dirname, '../sdk/src/index.ts'),
            '@fema-ipaas/connector-sdk': path.resolve(__dirname, '../../connectors/sdk/src/index.ts'),
            '@fema-ipaas/connector-types': path.resolve(__dirname, '../../core/connector-types/src/index.ts'),
            '@fema-ipaas/core-utils': path.resolve(__dirname, '../../core/utils/src/index.ts'),
        },
    },
})
