import { isNil, tryCatch, unique } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, NotificationResolution, NotificationType, Project, ProjectAccessRequest, ProjectAccessRequestStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { notificationService } from '../notification/notification.service'
import { notificationUtils } from '../notification/notification-utils'
import { projectAccessRequestService } from './project-access-request.service'
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
            link: `/projects/${project.id}/home?share=1&accessRequest=${request.id}`,
            actorId: request.userId,
            subjectId: request.id,
        })
    },

    async onDecided({ request, project, actorId }: RequestRef & { actorId: string }): Promise<void> {
        await resolveRequestNotifications({ log, requests: [request] })
        if (request.status !== ProjectAccessRequestStatus.REJECTED) {
            return
        }
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

    async onWithdrawn({ request }: { request: ProjectAccessRequest }): Promise<void> {
        await resolveRequestNotifications({ log, requests: [request] })
    },

    async onRequesterRemoved({ tenantId, userId }: { tenantId: string, userId: string }): Promise<void> {
        const { data: closed, error } = await tryCatch(() => projectAccessRequestService(log).closeForRequester({ tenantId, userId }))
        if (!isNil(error)) {
            log.warn({ error, user: { id: userId } }, '[projectAccessRequestSideEffects#onRequesterRemoved] Failed to close pending access requests')
            return
        }
        await resolveNotifications({
            log,
            tenantId,
            subjectIds: (closed ?? []).map((request) => request.id),
            resolution: NotificationResolution.REQUESTER_REMOVED,
        })
    },

    async onProjectDeleted({ tenantId, projectId }: { tenantId: string, projectId: string }): Promise<void> {
        const { error } = await tryCatch(() => notificationService(log).resolveByProject({
            tenantId,
            projectId,
            type: NotificationType.PROJECT_ACCESS_REQUESTED,
            resolution: NotificationResolution.PROJECT_DELETED,
        }))
        if (!isNil(error)) {
            log.warn({ error, project: { id: projectId } }, '[projectAccessRequestSideEffects#onProjectDeleted] Failed to resolve access request notifications')
        }
    },
})

async function resolveRequestNotifications({ log, requests }: { log: FastifyBaseLogger, requests: ProjectAccessRequest[] }): Promise<void> {
    await Promise.all(requests.map(async (request) => {
        const resolution = notificationUtils.accessRequestResolution(request.status)
        if (isNil(resolution)) {
            return
        }
        await resolveNotifications({ log, tenantId: request.tenantId, subjectIds: [request.id], resolution })
    }))
}

async function resolveNotifications({ log, tenantId, subjectIds, resolution }: ResolveParams): Promise<void> {
    const { error } = await tryCatch(() => notificationService(log).resolveBySubject({
        tenantId,
        type: NotificationType.PROJECT_ACCESS_REQUESTED,
        subjectIds,
        resolution,
    }))
    if (!isNil(error)) {
        log.warn({ error, notification: { type: NotificationType.PROJECT_ACCESS_REQUESTED } }, '[projectAccessRequestSideEffects] Failed to resolve access request notifications')
    }
}

type RequestRef = {
    request: ProjectAccessRequest
    project: Project
}

type ResolveParams = {
    log: FastifyBaseLogger
    tenantId: string
    subjectIds: string[]
    resolution: NotificationResolution
}
