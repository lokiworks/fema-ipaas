import { AiFeature, AiUsageSummary, generateId, isNil, LlmProvider, LlmUsage, ProjectId } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { SelectQueryBuilder } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { AiUsageEntity, AiUsageSchema } from './ai-usage.entity'

export const aiUsageRepo = repoFactory(AiUsageEntity)

export const aiUsageService = (log: FastifyBaseLogger) => ({
    async record({ projectId, feature, provider, model, usage, workflowId, executionId, userId }: RecordParams): Promise<void> {
        await aiUsageRepo().insert({
            id: generateId(),
            projectId,
            feature,
            provider,
            model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            workflowId: workflowId ?? null,
            executionId: executionId ?? null,
            userId: userId ?? null,
        })
    },

    async summary({ projectId, createdAfter, createdBefore }: SummaryParams): Promise<AiUsageSummary> {
        const scoped = (): SelectQueryBuilder<AiUsageSchema> => aiUsageRepo()
            .createQueryBuilder('usage')
            .select('COUNT(*)', 'calls')
            .addSelect('COALESCE(SUM(usage."inputTokens"), 0)', 'inputTokens')
            .addSelect('COALESCE(SUM(usage."outputTokens"), 0)', 'outputTokens')
            .where('usage."projectId" = :projectId', { projectId })
            .andWhere('usage.created >= :createdAfter', { createdAfter })
            .andWhere('usage.created < :createdBefore', { createdBefore })
        const [totals, byModel, byFeature, byWorkflow, daily] = await Promise.all([
            scoped().getRawOne<RawTotals>(),
            scoped().addSelect('usage.provider', 'provider').addSelect('usage.model', 'model').groupBy('usage.provider').addGroupBy('usage.model').orderBy('"outputTokens"', 'DESC').getRawMany<RawTotals & { provider: LlmProvider, model: string }>(),
            scoped().addSelect('usage.feature', 'feature').groupBy('usage.feature').getRawMany<RawTotals & { feature: AiFeature }>(),
            scoped().addSelect('usage."workflowId"', 'workflowId').andWhere('usage."workflowId" IS NOT NULL').groupBy('usage."workflowId"').orderBy('"outputTokens"', 'DESC').limit(MAX_WORKFLOWS).getRawMany<RawTotals & { workflowId: string }>(),
            scoped().addSelect('date_trunc(\'day\', usage.created)', 'day').groupBy('day').orderBy('day', 'ASC').getRawMany<RawTotals & { day: Date | string }>(),
        ])
        const names = byWorkflow.length === 0
            ? new Map<string, string>()
            : await workflowNames({ log, projectId, workflowIds: byWorkflow.map((row) => row.workflowId) })
        return {
            totals: totalsOf(totals),
            byModel: byModel.map((row) => ({ ...totalsOf(row), provider: row.provider, model: row.model })),
            byFeature: byFeature.map((row) => ({ ...totalsOf(row), feature: row.feature })),
            byWorkflow: byWorkflow.map((row) => ({ ...totalsOf(row), workflowId: row.workflowId, displayName: names.get(row.workflowId) ?? row.workflowId })),
            daily: daily.map((row) => ({ ...totalsOf(row), date: dayjs(row.day).format('YYYY-MM-DD') })),
        }
    },
})

async function workflowNames({ log, projectId, workflowIds }: { log: FastifyBaseLogger, projectId: ProjectId, workflowIds: string[] }): Promise<Map<string, string>> {
    const versions = await workflowVersionService(log).getLatestVersionsByWorkflowIds(workflowIds, projectId)
    return new Map([...versions.entries()].map(([workflowId, version]) => [workflowId, version.displayName]))
}

function totalsOf(row: RawTotals | undefined): { calls: number, inputTokens: number, outputTokens: number } {
    if (isNil(row)) {
        return { calls: 0, inputTokens: 0, outputTokens: 0 }
    }
    return { calls: Number(row.calls), inputTokens: Number(row.inputTokens), outputTokens: Number(row.outputTokens) }
}

const MAX_WORKFLOWS = 20

type RawTotals = {
    calls: string | number
    inputTokens: string | number
    outputTokens: string | number
}

type RecordParams = {
    projectId: ProjectId
    feature: AiFeature
    provider: LlmProvider
    model: string
    usage: LlmUsage
    workflowId?: string | null
    executionId?: string | null
    userId?: string | null
}

type SummaryParams = {
    projectId: ProjectId
    createdAfter: string
    createdBefore: string
}
