import { apId, isNil, SeekPage } from '@fema-ipaas/core-utils'
import { apDayjs } from '@fema-ipaas/server-utils'
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
            const now = apDayjs().toISOString()
            await auditEventRepo().insert({
                id: apId(),
                created: now,
                updated: now,
                tenantId: event.tenantId,
                workspaceId: event.workspaceId ?? null,
                workspaceDisplayName: event.workspaceDisplayName ?? null,
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
            ...(isNil(params.workspaceId) || params.workspaceId.length === 0 ? {} : { workspaceId: In(params.workspaceId) }),
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
    workspaceId?: string | null
    workspaceDisplayName?: string | null
    userId?: string | null
    userEmail?: string | null
    ip?: string | null
    action: ApplicationEventName
    data: AuditEventData
}

type ListParams = {
    tenantId: string
    workspaceId?: string[]
    action?: string[]
    userId?: string
    createdAfter?: string
    createdBefore?: string
    cursor: string | null
    limit: number
}
