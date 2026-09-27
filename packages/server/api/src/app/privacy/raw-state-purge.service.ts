import { isNil, TenantId, tryCatch } from '@fema-ipaas/core-utils'
import { StepOutputType } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { fileService } from '../file/file.service'
import { executionRepo, executionService } from '../workflows/execution/execution-service'
import { DEFAULT_RAW_RETENTION_DAYS, privacySettingsRepo } from './privacy.service'

export const rawStatePurgeService = (log: FastifyBaseLogger) => ({
    async run(): Promise<number> {
        const configured = await privacySettingsRepo().find({ select: ['tenantId', 'rawPayloadRetentionDays'] })
        const passes = [
            ...groupByRetention(configured).map(([retentionDays, tenantIds]) => ({ retentionDays, tenantIds, exclude: false })),
            { retentionDays: DEFAULT_RAW_RETENTION_DAYS, tenantIds: configured.map((row) => row.tenantId), exclude: true },
        ]
        const purged = await passes.reduce<Promise<number>>(async (total, pass) => (await total) + await purgePass({ log, ...pass }), Promise.resolve(0))
        if (purged > 0) {
            log.info({ counts: purged }, '[rawStatePurgeService#run] Purged raw run state past its retention')
        }
        return purged
    },
})

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

const BATCH_SIZE = 200
const MAX_PER_PASS = 20_000

type PurgePass = {
    retentionDays: number
    tenantIds: TenantId[]
    exclude: boolean
}
