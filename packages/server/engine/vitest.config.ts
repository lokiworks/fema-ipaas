import path from 'path'
import { buildSync } from 'esbuild'
import { defineConfig } from 'vitest/config'

// Change CWD to repo root for compatibility with connector-loader path resolution
const repoRoot = path.resolve(__dirname, '../../..')
process.chdir(repoRoot)

process.env.FEMA_EXECUTION_MODE = 'UNSANDBOXED'
process.env.FEMA_BASE_CODE_DIRECTORY = 'packages/server/engine/test/resources/codes'
process.env.FEMA_TEST_MODE = 'true'
process.env.FEMA_DEV_CONNECTORS = 'http,data-mapper,approval,webhook,delay'

const alias = {
  '@fema-ipaas/shared': path.resolve(__dirname, '../../core/shared/src/index.ts'),
  '@fema-ipaas/connector-sdk': path.resolve(__dirname, '../../connectors/sdk/src/index.ts'),
  '@fema-ipaas/connector-common': path.resolve(__dirname, '../../connectors/common/src/index.ts'),
  '@fema-ipaas/expression': path.resolve(__dirname, '../../core/formula/src/index.ts'),
  '@fema-ipaas/connector-types': path.resolve(__dirname, '../../core/connector-types/src/index.ts'),
  '@fema-ipaas/core-utils': path.resolve(__dirname, '../../core/utils/src/index.ts'),
  '@fema-ipaas/workflow-core': path.resolve(__dirname, '../../core/execution/src/index.ts'),
}

const connectorChildEntry = path.resolve(__dirname, '../../../dist/packages/engine-test/connector-child.js')
buildSync({
  entryPoints: [path.resolve(__dirname, 'src/connector-child.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: connectorChildEntry,
  format: 'cjs',
  alias,
  external: ['isolated-vm', 'utf-8-validate', 'bufferutil'],
})
process.env.FEMA_CONNECTOR_CHILD_ENTRY = connectorChildEntry

export default defineConfig({
  // esbuild injects this at bundle time; vitest runs the source directly, so define it here too.
  // Tests exercise the proxy-included path (the no-proxy bundle's behaviour is the build-flag flip).
  define: {
    __AP_PROXY_DISPATCHER__: 'true',
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    include: [path.resolve(__dirname, 'test/**/*.test.ts')],
    globalSetup: [path.resolve(__dirname, 'test/global-setup.ts')],
  },
  resolve: {
    alias,
  },
})
