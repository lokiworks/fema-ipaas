import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { type Logger, wideEvent } from '@fema-ipaas/server-utils'
import { ConnectorPackage, FailedStep, LATEST_WORKFLOW_SCHEMA_VERSION, WorkerToApiContract, WorkflowVersion, WorkflowVersionState } from '@fema-ipaas/shared'
import { CodeArtifact, SandboxSettings } from '../../types'
import { connectorCache, ConnectorNotFoundError } from '../connectors/connector-cache'
import { workflowBundleStore } from './workflow-bundle-store'
import { workflowCache } from './workflow-cache'
import { workflowSteps } from './workflow-steps'

export const workflowProvisioning = (log: Logger, apiClient: WorkerToApiContract, basePath: string, getSettings: () => SandboxSettings) => ({
    async resolve({ workflow, tenantId }: ResolveParams): Promise<ResolvedWorkflow> {
        // A bundle is an optimization: never let a fetch error fail the run — fall through to resolve.
        // Timed as workflowBundleDownloadMs so a run's breakdown shows the bundle fetch cost.
        const { data: bundle, error: bundleError } = await tryCatch(() => wideEvent.timed({
            name: 'workflowBundleDownload',
            fn: () => workflowBundleStore(log, apiClient, basePath).tryFetch({
                workflowVersionId: workflow.versionId,
                workspaceId: workflow.workspaceId,
            }),
        }))
        if (bundleError) {
            log.warn({ error: String(bundleError), workflow: { id: workflow.id } }, 'Workflow bundle fetch failed, falling back to resolve')
        }
        if (!isNil(bundle)) {
            // tryFetch already wrote the compiled code to the Code Cache; nothing to compile or republish.
            return { kind: 'ready', workflowVersion: bundle.workflowVersion, connectors: bundle.connectors, code: { kind: 'materialized' }, publishBundle: null }
        }

        const workflowVersion = await workflowCache(log, apiClient, basePath).getVersion({ workflowVersionId: workflow.versionId })
        if (isNil(workflowVersion)) {
            return { kind: 'workflow-not-found' }
        }

        const { data: connectors, error } = await tryCatch(() => resolveConnectors({ workflowVersion, tenantId, log, apiClient, basePath, getSettings }))
        if (error) {
            if (!(error instanceof ConnectorNotFoundError)) {
                throw error
            }
            log.warn({ error: String(error), workflow: { id: workflow.id } }, 'Workflow disabled due to missing connector')
            const { error: disableError } = await tryCatch(() => apiClient.disableWorkflow({ workflowId: workflow.id, workspaceId: workflow.workspaceId }))
            if (disableError) {
                log.error({ error: String(disableError), workflow: { id: workflow.id } }, 'Failed to disable workflow after missing connector')
            }
            return { kind: 'disabled', failedStep: buildMissingConnectorFailedStep({ workflowVersion, missingConnector: error }) }
        }

        const shouldPublish = workflowVersion.state === WorkflowVersionState.LOCKED && workflowVersion.schemaVersion === LATEST_WORKFLOW_SCHEMA_VERSION
        return {
            kind: 'ready',
            workflowVersion,
            connectors,
            code: { kind: 'source', steps: extractCodeArtifacts(workflowVersion) },
            // The compiled code only exists on disk after install, so the caller invokes this afterwards.
            publishBundle: shouldPublish ? buildPublishBundle({ log, apiClient, basePath, workflowVersion, connectors, workspaceId: workflow.workspaceId, tenantId }) : null,
        }
    },
})

function buildPublishBundle({ log, apiClient, basePath, workflowVersion, connectors, workspaceId, tenantId }: BuildPublishBundleParams): PublishBundle {
    return async () => {
        const { error } = await tryCatch(() => workflowBundleStore(log, apiClient, basePath).publish({ workflowVersion, connectors, workspaceId, tenantId }))
        if (error) {
            log.warn({ error: String(error), workflowVersion: { id: workflowVersion.id } }, 'Failed to publish workflow bundle')
        }
    }
}

async function resolveConnectors({ workflowVersion, tenantId, log, apiClient, basePath, getSettings }: ResolveConnectorsParams): Promise<ConnectorPackage[]> {
    const stepConnectorRefs = workflowSteps.connector(workflowVersion).map((step) => ({
        connectorName: step.settings.connectorName,
        connectorVersion: step.settings.connectorVersion,
    }))
    const uniqueConnectorRefs = dedupeConnectorRefs(stepConnectorRefs)
    return Promise.all(uniqueConnectorRefs.map((ref) =>
        connectorCache(log, apiClient, basePath, getSettings).getConnector({
            connectorName: ref.connectorName,
            connectorVersion: ref.connectorVersion,
            tenantId,
        }),
    ))
}

function buildMissingConnectorFailedStep({ workflowVersion, missingConnector }: BuildMissingConnectorFailedStepParams): FailedStep {
    const connectorSteps = workflowSteps.connector(workflowVersion)
    const stepMatch = connectorSteps.find((step) => step.settings.connectorName === missingConnector.connectorName && step.settings.connectorVersion === missingConnector.connectorVersion)
    const step = stepMatch ?? workflowVersion.trigger
    return {
        name: step.name,
        displayName: step.displayName,
        message: `The connector ${missingConnector.connectorName}@${missingConnector.connectorVersion} is not installed on this instance or has been hidden by an admin, so the workflow was turned off. Install the missing connector version or update the step to an installed version, then publish and re-enable the workflow.`,
    }
}

function dedupeConnectorRefs(refs: ConnectorRef[]): ConnectorRef[] {
    const byKey = new Map<string, ConnectorRef>()
    for (const ref of refs) {
        byKey.set(`${ref.connectorName}@${ref.connectorVersion}`, ref)
    }
    return [...byKey.values()]
}

function extractCodeArtifacts(workflowVersion: WorkflowVersion): CodeArtifact[] {
    return workflowSteps.code(workflowVersion).map((step) => ({
        name: step.name,
        sourceCode: step.settings.sourceCode,
        workflowVersionId: workflowVersion.id,
        workflowVersionState: workflowVersion.state,
    }))
}

type ResolveParams = {
    workflow: { id: string, versionId: string, workspaceId: string }
    tenantId: string
}

type ResolveConnectorsParams = {
    workflowVersion: WorkflowVersion
    tenantId: string
    log: Logger
    apiClient: WorkerToApiContract
    basePath: string
    getSettings: () => SandboxSettings
}

type BuildPublishBundleParams = {
    log: Logger
    apiClient: WorkerToApiContract
    basePath: string
    workflowVersion: WorkflowVersion
    connectors: ConnectorPackage[]
    workspaceId: string
    tenantId: string
}

type ConnectorRef = {
    connectorName: string
    connectorVersion: string
}

type BuildMissingConnectorFailedStepParams = {
    workflowVersion: WorkflowVersion
    missingConnector: ConnectorNotFoundError
}

export type PublishBundle = () => Promise<void>

export type ProvisionedCode =
    | { kind: 'materialized' }
    | { kind: 'source', steps: CodeArtifact[] }

export type ResolvedWorkflow =
    | { kind: 'workflow-not-found' }
    | { kind: 'disabled', failedStep?: FailedStep }
    | { kind: 'ready', workflowVersion: WorkflowVersion, connectors: ConnectorPackage[], code: ProvisionedCode, publishBundle: PublishBundle | null }
