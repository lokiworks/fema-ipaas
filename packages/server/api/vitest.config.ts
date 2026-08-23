import path from 'path'
import { defineConfig } from 'vitest/config'

// Change CWD to repo root for compatibility with connector-loader path resolution
const repoRoot = path.resolve(__dirname, '../../..')
process.chdir(repoRoot)

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
    include: [path.resolve(__dirname, 'test/**/*.test.ts')],
  },
  resolve: {
    alias: {
      'isolated-vm': path.resolve(__dirname, '__mocks__/isolated-vm.js'),
      '@fema/shared': path.resolve(__dirname, '../../../packages/core/shared/src/index.ts'),
      '@fema/connector-sdk': path.resolve(__dirname, '../../../packages/connectors/sdk/src/index.ts'),
      '@fema/connector-common': path.resolve(__dirname, '../../../packages/connectors/common/src/index.ts'),
      '@fema/server-utils': path.resolve(__dirname, '../../../packages/server/utils/src/index.ts'),
      '@fema/ai-providers': path.resolve(__dirname, '../../../packages/core/ai-providers/src/index.ts'),

    },
  },
})
