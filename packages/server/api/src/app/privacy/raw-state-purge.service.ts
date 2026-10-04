import { isNil, TenantId, tryCatch } from '@fema-ipaas/core-utils'
import { FileType, StepOutputType } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In, IsNull, LessThan, Not } from 'typeorm'
import { z } from 'zod'
import { fileRepo, fileService, getEffectiveExecutionDataRetentionDays } from '../file/file.service'
import { projectRepo } from '../project/project-repo'
import { executionRepo, executionService } from '../workflows/execution/execution-service'
import { DEFAULT_LOG_RETENTION_DAYS, DEFAULT_RAW_RETENTION_DAYS, privacySettingsRepo } from './privacy.service'

export const rawStatePurgeService = (log: FastifyBaseLogger) => ({
    async run(): Promise<number> {
        const configured = await privacySettingsRepo().find({ select: ['tenantId', 'rawPayloadRetentionDays'] })
        const passes = [
            ...groupByRetention(configured).map(([retentionDays, tenantIds]) => ({ retentionDays, tenantIds, exclude: false })),
            { retentionDays: DEFAULT_RAW_RETENTION_DAYS, tenantIds: configured.map((row) => row.tenantId), exclude: true },
        ]
        const purged = await passes.reduce<Promise<number>>(async (total, pass) => (await total) + await purgePass({ log, ...pass }), Promise.resolve(0))
        const purgedPayloads = await passes.reduce<Promise<number>>(async (total, pass) => (await total) + await purgeWebhookPayloadPass({ log, ...pass }), Promise.resolve(0))
        const scrubbed = await scrubExpiredRunMetadata()
        if (purged + purgedPayloads + scrubbed > 0) {
            log.info({ counts: purged, webhookPayloads: purgedPayloads, scrubbedRuns: scrubbed }, '[rawStatePurgeService#run] Purged raw run state, request bodies and expired run identifiers')
        }
        return purged + purgedPayloads + scrubbed
    },
})

async function scrubExpiredRunMetadata(): Promise<number> {
    const projects = await projectRepo().find({ select: ['id', 'tenantId', 'executionDataRetentionDays'] })
    const settings = await privacySettingsRepo().find({ select: ['tenantId', 'logRetentionDays'] })
    const tenantDays = new Map(settings.map((row) => [row.tenantId, row.logRetentionDays]))
    const projectIdsByDays = projects.reduce<Map<number, string[]>>((acc, project) => {
        const days = getEffectiveExecutionDataRetentionDays(Math.min(tenantDays.get(project.tenantId) ?? DEFAULT_LOG_RETENTION_DAYS, project.executionDataRetentionDays ?? Number.MAX_SAFE_INTEGER))
        return new Map(acc).set(days, [...(acc.get(days) ?? []), project.id])
    }, new Map())
    const counts = await Promise.all([...projectIdsByDays.entries()].map(async ([days, projectIds]) => {
        const boundary = dayjs().subtract(days, 'day').toISOString()
        const cleared = await executionRepo().update({ projectId: In(projectIds), created: LessThan(boundary), businessKey: Not(IsNull()) }, { businessKey: null })
        const messages = await executionRepo().query(EXPIRED_FAILED_STEP_SQL, [projectIds, boundary])
        return (cleared.affected ?? 0) + messageCount(messages)
    }))
    return counts.reduce((sum, count) => sum + count, 0)
}

function messageCount(result: unknown): number {
    return Array.isArray(result) ? result.length : 0
}

async function purgeWebhookPayloadPass({ log, retentionDays, tenantIds, exclude }: PurgePass & { log: FastifyBaseLogger }): Promise<number> {
    if (!exclude && tenantIds.length === 0) {
        return 0
    }
    const boundary = dayjs().subtract(retentionDays, 'day').toISOString()
    const where = tenantIds.length === 0 ? {} : { tenantId: exclude ? Not(In(tenantIds)) : In(tenantIds) }
    const purgeBatch = async (done: number): Promise<number> => {
        if (done >= MAX_PER_PASS) {
            return done
        }
        const files = await fileRepo().find({
            select: ['id', 'projectId'],
            where: { type: FileType.WEBHOOK_PAYLOAD, created: LessThan(boundary), ...where },
            order: { created: 'ASC' },
            take: BATCH_SIZE,
        })
        await Promise.all(files.flatMap((file) => (isNil(file.projectId) ? [] : [fileService(log).delete({ fileId: file.id, projectId: file.projectId })])))
        return files.length < BATCH_SIZE ? done + files.length : purgeBatch(done + files.length)
    }
    return purgeBatch(0)
}

