import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { Execution, WorkflowVersion } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { alertDispatcher } from '../alert/alert-dispatcher'
import { projectService } from '../project/project-service'
import { issueService } from './issue.service'

export const issueSideEffects = (log: FastifyBaseLogger) => ({
    async onProductionFailure({ execution, workflowVersion }: OnProductionFailureParams): Promise<void> {
        const { data: outcome, error } = await tryCatch(() => issueService(log).recordFailure({ execution, workflowVersion }))
        if (!isNil(error)) {
            log.error({ error, execution: { id: execution.id } }, '[issueSideEffects#onProductionFailure] Failed to record issue')
            return
        }
        if (isNil(outcome)) {
            return
        }
        const { error: alertError } = await tryCatch(async () => alertDispatcher(log).onIssueRecorded({
            issue: outcome.issue,
            event: outcome.event,
            counted: outcome.counted,
            tenantId: await projectService(log).getTenantId(execution.projectId),
        }))
        if (!isNil(alertError)) {
            log.error({ error: alertError, execution: { id: execution.id } }, '[issueSideEffects#onProductionFailure] Failed to dispatch alerts')
        }
    },

    async onTriggerFailure({ projectId, workflowVersion, message }: OnTriggerFailureParams): Promise<void> {
        const { data: outcome, error } = await tryCatch(() => issueService(log).recordTriggerFailure({ projectId, workflowVersion, message }))
        if (!isNil(error)) {
            log.error({ error, workflow: { id: workflowVersion.workflowId } }, '[issueSideEffects#onTriggerFailure] Failed to record issue')
            return
        }
        if (isNil(outcome)) {
            return
        }
        const { error: alertError } = await tryCatch(async () => alertDispatcher(log).onIssueRecorded({
            issue: outcome.issue,
            event: outcome.event,
            counted: outcome.counted,
            tenantId: await projectService(log).getTenantId(projectId),
        }))
        if (!isNil(alertError)) {
            log.error({ error: alertError, workflow: { id: workflowVersion.workflowId } }, '[issueSideEffects#onTriggerFailure] Failed to dispatch alerts')
        }
    },

    async onTriggerRecovered({ projectId, workflowVersion }: OnTriggerRecoveredParams): Promise<void> {
        const { error } = await tryCatch(() => issueService(log).resolveTriggerFailures({ projectId, workflowId: workflowVersion.workflowId, triggerName: workflowVersion.trigger.name }))
        if (!isNil(error)) {
            log.error({ error, workflow: { id: workflowVersion.workflowId } }, '[issueSideEffects#onTriggerRecovered] Failed to resolve trigger issues')
        }
    },
})

type OnTriggerFailureParams = {
    projectId: string
    workflowVersion: WorkflowVersion
    message: string
}

type OnTriggerRecoveredParams = {
    projectId: string
    workflowVersion: WorkflowVersion
}

type OnProductionFailureParams = {
    execution: Execution
    workflowVersion: WorkflowVersion | null
}
