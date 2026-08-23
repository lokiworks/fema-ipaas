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
      '@fema-ipaas/connector-sdk': path.resolve(repoRoot, 'packages/connectors/sdk/src/index.ts'),
    },
  },
})
