import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: [path.resolve(__dirname, 'test/**/*.test.ts')],
    exclude: [path.resolve(__dirname, 'test/e2e/**')],
  },
  resolve: {
    alias: {
      '@fema/shared': path.resolve(__dirname, '../../../packages/core/shared/src/index.ts'),
      '@fema/server-utils': path.resolve(__dirname, '../../../packages/server/utils/src/index.ts'),
      '@fema/core-utils': path.resolve(__dirname, '../../../packages/core/utils/src/index.ts'),
    },
  },
})
