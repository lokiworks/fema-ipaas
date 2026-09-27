import { NotificationType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { notificationService } from '../../../notification/notification.service'
import { workflowRepo } from '../../../workflows/workflow/workflow.repo'
import { workflowVersionRepo } from '../../../workflows/workflow-version/workflow-version.service'

export const lockSideEffects = (log: FastifyBaseLogger) => ({
    async onTakenOver({ resourceId, projectId, tenantId, previousUserId, actorId }: OnTakenOverParams): Promise<void> {
        const workflow = await workflowRepo().findOne({ where: { id: resourceId, projectId }, select: ['id'] })
        const version = workflow === null ? null : await workflowVersionRepo().findOne({ where: { workflowId: resourceId }, order: { created: 'DESC' }, select: ['id', 'displayName'] })
        await notificationService(log).notify({
            tenantId,
            projectId,
            recipientIds: [previousUserId],
            type: NotificationType.EDIT_LOCK_TAKEN_OVER,
            title: version?.displayName ?? '',
            link: workflow === null ? null : `/projects/${projectId}/workflows/${resourceId}`,
            actorId,
        })
    },
})

type OnTakenOverParams = {
    resourceId: string
    projectId: string
    tenantId: string
    previousUserId: string
    actorId: string
}
