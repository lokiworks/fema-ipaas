import { publishNpmPackage } from '../utils/publish-npm-package'
import { findAllConnectorsDirectoryInSource } from '../utils/connector-script-utils'
import { chunk } from '@fema-ipaas/core-utils'

function getChangedConnectorPaths(): string[] | null {
  const changedConnectors = process.env['CHANGED_CONNECTORS']
  if (!changedConnectors || changedConnectors.trim() === '') {
    return null
  }
  return changedConnectors.split('\n').filter(Boolean)
}

const main = async () => {
  const changedPaths = getChangedConnectorPaths()
  const connectorsSource = changedPaths ?? await findAllConnectorsDirectoryInSource()

  console.info(`[publishConnectors] publishing ${connectorsSource.length} connectors${changedPaths ? ' (scoped to changed)' : ' (all)'}`)

  const connectorsSourceChunks = chunk(connectorsSource, 30)
  const failedPaths: string[] = []

  for (const chunk of connectorsSourceChunks) {
    const results = await Promise.allSettled(chunk.map((path) => publishNpmPackage(path)))
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[publishConnectors] FAILED path=${chunk[index]}`, result.reason)
        failedPaths.push(chunk[index])
      }
    })
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  if (failedPaths.length > 0) {
    console.error(`[publishConnectors] ${failedPaths.length}/${connectorsSource.length} connector(s) failed to publish:\n  ${failedPaths.join('\n  ')}`)
    process.exitCode = 1
  }
}

main()