import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { ApplicationEventName, NotificationType, ProjectMember } from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { applicationEvents } from '../helper/application-events'
import { emailService } from '../helper/email/email-service'
import { notificationPreferenceService } from '../notification/notification-preference.service'
import { notificationService } from '../notification/notification.service'
import { userRepo } from '../user/user-service'
import { projectService } from './project-service'

export const projectMemberSideEffects = (log: FastifyBaseLogger) => ({
    async recordMemberUpserted({ request, member, email, alreadyMember, notificationType }: RecordMemberUpsertedParams): Promise<void> {
        applicationEvents(log).sendUserEvent(request, {
            action: ApplicationEventName.MEMBER_ADDED,
            data: { member: { userId: member.userId, role: member.role, email } },
        }, { projectId: member.projectId })
        if (!alreadyMember) {
            await this.onMemberAdded({ projectId: member.projectId, userId: member.userId, role: member.role, actorId: request.principal.id, notificationType })
        }
    },

    async onMemberAdded({ projectId, userId, role, actorId, notificationType = NotificationType.PROJECT_MEMBER_ADDED }: OnMemberAddedParams): Promise<void> {
        if (userId === actorId) {
            return
        }
        const project = await projectService(log).getOne(projectId)
        if (isNil(project)) {
            return
        }
        await notificationService(log).notify({
            tenantId: project.tenantId,
            projectId,
            recipientIds: [userId],
            type: notificationType,
            title: project.displayName,
            body: role,
            link: `/projects/${projectId}/automations`,
            actorId,
        })
        const { error } = await tryCatch(() => emailIfAllowed({ log, userId, tenantId: project.tenantId, projectId, projectName: project.displayName, role }))
        if (!isNil(error)) {
            log.error({ error, project: { id: projectId }, user: { id: userId } }, '[projectMemberSideEffects#onMemberAdded] Failed to send the member email')
        }
    },

    async findUserIdByEmail({ email, tenantId }: { email: string, tenantId: string }): Promise<string | null> {
        const identity = await userIdentityService(log).getIdentityByEmail(email)
        if (isNil(identity)) {
            return null
        }
        const user = await userRepo().findOneBy({ identityId: identity.id, tenantId })
        return user?.id ?? null
    },
})

async function emailIfAllowed({ log, userId, tenantId, projectId, projectName, role }: EmailParams): Promise<void> {
    if (!emailService(log).isConfigured()) {
        return
    }
    const allowed = await notificationPreferenceService(log).allows({ userId, event: 'projectMemberAdded', channel: 'email' })
    if (!allowed) {
        return
    }
    const user = await userRepo().findOne({ where: { id: userId, tenantId }, relations: { identity: true } })
    if (isNil(user?.identity)) {
        return
    }
    await emailService(log).sendProjectAccessGranted({ tenantId, to: user.identity.email, projectId, projectName, role })
}

type MemberAddedNotification = NotificationType.PROJECT_MEMBER_ADDED | NotificationType.PROJECT_ACCESS_APPROVED

type RecordMemberUpsertedParams = {
    request: FastifyRequest
    member: ProjectMember
    email: string | undefined
    alreadyMember: boolean
    notificationType?: MemberAddedNotification
}

type OnMemberAddedParams = {
    projectId: string
    userId: string
    role: string
    actorId: string | null
    notificationType?: MemberAddedNotification
}

type EmailParams = {
    log: FastifyBaseLogger
    userId: string
    tenantId: string
    projectId: string
    projectName: string
    role: string
}
