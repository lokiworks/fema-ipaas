import { ApplicationEvent } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { applicationEvents } from '../helper/application-events'
import { rejectedPromiseHandler } from '../helper/promise-handler'
import { AuditEventData } from './audit-event.entity'
import { auditEventService } from './audit-event.service'

export function registerAuditEventListener(log: FastifyBaseLogger): void {
    applicationEvents(log).registerListeners(log, {
        userEvent: (listenerLog) => (event) => {
            rejectedPromiseHandler(persist(listenerLog, event), listenerLog)
        },
        workerEvent: (listenerLog) => (_projectId, event) => {
            rejectedPromiseHandler(persist(listenerLog, event), listenerLog)
        },
    })
}

async function persist(log: FastifyBaseLogger, event: ApplicationEvent): Promise<void> {
    await auditEventService(log).record({
        tenantId: event.tenantId,
        projectId: event.projectId,
        projectDisplayName: event.projectDisplayName,
        userId: event.userId,
        userEmail: event.userEmail,
        ip: event.ip,
        action: event.action,
        data: toAuditEventData(event.data),
    })
}

function toAuditEventData(data: unknown): AuditEventData {
    const serialized: unknown = JSON.parse(JSON.stringify(data ?? {}))
    if (typeof serialized !== 'object' || serialized === null || Array.isArray(serialized)) {
        return {}
    }
    return serialized
}
