import path from 'path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
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
});