async function purgePass({ log, retentionDays, tenantIds, exclude }: PurgePass & { log: FastifyBaseLogger }): Promise<number> {
    if (!exclude && tenantIds.length === 0) {
        return 0
    }
    const boundary = dayjs().subtract(retentionDays, 'day').toISOString()
    const purgeBatch = async (done: number): Promise<number> => {
        if (done >= MAX_PER_PASS) {
            return done
        }
        const query = executionRepo()
            .createQueryBuilder('execution')
            .innerJoin('project', 'project', 'project.id = execution."projectId"')
            .select('execution."logsFileId"', 'logsFileId')
            .addSelect('execution."projectId"', 'projectId')
            .where('execution."displayLogsFileId" IS NOT NULL')
            .andWhere('execution."logsFileId" IS NOT NULL')
            .andWhere('execution."finishTime" < :boundary', { boundary })
        const scoped = tenantIds.length === 0
            ? query
            : query.andWhere(exclude ? 'project."tenantId" NOT IN (:...tenantIds)' : 'project."tenantId" IN (:...tenantIds)', { tenantIds })
        const rows = await scoped.orderBy('execution."finishTime"', 'ASC').limit(BATCH_SIZE).getRawMany<{ logsFileId: string | null, projectId: string }>()
        const files = rows.flatMap((row) => (isNil(row.logsFileId) ? [] : [{ fileId: row.logsFileId, projectId: row.projectId }]))
        await Promise.all(files.map((file) => purgeRawState({ log, ...file })))
        return files.length < BATCH_SIZE ? done + files.length : purgeBatch(done + files.length)
    }
    return purgeBatch(0)
}

async function purgeRawState({ log, fileId, projectId }: { log: FastifyBaseLogger, fileId: string, projectId: string }): Promise<void> {
    const { data: steps } = await tryCatch(() => executionService(log).readStateSteps({ logsFileId: fileId, projectId }))
    const sliceIds = isNil(steps) ? [] : sliceFileIds(steps)
    await Promise.all(sliceIds.map((sliceId) => fileService(log).delete({ fileId: sliceId, projectId })))
    await fileService(log).delete({ fileId, projectId })
}

function sliceFileIds(steps: Record<string, unknown>): string[] {
    return Object.values(steps).flatMap((step) => {
        const parsed = StateStep.safeParse(step)
        if (!parsed.success) {
            return []
        }
        const ref = SliceRef.safeParse(parsed.data.output)
        if (parsed.data.outputType === StepOutputType.SLICE && ref.success) {
            return [ref.data.fileId]
        }
        const loop = LoopIterations.safeParse(parsed.data.output)
        return loop.success ? loop.data.iterations.flatMap(sliceFileIds) : []
    })
}

function groupByRetention(rows: { tenantId: TenantId, rawPayloadRetentionDays: number }[]): [number, TenantId[]][] {
    const grouped = rows.reduce<Map<number, TenantId[]>>((acc, row) => new Map(acc).set(row.rawPayloadRetentionDays, [...(acc.get(row.rawPayloadRetentionDays) ?? []), row.tenantId]), new Map())
    return [...grouped.entries()]
}

const StateStep = z.looseObject({ output: z.unknown(), outputType: z.string().optional() })
const SliceRef = z.looseObject({ fileId: z.string() })
const LoopIterations = z.looseObject({ iterations: z.array(z.record(z.string(), z.unknown())) })

const EXPIRED_FAILED_STEP_SQL = `UPDATE execution
SET "failedStep" = jsonb_set("failedStep", '{message}', '""')
WHERE "projectId" = ANY($1) AND created < $2 AND "failedStep" IS NOT NULL AND COALESCE("failedStep"->>'message', '') <> ''
RETURNING id`

const BATCH_SIZE = 200
const MAX_PER_PASS = 20_000

type PurgePass = {
    retentionDays: number
    tenantIds: TenantId[]
    exclude: boolean
}
