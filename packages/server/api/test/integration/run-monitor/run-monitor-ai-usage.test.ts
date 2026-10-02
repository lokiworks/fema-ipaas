import { generateId } from '@fema-ipaas/core-utils'
import { AiFeature, ExecutionStatus, RunEnvironment, RunMonitorAiSource, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { db } from '../../helpers/db'
import { createMockExecution, createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function seedRun({ ctx, workflowId, versionId, environment }: { ctx: TestContext, workflowId: string, versionId: string, environment: RunEnvironment }): Promise<string> {
    const execution = createMockExecution({
        projectId: ctx.project.id,
        workflowId,
        workflowVersionId: versionId,
        status: ExecutionStatus.SUCCEEDED,
        environment,
        created: dayjs().subtract(2, 'minute').toISOString(),
        startTime: dayjs().subtract(2, 'minute').toISOString(),
        finishTime: dayjs().subtract(1, 'minute').toISOString(),
    })
    await db.save('execution', execution)
    return execution.id
}

async function seedUsage({ ctx, feature, executionId, workflowId, inputTokens, outputTokens }: SeedUsageParams): Promise<void> {
    const now = dayjs().subtract(1, 'minute').toISOString()
    await db.save('ai_usage', {
        id: generateId(),
        created: now,
        updated: now,
        projectId: ctx.project.id,
        workflowId: workflowId ?? null,
        executionId: executionId ?? null,
        userId: null,
        feature,
        provider: 'ANTHROPIC',
        model: 'claude-test',
        inputTokens,
        outputTokens,
    })
}

describe('Run monitor AI usage', () => {
    it('splits the tokens by where they were spent and counts only production runs that used AI', async () => {
        const ctx = await createTestContext(app!)
        const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
        await db.save('workflow', workflow)
        const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, valid: true })
        await db.save('workflow_version', version)
        const productionRun = await seedRun({ ctx, workflowId: workflow.id, versionId: version.id, environment: RunEnvironment.PRODUCTION })
        const otherProductionRun = await seedRun({ ctx, workflowId: workflow.id, versionId: version.id, environment: RunEnvironment.PRODUCTION })
        const debugRun = await seedRun({ ctx, workflowId: workflow.id, versionId: version.id, environment: RunEnvironment.TESTING })
        await seedUsage({ ctx, feature: AiFeature.AGENT, executionId: productionRun, workflowId: workflow.id, inputTokens: 100, outputTokens: 10 })
        await seedUsage({ ctx, feature: AiFeature.ASK_MODEL, executionId: productionRun, workflowId: workflow.id, inputTokens: 50, outputTokens: 5 })
        await seedUsage({ ctx, feature: AiFeature.AGENT, executionId: debugRun, workflowId: workflow.id, inputTokens: 30, outputTokens: 3 })
        await seedUsage({ ctx, feature: AiFeature.COPILOT, inputTokens: 20, outputTokens: 2 })
        await seedUsage({ ctx, feature: AiFeature.AUTO_MAPPING, workflowId: workflow.id, inputTokens: 10, outputTokens: 1 })
        await seedUsage({ ctx, feature: AiFeature.GENERATE_WORKFLOW, inputTokens: 5, outputTokens: 1 })

        const usage = (await ctx.get('/v1/run-monitor/ai-usage', { range: '24h', timezone: 'Asia/Shanghai' })).json()

        const bySource = Object.fromEntries(usage.bySource.map((row: { source: string, calls: number, inputTokens: number }) => [row.source, row]))
        expect(usage.totals).toEqual({ calls: 6, inputTokens: 215, outputTokens: 22 })
        expect(bySource[RunMonitorAiSource.WORKFLOW_RUN]).toMatchObject({ calls: 2, inputTokens: 150 })
        expect(bySource[RunMonitorAiSource.DEBUG_RUN]).toMatchObject({ calls: 1, inputTokens: 30 })
        expect(bySource[RunMonitorAiSource.EDITOR_ASSISTANT]).toMatchObject({ calls: 1, inputTokens: 20 })
        expect(bySource[RunMonitorAiSource.AUTO_MAPPING]).toMatchObject({ calls: 1, inputTokens: 10 })
        expect(bySource[RunMonitorAiSource.GENERATE_WORKFLOW]).toMatchObject({ calls: 1, inputTokens: 5 })
        expect(usage.runs).toBe(2)
        expect(usage.runsWithAi).toBe(1)
        expect(usage.runsWithAi).toBeLessThanOrEqual(usage.runs)
        expect(otherProductionRun).not.toBe(productionRun)
    })

    it('shows nothing for a project the user cannot see', async () => {
        const owner = await createTestContext(app!)
        const outsider = await createTestContext(app!)
        await seedUsage({ ctx: owner, feature: AiFeature.COPILOT, inputTokens: 20, outputTokens: 2 })

        const usage = (await outsider.get('/v1/run-monitor/ai-usage', { range: '24h', timezone: 'UTC' })).json()

        expect(usage.totals).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0 })
    })
})

type SeedUsageParams = {
    ctx: TestContext
    feature: AiFeature
    executionId?: string
    workflowId?: string
    inputTokens: number
    outputTokens: number
}
