import { ExecutionStatus, RateLimitUnit, ReliabilityEventKind, RunEnvironment, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { reliabilityEventRepo, reliabilityEventService } from '../../../src/app/reliability/reliability-event.service'
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

async function seedWorkflow({ ctx }: { ctx: TestContext }) {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, valid: true })
    await db.save('workflow_version', version)
    await db.update('workflow', workflow.id, { publishedVersionId: version.id })
    return { workflowId: workflow.id, versionId: version.id }
}

async function seedRun({ ctx, workflowId, versionId, environment = RunEnvironment.PRODUCTION, status = ExecutionStatus.SUCCEEDED }: SeedRunParams): Promise<string> {
    const execution = createMockExecution({
        projectId: ctx.project.id,
        workflowId,
        workflowVersionId: versionId,
        status,
        environment,
        created: dayjs().subtract(2, 'minute').toISOString(),
        startTime: dayjs().subtract(2, 'minute').toISOString(),
        finishTime: dayjs().subtract(1, 'minute').toISOString(),
    })
    await db.save('execution', execution)
    return execution.id
}

function engineEvent({ workflowId, kind = ReliabilityEventKind.RATE_LIMIT_QUEUED, key, connectorName = '@fema-ipaas/connector-feishu' }: { workflowId: string, kind?: ReliabilityEventKind.RATE_LIMIT_QUEUED | ReliabilityEventKind.AUTO_RETRY, key: string, connectorName?: string }) {
    return { eventKey: key, kind, stepName: 'step_1', workflowId, errorCode: 'HTTP_429', connectorName, waitSeconds: 2 }
}

describe('Reliability events reported by the engine', () => {
    it('are stored once however often the engine uploads the same list', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const executionId = await seedRun({ ctx, workflowId, versionId })
        const events = [engineEvent({ workflowId, key: `${executionId}:a` }), engineEvent({ workflowId, key: `${executionId}:b`, kind: ReliabilityEventKind.AUTO_RETRY })]

        await reliabilityEventService(app!.log).recordEngineEvents({ projectId: ctx.project.id, executionId, events })
        await reliabilityEventService(app!.log).recordEngineEvents({ projectId: ctx.project.id, executionId, events: [...events, engineEvent({ workflowId, key: `${executionId}:c` })] })

        const stored = await reliabilityEventRepo().findBy({ projectId: ctx.project.id })
        expect(stored.map((event) => event.eventKey).sort()).toEqual([`${executionId}:a`, `${executionId}:b`, `${executionId}:c`])
        const queued = stored.find((event) => event.eventKey === `${executionId}:a`)
        expect(queued?.limitUnit).toBe(RateLimitUnit.PER_API_APP_TENANT)
        expect(stored.find((event) => event.kind === ReliabilityEventKind.AUTO_RETRY)?.limitUnit).toBeNull()
    })

    it('ignore a workflow that belongs to another project', async () => {
        const ctx = await createTestContext(app!)
        const other = await createTestContext(app!)
        const mine = await seedWorkflow({ ctx })
        const theirs = await seedWorkflow({ ctx: other })
        const executionId = await seedRun({ ctx, workflowId: mine.workflowId, versionId: mine.versionId })

        await reliabilityEventService(app!.log).recordEngineEvents({
            projectId: ctx.project.id,
            executionId,
            events: [engineEvent({ workflowId: theirs.workflowId, key: `${executionId}:x` }), engineEvent({ workflowId: mine.workflowId, key: `${executionId}:y` })],
        })

        expect((await reliabilityEventRepo().findBy({ executionId })).map((event) => event.eventKey)).toEqual([`${executionId}:y`])
        expect(await reliabilityEventRepo().countBy({ projectId: other.project.id })).toBe(0)
    })

    it('are dropped with the workflow they belong to', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const executionId = await seedRun({ ctx, workflowId, versionId })
        await reliabilityEventService(app!.log).recordEngineEvents({ projectId: ctx.project.id, executionId, events: [engineEvent({ workflowId, key: `${executionId}:a` })] })

        await databaseConnection().getRepository('workflow').delete({ id: workflowId })

        expect(await reliabilityEventRepo().countBy({ workflowId })).toBe(0)
    })
})

