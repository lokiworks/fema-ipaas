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
      '@fema/shared': path.resolve(
        __dirname,
        '../../packages/core/shared/src',
      ),
      '@fema/connector-sdk': path.resolve(
        __dirname,
        '../../packages/connectors/sdk/src',
      ),
      '@fema/core-utils': path.resolve(
        __dirname,
        '../../packages/core/utils/src',
      ),
      '@fema/expression': path.resolve(
        __dirname,
        '../../packages/core/formula/src',
      ),
      '@fema/connector-types': path.resolve(
        __dirname,
        '../../packages/core/connector-types/src',
      ),
      '@fema/workflow-core': path.resolve(
        __dirname,
        '../../packages/core/execution/src',
      ),
    },
  },
});
