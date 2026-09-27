import { generateId, isNil, ProjectId, SeekPage } from '@fema-ipaas/core-utils'
import { DedupedEventStats, DedupedEventWithWorkflow, ListDedupedEventsRequestQuery } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In, LessThan } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { workflowVersionRepo } from '../../workflows/workflow-version/workflow-version.service'
import { DedupedEventEntity } from './deduped-event.entity'

export const dedupedEventRepo = repoFactory(DedupedEventEntity)

export const dedupedEventService = (log: FastifyBaseLogger) => ({
    async record({ events, retentionDays }: RecordParams): Promise<void> {
        if (events.length === 0) {
            return
        }
        const now = dayjs().toISOString()
        await dedupedEventRepo().insert(events.map((event) => ({
            id: generateId(),
            created: now,
            updated: now,
            ...event,
        })))
        const workflowIds = [...new Set(events.map((event) => event.workflowId))]
        const cutoff = dayjs().subtract(Math.min(retentionDays, MAX_RETENTION_DAYS), 'day').toISOString()
        await Promise.all(workflowIds.map((workflowId) => dedupedEventRepo().delete({ workflowId, created: LessThan(cutoff) })))
        log.info({ workflow: { id: workflowIds[0] }, count: events.length }, '[dedupedEventService#record] Recorded duplicate trigger events')
    },

    async list(query: ListDedupedEventsRequestQuery): Promise<SeekPage<DedupedEventWithWorkflow>> {
        const limit = query.limit ?? DEFAULT_PAGE_SIZE
        const offset = decodeOffset(query.cursor)
        const builder = dedupedEventRepo().createQueryBuilder('deduped_event')
            .where('deduped_event."projectId" = :projectId', { projectId: query.projectId })
        if (!isNil(query.workflowId)) {
            builder.andWhere('deduped_event."workflowId" = :workflowId', { workflowId: query.workflowId })
        }
        if (!isNil(query.createdAfter)) {
            builder.andWhere('deduped_event.created >= :createdAfter', { createdAfter: query.createdAfter })
        }
        if (!isNil(query.createdBefore)) {
            builder.andWhere('deduped_event.created <= :createdBefore', { createdBefore: query.createdBefore })
        }
        const rows = await builder
            .orderBy('deduped_event.created', 'DESC')
            .skip(offset)
            .take(limit + 1)
            .getMany()
        const page = rows.slice(0, limit)
        const names = await displayNamesOf([...new Set(page.map((row) => row.workflowVersionId))])
        return {
            data: page.map((row) => ({ ...row, workflowDisplayName: names.get(row.workflowVersionId) ?? null })),
            next: rows.length > limit ? String(offset + limit) : null,
            previous: offset > 0 ? String(Math.max(0, offset - limit)) : null,
        }
    },

    async stats({ projectId, workflowId }: { projectId: ProjectId, workflowId: string }): Promise<DedupedEventStats> {
        const since = dayjs().subtract(7, 'day').toISOString()
        const lastSevenDays = await dedupedEventRepo().createQueryBuilder('deduped_event')
            .where('deduped_event."projectId" = :projectId', { projectId })
            .andWhere('deduped_event."workflowId" = :workflowId', { workflowId })
            .andWhere('deduped_event.created >= :since', { since })
            .getCount()
        return { lastSevenDays }
    },
})

function decodeOffset(cursor: string | undefined): number {
    const offset = Number(cursor ?? 0)
    return Number.isInteger(offset) && offset > 0 ? offset : 0
}

async function displayNamesOf(versionIds: string[]): Promise<Map<string, string>> {
    if (versionIds.length === 0) {
        return new Map()
    }
    const versions = await workflowVersionRepo().find({ where: { id: In(versionIds) }, select: ['id', 'displayName'] })
    return new Map(versions.map((version) => [version.id, version.displayName]))
}

const DEFAULT_PAGE_SIZE = 20
const MAX_RETENTION_DAYS = 30

type RecordParams = {
    events: DedupedEventInput[]
    retentionDays: number
}

export type DedupedEventInput = {
    projectId: string
    workflowId: string
    workflowVersionId: string
    keyHash: string
    keyPreview: string
    keyPath: string
    windowSeconds: number
    firstExecutionId: string | null
}