describe('Run monitor handled counts', () => {
    it('count production runs only, per kind, with the counting unit of each connector', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const first = await seedRun({ ctx, workflowId, versionId })
        const second = await seedRun({ ctx, workflowId, versionId })
        const debug = await seedRun({ ctx, workflowId, versionId, environment: RunEnvironment.TESTING })
        const service = reliabilityEventService(app!.log)
        await service.recordEngineEvents({ projectId: ctx.project.id, executionId: first, events: [engineEvent({ workflowId, key: `${first}:1` }), engineEvent({ workflowId, key: `${first}:2` }), engineEvent({ workflowId, key: `${first}:3`, kind: ReliabilityEventKind.AUTO_RETRY })] })
        await service.recordEngineEvents({ projectId: ctx.project.id, executionId: second, events: [engineEvent({ workflowId, key: `${second}:1`, connectorName: '@fema-ipaas/connector-beisen' })] })
        await service.recordEngineEvents({ projectId: ctx.project.id, executionId: debug, events: [engineEvent({ workflowId, key: `${debug}:1` })] })
        await service.recordCatchUp({ projectId: ctx.project.id, workflowId, executionIds: [second], gapSeconds: 400 })

        const summary = (await ctx.get('/v1/run-monitor/summary', { range: '24h', timezone: 'UTC' })).json()

        expect(summary.handled.rateLimitWaits).toBe(3)
        expect(summary.handled.rateLimitedRuns).toBe(2)
        expect(summary.handled.rateLimitSources).toEqual([
            { connectorName: '@fema-ipaas/connector-feishu', unit: RateLimitUnit.PER_API_APP_TENANT, count: 2 },
            { connectorName: '@fema-ipaas/connector-beisen', unit: RateLimitUnit.PER_ENTERPRISE, count: 1 },
        ])
        expect(summary.handled.autoRetries).toBe(1)
        expect(summary.handled.retriedRuns).toBe(1)
        expect(summary.handled.caughtUpEvents).toBe(1)
    })

    it('do not count events of another project', async () => {
        const ctx = await createTestContext(app!)
        const other = await createTestContext(app!)
        const theirs = await seedWorkflow({ ctx: other })
        const executionId = await seedRun({ ctx: other, workflowId: theirs.workflowId, versionId: theirs.versionId })
        await reliabilityEventService(app!.log).recordEngineEvents({ projectId: other.project.id, executionId, events: [engineEvent({ workflowId: theirs.workflowId, key: `${executionId}:1` })] })

        const summary = (await ctx.get('/v1/run-monitor/summary', { range: '24h', timezone: 'UTC' })).json()

        expect(summary.handled.rateLimitWaits).toBe(0)
    })
})

describe('Run logs', () => {
    it('can be narrowed to the runs the platform handled', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const queued = await seedRun({ ctx, workflowId, versionId })
        const retried = await seedRun({ ctx, workflowId, versionId })
        await seedRun({ ctx, workflowId, versionId })
        const service = reliabilityEventService(app!.log)
        await service.recordEngineEvents({ projectId: ctx.project.id, executionId: queued, events: [engineEvent({ workflowId, key: `${queued}:1` })] })
        await service.recordEngineEvents({ projectId: ctx.project.id, executionId: retried, events: [engineEvent({ workflowId, key: `${retried}:1`, kind: ReliabilityEventKind.AUTO_RETRY })] })

        const onlyQueued = (await ctx.get('/v1/run-logs', { time: '24h', handled: ReliabilityEventKind.RATE_LIMIT_QUEUED })).json().data
        const both = (await ctx.get('/v1/run-logs', { time: '24h', handled: [ReliabilityEventKind.RATE_LIMIT_QUEUED, ReliabilityEventKind.AUTO_RETRY] })).json().data

        expect(onlyQueued.map((row: { id: string }) => row.id)).toEqual([queued])
        expect(both.map((row: { id: string }) => row.id).sort()).toEqual([queued, retried].sort())
    })
})

type SeedRunParams = {
    ctx: TestContext
    workflowId: string
    versionId: string
    environment?: RunEnvironment
    status?: ExecutionStatus
}
