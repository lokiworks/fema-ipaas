import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { Execution, NotificationType, workflowStructureUtil, WorkflowVersion } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../../database/redis-connections'
import { domainHelper } from '../../helper/domain-helper'
import { emailService } from '../../helper/email/email-service'
import { notificationPreferenceService } from '../../notification/notification-preference.service'
import { notificationService } from '../../notification/notification.service'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'

const NOTIFICATION_WINDOW_SECONDS = 60 * 60

export const executionFailureNotifier = (log: FastifyBaseLogger) => ({
    async notifyOwner({ execution, workflowVersion }: NotifyOwnerParams): Promise<void> {
        const project = await projectService(log).getOne(execution.projectId)
        if (isNil(project) || !project.notifyWorkflowOwnerOnFailure) {
            return
        }
        const key = `execution-failure-notified:${execution.workflowId}`
        const { error } = await tryCatch(() => distributedStore.runOnceWithin(key, NOTIFICATION_WINDOW_SECONDS, async () => {
            const failedStep = findFailedStep({ execution, workflowVersion })
            await notificationService(log).notify({
                tenantId: project.tenantId,
                projectId: execution.projectId,
                recipientIds: [project.ownerId],
                type: NotificationType.RUN_FAILED,
                title: workflowVersion.displayName,
                body: failedStep.message.length > 0 ? `${failedStep.displayName}: ${failedStep.message}` : failedStep.displayName,
                link: `/projects/${execution.projectId}/runs/${execution.id}`,
            })
            if (!emailService(log).isConfigured()) {
                return
            }
            const emailAllowed = await notificationPreferenceService(log).allows({ userId: project.ownerId, event: 'runFailed', channel: 'email' })
            if (!emailAllowed) {
                return
            }
            const owner = await userService(log).getMetaInformation({ id: project.ownerId })
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
            log.error({ error, workflow: { id: execution.workflowId } }, '[executionFailureNotifier#notifyOwner] Failed to notify the project owner')
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
