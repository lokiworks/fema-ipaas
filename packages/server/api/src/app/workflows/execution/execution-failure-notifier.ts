import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { Execution, workflowStructureUtil, WorkflowVersion } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../../database/redis-connections'
import { domainHelper } from '../../helper/domain-helper'
import { emailService } from '../../helper/email/email-service'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'

const NOTIFICATION_WINDOW_SECONDS = 60 * 60

export const executionFailureNotifier = (log: FastifyBaseLogger) => ({
    async notifyOwner({ execution, workflowVersion }: NotifyOwnerParams): Promise<void> {
        if (!emailService(log).isConfigured()) {
            return
        }
        const project = await projectService(log).getOne(execution.projectId)
        if (isNil(project) || !project.notifyWorkflowOwnerOnFailure) {
            return
        }
        const key = `execution-failure-notified:${execution.workflowId}`
        const { error } = await tryCatch(() => distributedStore.runOnceWithin(key, NOTIFICATION_WINDOW_SECONDS, async () => {
            const owner = await userService(log).getMetaInformation({ id: project.ownerId })
            const failedStep = findFailedStep({ execution, workflowVersion })
            await emailService(log).sendWorkflowFailure({
                tenantId: project.tenantId,
                to: owner.email,
                projectName: project.displayName,
                workflowName: workflowVersion.displayName,
                runUrl: await domainHelper.getPublicUrl({ path: `projects/${execution.projectId}/runs/${execution.id}` }),
                failedAt: new Date(execution.finishTime ?? execution.created).toISOString(),
                failedStepDisplayName: failedStep.displayName,
                failedStepNumber: failedStep.number,
                failedStepMessage: failedStep.message,
            })
        }))
        if (!isNil(error)) {
            log.error({ error, workflowId: execution.workflowId }, '[executionFailureNotifier#notifyOwner] Failed to notify the project owner')
        }
    },
})

function findFailedStep({ execution, workflowVersion }: NotifyOwnerParams): FailedStepSummary {
    const failedStep = execution.failedStep
    if (isNil(failedStep)) {
        return { displayName: '', number: '', message: '' }
    }
    const stepNumber = workflowStructureUtil.getStepNumber(workflowVersion.trigger, failedStep.name)
    return {
        displayName: failedStep.displayName,
        number: isNil(stepNumber) ? '' : String(stepNumber),
        message: failedStep.message ?? '',
    }
}

type NotifyOwnerParams = {
    execution: Execution
    workflowVersion: WorkflowVersion
}

type FailedStepSummary = {
    displayName: string
    number: string
    message: string
}
