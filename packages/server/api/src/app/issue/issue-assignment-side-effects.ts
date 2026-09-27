import { isNil } from '@fema-ipaas/core-utils'
import { Issue, NotificationType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { notificationService } from '../notification/notification.service'
import { projectService } from '../project/project-service'

export const issueAssignmentSideEffects = (log: FastifyBaseLogger) => ({
    async onAssigned({ issue, assigneeId, actorId }: OnAssignedParams): Promise<void> {
        if (isNil(assigneeId) || assigneeId === actorId) {
            return
        }
        await notificationService(log).notify({
            tenantId: await projectService(log).getTenantId(issue.projectId),
            projectId: issue.projectId,
            recipientIds: [assigneeId],
            type: NotificationType.ISSUE_ASSIGNED,
            title: issue.title,
            link: `/projects/${issue.projectId}/issues/${issue.id}`,
            actorId,
        })
    },
})

type OnAssignedParams = {
    issue: Pick<Issue, 'id' | 'projectId' | 'title'>
    assigneeId: string | null
    actorId: string
}
