import { isNil, tryCatch } from '@fema/core-utils'
import { type ApLogger, wideEvent } from '@fema/server-utils'
import { ConnectorPackage, FailedStep, FlowVersion, FlowVersionState, LATEST_FLOW_SCHEMA_VERSION, WorkerToApiContract } from '@fema/shared'
import { CodeArtifact, SandboxSettings } from '../../types'
import { connectorCache, ConnectorNotFoundError } from '../connectors/connector-cache'
import { flowBundleStore } from './flow-bundle-store'
import { flowCache } from './flow-cache'
import { flowSteps } from './flow-steps'

export const flowProvisioning = (log: ApLogger, apiClient: WorkerToApiContract, basePath: string, getSettings: () => SandboxSettings) => ({
    async resolve({ flow, platformId }: ResolveParams): Promise<ResolvedFlow> {
        // A bundle is an optimization: never let a fetch error fail the run — fall through to resolve.
        // Timed as flowBundleDownloadMs so a run's breakdown shows the bundle fetch cost.
        const { data: bundle, error: bundleError } = await tryCatch(() => wideEvent.timed({
            name: 'flowBundleDownload',
            fn: () => flowBundleStore(log, apiClient, basePath).tryFetch({
                flowVersionId: flow.versionId,
                workspaceId: flow.workspaceId,
            }),
        }))
        if (bundleError) {
            log.warn({ error: String(bundleError), flow: { id: flow.id } }, 'Flow bundle fetch failed, falling back to resolve')
        }
        if (!isNil(bundle)) {
            // tryFetch already wrote the compiled code to the Code Cache; nothing to compile or republish.
            return { kind: 'ready', flowVersion: bundle.flowVersion, connectors: bundle.connectors, code: { kind: 'materialized' }, publishBundle: null }
        }

        const flowVersion = await flowCache(log, apiClient, basePath).getVersion({ flowVersionId: flow.versionId })
        if (isNil(flowVersion)) {
            return { kind: 'flow-not-found' }
        }

        const { data: connectors, error } = await tryCatch(() => resolveConnectors({ flowVersion, platformId, log, apiClient, basePath, getSettings }))
        if (error) {
            if (!(error instanceof ConnectorNotFoundError)) {
                throw error
            }
            log.warn({ error: String(error), flow: { id: flow.id } }, 'Flow disabled due to missing connector')
            const { error: disableError } = await tryCatch(() => apiClient.disableFlow({ flowId: flow.id, workspaceId: flow.workspaceId }))
            if (disableError) {
                log.error({ error: String(disableError), flow: { id: flow.id } }, 'Failed to disable flow after missing connector')
            }
            return { kind: 'disabled', failedStep: buildMissingConnectorFailedStep({ flowVersion, missingConnector: error }) }
        }

        const shouldPublish = flowVersion.state === FlowVersionState.LOCKED && flowVersion.schemaVersion === LATEST_FLOW_SCHEMA_VERSION
        return {
            kind: 'ready',
            flowVersion,
            connectors,
            code: { kind: 'source', steps: extractCodeArtifacts(flowVersion) },
            // The compiled code only exists on disk after install, so the caller invokes this afterwards.
            publishBundle: shouldPublish ? buildPublishBundle({ log, apiClient, basePath, flowVersion, connectors, workspaceId: flow.workspaceId, platformId }) : null,
        }
    },
})

function buildPublishBundle({ log, apiClient, basePath, flowVersion, connectors, workspaceId, platformId }: BuildPublishBundleParams): PublishBundle {
    return async () => {
        const { error } = await tryCatch(() => flowBundleStore(log, apiClient, basePath).publish({ flowVersion, connectors, workspaceId, platformId }))
        if (error) {
            log.warn({ error: String(error), flowVersion: { id: flowVersion.id } }, 'Failed to publish flow bundle')
        }
    }
}

async function resolveConnectors({ flowVersion, platformId, log, apiClient, basePath, getSettings }: ResolveConnectorsParams): Promise<ConnectorPackage[]> {
    const stepConnectorRefs = flowSteps.connector(flowVersion).map((step) => ({
        connectorName: step.settings.connectorName,
        connectorVersion: step.settings.connectorVersion,
    }))
    const uniqueConnectorRefs = dedupeConnectorRefs(stepConnectorRefs)
    return Promise.all(uniqueConnectorRefs.map((ref) =>
        connectorCache(log, apiClient, basePath, getSettings).getConnector({
            connectorName: ref.connectorName,
            connectorVersion: ref.connectorVersion,
            platformId,
        }),
    ))
}

function buildMissingConnectorFailedStep({ flowVersion, missingConnector }: BuildMissingConnectorFailedStepParams): FailedStep {
    const connectorSteps = flowSteps.connector(flowVersion)
    const stepMatch = connectorSteps.find((step) => step.settings.connectorName === missingConnector.connectorName && step.settings.connectorVersion === missingConnector.connectorVersion)
    const step = stepMatch ?? flowVersion.trigger
    return {
        name: step.name,
        displayName: step.displayName,
        message: `The connector ${missingConnector.connectorName}@${missingConnector.connectorVersion} is not installed on this instance or has been hidden by an admin, so the flow was turned off. Install the missing connector version or update the step to an installed version, then publish and re-enable the flow.`,
    }
}

function dedupeConnectorRefs(refs: ConnectorRef[]): ConnectorRef[] {
    const byKey = new Map<string, ConnectorRef>()
    for (const ref of refs) {
        byKey.set(`${ref.connectorName}@${ref.connectorVersion}`, ref)
    }
    return [...byKey.values()]
}

function extractCodeArtifacts(flowVersion: FlowVersion): CodeArtifact[] {
    return flowSteps.code(flowVersion).map((step) => ({
        name: step.name,
        sourceCode: step.settings.sourceCode,
        flowVersionId: flowVersion.id,
        flowVersionState: flowVersion.state,
    }))
}

type ResolveParams = {
    flow: { id: string, versionId: string, workspaceId: string }
    platformId: string
}

type ResolveConnectorsParams = {
    flowVersion: FlowVersion
    platformId: string
    log: ApLogger
    apiClient: WorkerToApiContract
    basePath: string
    getSettings: () => SandboxSettings
}

type BuildPublishBundleParams = {
    log: ApLogger
    apiClient: WorkerToApiContract
    basePath: string
    flowVersion: FlowVersion
    connectors: ConnectorPackage[]
    workspaceId: string
    platformId: string
}

type ConnectorRef = {
    connectorName: string
    connectorVersion: string
}

type BuildMissingConnectorFailedStepParams = {
    flowVersion: FlowVersion
    missingConnector: ConnectorNotFoundError
}

export type PublishBundle = () => Promise<void>

export type ProvisionedCode =
    | { kind: 'materialized' }
    | { kind: 'source', steps: CodeArtifact[] }

export type ResolvedFlow =
    | { kind: 'flow-not-found' }
    | { kind: 'disabled', failedStep?: FailedStep }
    | { kind: 'ready', flowVersion: FlowVersion, connectors: ConnectorPackage[], code: ProvisionedCode, publishBundle: PublishBundle | null }
