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
            tenantId: await projectService(log).getTenantId(execution.projectId),
        }))
        if (!isNil(alertError)) {
            log.error({ error: alertError, execution: { id: execution.id } }, '[issueSideEffects#onProductionFailure] Failed to dispatch alerts')
        }
    },
})

type OnProductionFailureParams = {
    execution: Execution
    workflowVersion: WorkflowVersion | null
}
