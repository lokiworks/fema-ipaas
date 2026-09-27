import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { Connection, NotificationType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../database/redis-connections'
import { domainHelper } from '../helper/domain-helper'
import { emailService } from '../helper/email/email-service'
import { notificationPreferenceService } from '../notification/notification-preference.service'
import { notificationService } from '../notification/notification.service'
import { userService } from '../user/user-service'

export const connectionBrokenNotifier = (log: FastifyBaseLogger) => ({
    async notifyOwner({ connection, projectId }: NotifyOwnerParams): Promise<void> {
        const ownerId = connection.ownerId
        if (isNil(ownerId)) {
            return
        }
        const link = `/projects/${projectId}/connections?id=${connection.id}`
        const { error } = await tryCatch(() => distributedStore.runOnceWithin(`connection-broken-notified:${connection.id}`, NOTIFICATION_WINDOW_SECONDS, async () => {
            await notificationService(log).notify({
                tenantId: connection.tenantId,
                projectId,
                recipientIds: [ownerId],
                type: NotificationType.CONNECTION_BROKEN,
                title: connection.displayName,
                body: connection.connectorName,
                link,
            })
            if (!emailService(log).isConfigured()) {
                return
            }
            const allowed = await notificationPreferenceService(log).allows({ userId: ownerId, event: 'connectionBroken', channel: 'email' })
            if (!allowed) {
                return
            }
            const owner = await userService(log).getMetaInformation({ id: ownerId })
            await emailService(log).sendAlert({
                tenantId: connection.tenantId,
                to: owner.email,
                title: `Connection "${connection.displayName}" needs to be reconnected`,
                body: `The authorization of ${connection.displayName} (${connection.connectorName}) failed to refresh. Runs that use it will fail until it is reconnected.`,
                link: await domainHelper.getPublicUrl({ path: link.replace(/^\//, '') }),
            })
        }))
        if (!isNil(error)) {
            log.error({ error, connection: { id: connection.id } }, '[connectionBrokenNotifier#notifyOwner] Failed to notify the connection owner')
        }
    },
})

const NOTIFICATION_WINDOW_SECONDS = 24 * 60 * 60

type NotifyOwnerParams = {
    connection: Pick<Connection, 'id' | 'ownerId' | 'tenantId' | 'displayName' | 'connectorName'>
    projectId: string
}
