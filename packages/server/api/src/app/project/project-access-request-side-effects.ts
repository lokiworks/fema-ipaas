import { unique } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, NotificationType, Project, ProjectAccessRequest } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { notificationService } from '../notification/notification.service'
import { projectMemberRepo } from './project-member.repo'

export const projectAccessRequestSideEffects = (log: FastifyBaseLogger) => ({
    async onRequested({ request, project }: RequestRef): Promise<void> {
        const admins = await projectMemberRepo().find({
            where: { projectId: project.id, role: DefaultProjectRole.ADMIN },
            select: ['userId'],
        })
        await notificationService(log).notify({
            tenantId: project.tenantId,
            projectId: project.id,
            recipientIds: unique([project.ownerId, ...admins.map((admin) => admin.userId)]),
            type: NotificationType.PROJECT_ACCESS_REQUESTED,
            title: project.displayName,
            body: request.reason ?? null,
            link: `/projects/${project.id}/home?share=1`,
            actorId: request.userId,
        })
    },

    async onRejected({ request, project, actorId }: RequestRef & { actorId: string }): Promise<void> {
        await notificationService(log).notify({
            tenantId: project.tenantId,
            projectId: project.id,
            recipientIds: [request.userId],
            type: NotificationType.PROJECT_ACCESS_REJECTED,
            title: project.displayName,
            link: '/projects',
            actorId,
        })
    },
})

type RequestRef = {
    request: ProjectAccessRequest
    project: Project
}
