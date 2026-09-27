import { SeekPage, TenantId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import { AlertRecord, AlertRecordStats, ListAlertRecordsRequestQuery } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { MoreThanOrEqual } from 'typeorm'
import { alertRecordRepo } from './alert-dispatcher'
import { AlertRecordSchema } from './alert.entity'

export const alertRecordService = (_log: FastifyBaseLogger) => ({
    async list({ tenantId, query }: ListParams): Promise<SeekPage<AlertRecord>> {
        const limit = query.limit ?? DEFAULT_PAGE_SIZE
        const offset = decodeOffset(query.cursor)
        const rows = await alertRecordRepo().find({
            where: {
                tenantId,
                ...(query.policyId === undefined ? {} : { policyId: query.policyId }),
                ...(query.kind === undefined ? {} : { kind: query.kind }),
            },
            order: { created: 'DESC' },
            skip: offset,
            take: limit + 1,
        })
        return {
            data: rows.slice(0, limit).map(toResponse),
            next: rows.length > limit ? String(offset + limit) : null,
            previous: offset > 0 ? String(Math.max(0, offset - limit)) : null,
        }
    },

    async stats({ tenantId, projectId }: StatsParams): Promise<AlertRecordStats> {
        const since = dayjsUtil().subtract(7, 'day').toISOString()
        const rows = await alertRecordRepo().find({
            where: {
                tenantId,
                created: MoreThanOrEqual(since),
                ...(projectId === undefined ? {} : { projectId }),
            },
            select: ['id', 'issueId', 'mergedCount'],
        })
        return {
            alertsLast7Days: rows.length,
            mergedFailuresLast7Days: rows.reduce((sum, row) => sum + row.mergedCount, 0),
            issuesLast7Days: new Set(rows.map((row) => row.issueId).filter((id) => id !== null)).size,
        }
    },

    async listForIssue({ tenantId, issueId }: { tenantId: TenantId, issueId: string }): Promise<AlertRecord[]> {
        const rows = await alertRecordRepo().find({ where: { tenantId, issueId }, order: { created: 'DESC' }, take: 50 })
        return rows.map(toResponse)
    },
})

function toResponse(record: AlertRecordSchema): AlertRecord {
    return {
        id: record.id,
        created: record.created,
        updated: record.updated,
        tenantId: record.tenantId,
        policyId: record.policyId,
        projectId: record.projectId,
        issueId: record.issueId,
        kind: record.kind,
        channelIds: record.channelIds,
        mergedCount: record.mergedCount,
        status: record.status,
        scheduledAt: record.scheduledAt,
        sentAt: record.sentAt,
        error: record.error,
        summary: record.summary,
    }
}

function decodeOffset(cursor: string | undefined): number {
    const parsed = Number(cursor)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

const DEFAULT_PAGE_SIZE = 20

type ListParams = {
    tenantId: TenantId
    query: ListAlertRecordsRequestQuery
}

type StatsParams = {
    tenantId: TenantId
    projectId: string | undefined
}
