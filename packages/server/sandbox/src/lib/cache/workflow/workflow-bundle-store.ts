import path from 'node:path'
import { isNil, tryCatch, tryCatchSync } from '@fema/core-utils'
import { type ApLogger } from '@fema/server-utils'
import { ConnectorPackage, GetWorkflowBundleResponse, LATEST_WORKFLOW_SCHEMA_VERSION, WorkerToApiContract, WorkflowVersion } from '@fema/shared'
import { bundleHttp } from '../../utils/bundle-http'
import { cacheUtils } from '../cache-paths'
import { cacheState } from '../cache-state'
import { codeCache } from './code/code-cache'
import { workflowSteps } from './workflow-steps'

const MISS = ''

export const workflowBundleStore = (log: ApLogger, apiClient: WorkerToApiContract, basePath: string) => ({
    async tryFetch({ workflowVersionId, workspaceId }: TryFetchParams): Promise<MaterializedWorkflowBundle | null> {
        const cache = cacheState(path.join(cacheUtils(basePath).getGlobalCacheBundlesPath(), workflowVersionId))
        const { state } = await cache.getOrSetCache({
            key: workflowVersionId,
            // Local-first: a cached, current-schema manifest is a hit — no RPC, no disk writes.
            cacheMiss: (value) => isNil(parseManifest(value)),
            // Cold path only: fetch over RPC and materialize compiled code to disk.
            // Any failure (RPC, signed-URL download, disk write) degrades to a MISS so
            // the caller falls back to the legacy resolve path — a bundle is an
            // optimization and must never fail the run.
            installFn: async () => {
                const { data: state, error } = await tryCatch(async () => {
                    const response = await apiClient.getWorkflowBundle({ workflowVersionId, workspaceId })
                    const data = await resolveBundleData(response)
                    if (isNil(data)) {
                        return MISS
                    }
                    const manifest = parseManifest(data.toString('utf8'))
                    if (isNil(manifest)) {
                        log.info({ workflowVersion: { id: workflowVersionId } }, 'Ignoring stale-schema workflow bundle, rebuilding')
                        return MISS
                    }
                    await materializeCode({ manifest, basePath })
                    return JSON.stringify(manifest)
                })
                if (error) {
                    log.warn({ error: String(error), workflowVersion: { id: workflowVersionId } }, 'Failed to fetch workflow bundle, falling back to resolve')
                    return MISS
                }
                return state
            },
            // Never persist a miss, so a later-published bundle is picked up on the next run.
            skipSave: (value) => value === MISS,
        })
        const manifest = parseManifest(state)
        return isNil(manifest) ? null : { workflowVersion: manifest.workflowVersion, connectors: manifest.connectors }
    },

    async publish({ workflowVersion, connectors, workspaceId, tenantId }: PublishParams): Promise<void> {
        const codes = codeCache(cacheUtils(basePath).getGlobalCodeCachePath())
        const compiledSteps = await Promise.all(workflowSteps.code(workflowVersion).map(async ({ name: stepName }) => ({
            stepName,
            compiledJs: await codes.readCompiledStep({ workflowVersionId: workflowVersion.id, stepName }),
        })))
        const manifest: WorkflowBundleManifest = { workflowVersion, connectors, codes: compiledSteps }
        const data = Buffer.from(JSON.stringify(manifest), 'utf8')
        const prepared = await apiClient.prepareWorkflowBundleUpload({
            workflowVersionId: workflowVersion.id,
            workspaceId,
            tenantId,
            size: data.length,
        })
        if (prepared.kind === 'skip') {
            return
        }
        if (prepared.kind === 'url') {
            await bundleHttp.put(prepared.url, data)
            return
        }
        await apiClient.uploadWorkflowBundle({
            workflowVersionId: workflowVersion.id,
            workspaceId,
            tenantId,
            data,
        })
    },
})

async function resolveBundleData(response: GetWorkflowBundleResponse | null): Promise<Buffer | null> {
    if (isNil(response)) {
        return null
    }
    return response.kind === 'url' ? bundleHttp.getBuffer(response.url) : response.data
}

async function materializeCode({ manifest, basePath }: MaterializeCodeParams): Promise<void> {
    const codes = codeCache(cacheUtils(basePath).getGlobalCodeCachePath())
    await Promise.all(manifest.codes.map(({ stepName, compiledJs }) =>
        codes.writeCompiledStep({ workflowVersionId: manifest.workflowVersion.id, stepName, compiledJs }),
    ))
}

function parseManifest(value: string | null): WorkflowBundleManifest | null {
    if (isNil(value) || value === MISS) {
        return null
    }
    const { data: manifest } = tryCatchSync(() => JSON.parse(value) as WorkflowBundleManifest)
    if (isNil(manifest) || manifest.workflowVersion?.schemaVersion !== LATEST_WORKFLOW_SCHEMA_VERSION) {
        return null
    }
    return manifest
}

type TryFetchParams = {
    workflowVersionId: string
    workspaceId: string
}

type PublishParams = {
    workflowVersion: WorkflowVersion
    connectors: ConnectorPackage[]
    workspaceId: string
    tenantId: string
}

type MaterializeCodeParams = {
    manifest: WorkflowBundleManifest
    basePath: string
}

type MaterializedWorkflowBundle = {
    workflowVersion: WorkflowVersion
    connectors: ConnectorPackage[]
}

type WorkflowBundleManifest = {
    workflowVersion: WorkflowVersion
    connectors: ConnectorPackage[]
    codes: CompiledCodeStep[]
}

type CompiledCodeStep = {
    stepName: string
    compiledJs: string
}
