import path from 'path'
import { defineConfig } from 'vitest/config'

const repoRoot = path.resolve(__dirname, '../../../..')

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@fema-ipaas/shared': path.resolve(repoRoot, 'packages/core/shared/src/index.ts'),
      '@fema-ipaas/connector-sdk': path.resolve(repoRoot, 'packages/connectors/sdk/src/index.ts'),
      '@fema-ipaas/connector-common': path.resolve(repoRoot, 'packages/connectors/common/src/index.ts'),
    },
  },
})
