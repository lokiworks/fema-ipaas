import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { Logger } from '@fema-ipaas/server-utils'
import { EngineResponseStatus, TriggerRunStatus, WorkerToApiContract, WorkflowTriggerType, WorkflowVersion } from '@fema-ipaas/shared'

export async function recordTriggerRun({ apiClient, log, workflowVersion, tenantId, status, projectId, failureMessage }: RecordTriggerRunParams): Promise<void> {
    if (workflowVersion.trigger.type !== WorkflowTriggerType.CONNECTOR) {
        return
    }
    const connectorName = workflowVersion.trigger.settings.connectorName
    const triggerRunStatus = status === EngineResponseStatus.OK ? TriggerRunStatus.COMPLETED : TriggerRunStatus.FAILED
    const workflow = isNil(projectId) ? {} : { workflow: { id: workflowVersion.workflowId, versionId: workflowVersion.id, projectId, failureMessage: triggerRunStatus === TriggerRunStatus.FAILED ? failureMessage ?? null : null } }
    const { error } = await tryCatch(() => apiClient.recordTriggerRun({ tenantId, connectorName, status: triggerRunStatus, ...workflow }))
    if (error) {
        log.warn({ error: String(error), connector: { name: connectorName }, workflowVersion: { id: workflowVersion.id } }, 'Failed to record trigger run stats')
    }
}

type RecordTriggerRunParams = {
    apiClient: WorkerToApiContract
    log: Logger
    workflowVersion: WorkflowVersion
    tenantId: string
    status: EngineResponseStatus
    projectId?: string
    failureMessage?: string
}
