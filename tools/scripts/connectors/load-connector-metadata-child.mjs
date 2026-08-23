/**
 * Standalone Node entrypoint that loads a connector's compiled JS and prints its
 * metadata as JSON on stdout. Invoked as a child process from
 * `connector-script-utils.ts:loadConnectorFromFolder` so that the connector's
 * `require('@fema-ipaas/connector-sdk')` resolves via standard
 * node_modules lookup — matching the pinned framework inside the connector's
 * package.json — instead of being intercepted by `tsconfig-paths/register`
 * in the parent script (which would redirect to the local workspace
 * framework and silently clobber `minimumSupportedRelease` via the floor
 * check in `Connector`'s constructor).
 *
 * Usage: node load-connector-metadata-child.mjs <connectorDistFolder>
 */

import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const folderPath = process.argv[2]
if (!folderPath) {
    console.error('[load-connector-metadata-child] missing folder path argv')
    process.exit(2)
}

const entryPath = resolve(folderPath, 'src', 'index.js')
const require = createRequire(import.meta.url)
const module = require(entryPath)

let connector = null
for (const exported of Object.values(module)) {
    if (exported !== null && exported !== undefined && exported.constructor?.name === 'Connector') {
        connector = exported
        break
    }
}

if (!connector) {
    console.error(`[load-connector-metadata-child] no Connector export found in ${entryPath}`)
    process.exit(3)
}

const payload = {
    metadata: connector.metadata(),
    minimumSupportedRelease: connector.minimumSupportedRelease ?? null,
    maximumSupportedRelease: connector.maximumSupportedRelease ?? null,
    authors: connector.authors ?? [],
}

process.stdout.write(JSON.stringify(payload))
