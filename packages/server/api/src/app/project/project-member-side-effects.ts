import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { NotificationType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { emailService } from '../helper/email/email-service'
import { notificationPreferenceService } from '../notification/notification-preference.service'
import { notificationService } from '../notification/notification.service'
import { userRepo } from '../user/user-service'
import { projectService } from './project-service'

export const projectMemberSideEffects = (log: FastifyBaseLogger) => ({
    async onMemberAdded({ projectId, userId, role, actorId }: OnMemberAddedParams): Promise<void> {
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
            type: NotificationType.PROJECT_MEMBER_ADDED,
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

type OnMemberAddedParams = {
    projectId: string
    userId: string
    role: string
    actorId: string | null
}

type EmailParams = {
    log: FastifyBaseLogger
    userId: string
    tenantId: string
    projectId: string
    projectName: string
    role: string
}
