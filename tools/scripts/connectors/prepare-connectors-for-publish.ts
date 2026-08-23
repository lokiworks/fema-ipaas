import { findAllConnectorsDirectoryInSource } from '../utils/connector-script-utils'
import { prepareConnectorDistForPublish } from '../../../packages/cli/src/lib/utils/prepare-connector-utils'
import { chunk } from '@fema-ipaas/core-utils'

function getChangedConnectorPaths(): string[] | null {
    const changedConnectors = process.env['CHANGED_CONNECTORS']
    if (!changedConnectors || changedConnectors.trim() === '') {
        return null
    }
    return changedConnectors.split('\n').filter(Boolean)
}

async function main(): Promise<void> {
    const changedPaths = getChangedConnectorPaths()
    const connectorPaths = changedPaths ?? await findAllConnectorsDirectoryInSource()

    console.info(`[prepareConnectors] processing ${connectorPaths.length} connectors${changedPaths ? ' (scoped to changed)' : ' (all)'}`)

    // Bundling is memory-heavy; cap concurrent bundles so a large changeset (e.g. a mass version
    // bump) can't OOM-kill the runner. Fire-and-forget over all connectors at once exhausts memory.
    const batches = chunk(connectorPaths, 30)
    for (const batch of batches) {
        await Promise.all(batch.map(prepareConnectorDistForPublish))
    }

    console.info(`[prepareConnectors] done, prepared ${connectorPaths.length} connectors`)
}

main()
