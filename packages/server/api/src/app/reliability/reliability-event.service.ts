import { generateId, isNil, ProjectId, tryCatch } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import { rateLimitUnitUtils, ReliabilityEventKind, ReliabilityEventReport } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In, LessThan } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { ReliabilityEventEntity, ReliabilityEventRecord } from './reliability-event.entity'

export const reliabilityEventRepo = repoFactory(ReliabilityEventEntity)

export const reliabilityEventService = (log: FastifyBaseLogger) => ({
    async recordEngineEvents({ projectId, executionId, events }: RecordEngineEventsParams): Promise<void> {
        if (events.length === 0) {
            return
        }
        const workflowIds = [...new Set(events.map((event) => event.workflowId))]
        const owned = await workflowRepo().find({ where: { id: In(workflowIds), projectId }, select: ['id'] })
        const ownedIds = new Set(owned.map((workflow) => workflow.id))
        const rows = events
            .filter((event) => ownedIds.has(event.workflowId))
            .map((event) => buildRow({
                projectId,
                workflowId: event.workflowId,
                executionId,
                kind: event.kind,
                eventKey: event.eventKey,
                stepName: event.stepName,
                connectorName: event.connectorName ?? null,
                limitUnit: event.kind === ReliabilityEventKind.RATE_LIMIT_QUEUED ? rateLimitUnitUtils.of({ connectorName: event.connectorName }) : null,
                errorCode: event.errorCode ?? null,
                reason: event.reason ?? null,
                waitSeconds: isNil(event.waitSeconds) ? null : Math.round(event.waitSeconds),
                gapSeconds: null,
            }))
        await insertIgnoringDuplicates({ rows, log })
        await purgeExpired({ workflowIds: [...ownedIds], projectId })
    },

    async recordCatchUp({ projectId, workflowId, executionIds, gapSeconds }: RecordCatchUpParams): Promise<void> {
        if (executionIds.length === 0) {
            return
        }
        const rows = executionIds.map((executionId) => buildRow({
            projectId,
            workflowId,
            executionId,
            kind: ReliabilityEventKind.CATCH_UP,
            eventKey: `${executionId}:${ReliabilityEventKind.CATCH_UP}`,
            stepName: null,
            connectorName: null,
            limitUnit: null,
            errorCode: null,
            reason: null,
            waitSeconds: null,
            gapSeconds: Math.round(gapSeconds),
        }))
        await insertIgnoringDuplicates({ rows, log })
        await purgeExpired({ workflowIds: [workflowId], projectId })
    },
})

function buildRow(row: Omit<ReliabilityEventRecord, 'id' | 'created' | 'updated'>): ReliabilityEventRecord {
    const now = dayjsUtil().toISOString()
    return { id: generateId(), created: now, updated: now, ...row }
}

async function insertIgnoringDuplicates({ rows, log }: { rows: ReliabilityEventRecord[], log: FastifyBaseLogger }): Promise<void> {
    if (rows.length === 0) {
        return
    }
    const { error } = await tryCatch(() => reliabilityEventRepo().createQueryBuilder().insert().values(rows).orIgnore().execute())
    if (!isNil(error)) {
        log.error({ error, count: rows.length }, '[reliabilityEventService#insert] Failed to record reliability events')
    }
}

async function purgeExpired({ workflowIds, projectId }: { workflowIds: string[], projectId: ProjectId }): Promise<void> {
    const cutoff = dayjsUtil().subtract(system.getNumberOrThrow(AppSystemProp.EXECUTION_DATA_RETENTION_DAYS), 'day').toISOString()
    await reliabilityEventRepo().delete({ projectId, workflowId: In(workflowIds), created: LessThan(cutoff) })
}

type RecordEngineEventsParams = {
    projectId: ProjectId
    executionId: string
    events: ReliabilityEventReport[]
}

type RecordCatchUpParams = {
    projectId: ProjectId
    workflowId: string
    executionIds: string[]
    gapSeconds: number
}

