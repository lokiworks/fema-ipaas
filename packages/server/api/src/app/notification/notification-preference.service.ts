import { isNil } from '@fema-ipaas/core-utils'
import { NotificationDeliveryChannel, NotificationPreferenceEvent, NotificationPreferences } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { userRepo } from '../user/user-service'
import { notificationPreferenceUtils } from './notification-preference-utils'

export const notificationPreferenceService = (log: FastifyBaseLogger) => ({
    async get({ userId, tenantId }: UserRef): Promise<NotificationPreferences> {
        const user = await userRepo().findOneOrFail({ where: { id: userId, tenantId }, select: ['id', 'notificationPreferences'] })
        return notificationPreferenceUtils.resolve(user.notificationPreferences)
    },

    async update({ userId, tenantId, preferences }: UserRef & { preferences: NotificationPreferences }): Promise<NotificationPreferences> {
        const resolved = notificationPreferenceUtils.resolve(preferences)
        await userRepo().update({ id: userId, tenantId }, { notificationPreferences: resolved })
        log.info({ user: { id: userId } }, '[notificationPreferenceService#update] Notification preferences updated')
        return resolved
    },

    async allows({ userId, event, channel }: AllowsParams): Promise<boolean> {
        const user = await userRepo().findOne({ where: { id: userId }, select: ['id', 'notificationPreferences'] })
        if (isNil(user)) {
            return false
        }
        return notificationPreferenceUtils.allows({ preferences: user.notificationPreferences, event, channel })
    },
})

type UserRef = {
    userId: string
    tenantId: string
}

type AllowsParams = {
    userId: string
    event: NotificationPreferenceEvent
    channel: NotificationDeliveryChannel
}
