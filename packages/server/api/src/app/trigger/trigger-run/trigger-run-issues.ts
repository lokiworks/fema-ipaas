import { isNil } from '@fema-ipaas/core-utils'
import { RecordTriggerRunRequest, TriggerRunStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { issueSideEffects } from '../../issue/issue-side-effects'
import { workflowVersionService } from '../../workflows/workflow-version/workflow-version.service'

export const triggerRunIssues = (log: FastifyBaseLogger) => ({
    async record({ status, workflow }: RecordTriggerRunRequest): Promise<void> {
        if (isNil(workflow)) {
            return
        }
        const workflowVersion = await workflowVersionService(log).getOne(workflow.versionId)
        if (isNil(workflowVersion)) {
            return
        }
        if (status === TriggerRunStatus.COMPLETED) {
            await issueSideEffects(log).onTriggerRecovered({ projectId: workflow.projectId, workflowVersion })
            return
        }
        await issueSideEffects(log).onTriggerFailure({
            projectId: workflow.projectId,
            workflowVersion,
            message: workflow.failureMessage ?? DEFAULT_FAILURE_MESSAGE,
        })
    },
})

const DEFAULT_FAILURE_MESSAGE = 'The trigger could not check for new events'
