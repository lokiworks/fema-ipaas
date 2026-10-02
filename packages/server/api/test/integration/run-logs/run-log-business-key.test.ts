import { ExecutionStatus, RunEnvironment, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
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

async function seedRuns({ ctx, businessKeys }: { ctx: TestContext, businessKeys: (string | null)[] }): Promise<string[]> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, valid: true })
    await db.save('workflow_version', version)
    const executions = businessKeys.map((businessKey, index) => ({
        ...createMockExecution({
            projectId: ctx.project.id,
            workflowId: workflow.id,
            workflowVersionId: version.id,
            status: ExecutionStatus.FAILED,
            environment: RunEnvironment.PRODUCTION,
            created: dayjs().subtract(index + 1, 'minute').toISOString(),
            startTime: dayjs().subtract(index + 1, 'minute').toISOString(),
            finishTime: dayjs().subtract(index, 'minute').toISOString(),
        }),
        businessKey,
    }))
    await db.save('execution', executions)
    return executions.map((execution) => execution.id)
}

async function searchByBusinessKey({ ctx, businessKey }: { ctx: TestContext, businessKey: string }): Promise<{ id: string, businessKey: string | null }[]> {
    const response = await ctx.get('/v1/run-logs', { businessKey, time: '24h' })
    expect(response.statusCode).toBe(StatusCodes.OK)
    return response.json().data
}

describe('Run log business key search', () => {
    it('finds every run of one employee and nobody else', async () => {
        const ctx = await createTestContext(app!)
        const [first, second] = await seedRuns({ ctx, businessKeys: ['E10023', 'E10023', 'E20045', null] })

        const rows = await searchByBusinessKey({ ctx, businessKey: 'E10023' })

        expect(rows.map((row) => row.id).sort()).toEqual([first, second].sort())
        expect(rows.every((row) => row.businessKey === 'E10023')).toBe(true)
    })

    it('matches part of a key', async () => {
        const ctx = await createTestContext(app!)
        await seedRuns({ ctx, businessKeys: ['E10023', 'E10024', 'X99'] })

        const rows = await searchByBusinessKey({ ctx, businessKey: 'E100' })

        expect(rows).toHaveLength(2)
    })

    it('treats % and _ as plain characters', async () => {
        const ctx = await createTestContext(app!)
        await seedRuns({ ctx, businessKeys: ['E_1', 'EX1', 'E%1', 'EAB1'] })

        const underscore = await searchByBusinessKey({ ctx, businessKey: 'E_1' })
        const percent = await searchByBusinessKey({ ctx, businessKey: 'E%1' })

        expect(underscore.map((row) => row.businessKey)).toEqual(['E_1'])
        expect(percent.map((row) => row.businessKey)).toEqual(['E%1'])
    })

    it('finds a run by the longest business key a trigger can store', async () => {
        const ctx = await createTestContext(app!)
        const longestKey = `E${'x'.repeat(254)}`
        const [target] = await seedRuns({ ctx, businessKeys: [longestKey, `${longestKey.slice(0, 200)}other`] })

        const byKey = await searchByBusinessKey({ ctx, businessKey: longestKey })
        const byContent = await ctx.get('/v1/run-logs', { content: longestKey, time: '24h' })

        expect(longestKey).toHaveLength(255)
        expect(byKey.map((row) => row.id)).toEqual([target])
        expect(byContent.statusCode).toBe(StatusCodes.OK)
        expect(byContent.json().data.map((row: { id: string }) => row.id)).toEqual([target])
    })

    it('also surfaces the run from the general content search', async () => {
        const ctx = await createTestContext(app!)
        const [target] = await seedRuns({ ctx, businessKeys: ['APPROVAL-7788', 'APPROVAL-1'] })

        const response = await ctx.get('/v1/run-logs', { content: 'APPROVAL-7788', time: '24h' })

        expect(response.json().data.map((row: { id: string }) => row.id)).toEqual([target])
    })

    it('never shows another tenant the same key', async () => {
        const owner = await createTestContext(app!)
        const outsider = await createTestContext(app!)
        await seedRuns({ ctx: owner, businessKeys: ['E10023'] })

        const rows = await searchByBusinessKey({ ctx: outsider, businessKey: 'E10023' })

        expect(rows).toEqual([])
    })
})
