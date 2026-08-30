import { generateId, isNil, SeekPage } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import { ApplicationEventName } from '@fema-ipaas/shared'

import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { Order } from '../helper/pagination/paginator'
import { AuditEventData, AuditEventEntity, AuditEventRow } from './audit-event.entity'
import { auditEventRepo } from './audit-event.repo'

export const auditEventService = (log: FastifyBaseLogger) => ({
    async record(event: RecordableEvent): Promise<void> {
        try {
            const now = dayjsUtil().toISOString()
            await auditEventRepo().insert({
                id: generateId(),
                created: now,
                updated: now,
                tenantId: event.tenantId,
                projectId: event.projectId ?? null,
                projectDisplayName: event.projectDisplayName ?? null,
                userId: event.userId ?? null,
                userEmail: event.userEmail ?? null,
                ip: event.ip ?? null,
                action: event.action,
                data: event.data,
            })
        }
        catch (error) {
            log.error({ error, action: event.action }, 'failed to record audit event')
        }
    },

    async list(params: ListParams): Promise<SeekPage<AuditEventRow>> {
        const decodedCursor = paginationHelper.decodeCursor(params.cursor)
        const paginator = buildPaginator({
            entity: AuditEventEntity,
            query: {
                limit: params.limit,
                order: Order.DESC,
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        let query = auditEventRepo().createQueryBuilder('audit_event').where({
            tenantId: params.tenantId,
            ...(isNil(params.projectId) || params.projectId.length === 0 ? {} : { projectId: In(params.projectId) }),
            ...(isNil(params.action) || params.action.length === 0 ? {} : { action: In(params.action) }),
            ...(isNil(params.userId) ? {} : { userId: params.userId }),
        })
        if (!isNil(params.createdAfter)) {
            query = query.andWhere('audit_event.created >= :createdAfter', { createdAfter: params.createdAfter })
        }
        if (!isNil(params.createdBefore)) {
            query = query.andWhere('audit_event.created <= :createdBefore', { createdBefore: params.createdBefore })
        }
        const { data, cursor } = await paginator.paginate(query)
        return paginationHelper.createPage<AuditEventRow>(data, cursor)
    },
})

type RecordableEvent = {
    tenantId: string
    projectId?: string | null
    projectDisplayName?: string | null
    userId?: string | null
    userEmail?: string | null
    ip?: string | null
    action: ApplicationEventName
    data: AuditEventData
}

type ListParams = {
    tenantId: string
    projectId?: string[]
    action?: string[]
    userId?: string
    createdAfter?: string
    createdBefore?: string
    cursor: string | null
    limit: number
}
