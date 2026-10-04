import { blockedUntilMarker } from '@fema-ipaas/core-utils'
import { ExecutionStatus, RunEnvironment, RunRerunBlockReason, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
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

async function seedFailedRun({ ctx, workflowId, versionId, failedMessage }: { ctx: TestContext, workflowId: string, versionId: string, failedMessage: string }): Promise<string> {
    const execution = {
        ...createMockExecution({
            projectId: ctx.project.id,
            workflowId,
            workflowVersionId: versionId,
            status: ExecutionStatus.FAILED,
            environment: RunEnvironment.PRODUCTION,
            created: dayjs().subtract(2, 'minute').toISOString(),
            startTime: dayjs().subtract(2, 'minute').toISOString(),
            finishTime: dayjs().subtract(1, 'minute').toISOString(),
        }),
        failedStep: { name: 'step_1', displayName: 'Send', message: failedMessage },
    }
    await db.save('execution', execution)
    return execution.id
}

describe('Run logs of runs the other system rate limited', () => {
    it('hold back a rerun while the other system still refuses calls and allow it afterwards', async () => {
        const ctx = await createTestContext(app!)
        const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
        await db.save('workflow', workflow)
        const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, valid: true })
        await db.save('workflow_version', version)
        await db.update('workflow', workflow.id, { publishedVersionId: version.id })
        const blockedUntil = dayjs().add(5, 'hour')
        const blocked = await seedFailedRun({ ctx, workflowId: workflow.id, versionId: version.id, failedMessage: blockedUntilMarker.attach({ message: 'HTTP 429: too fast', until: blockedUntil.toDate() }) })
        const expired = await seedFailedRun({ ctx, workflowId: workflow.id, versionId: version.id, failedMessage: blockedUntilMarker.attach({ message: 'HTTP 429: too fast', until: dayjs().subtract(1, 'minute').toDate() }) })

        const rows = (await ctx.get('/v1/run-logs', { time: '24h', status: ExecutionStatus.FAILED })).json().data
        const rowOf = (id: string) => rows.find((row: { id: string }) => row.id === id)

        expect(rowOf(blocked).rerunBlockReason).toBe(RunRerunBlockReason.BLOCKED_UNTIL)
        expect(rowOf(blocked).fromFailedStepBlockReason).toBe(RunRerunBlockReason.BLOCKED_UNTIL)
        expect(new Date(rowOf(blocked).blockedUntil).getTime()).toBe(blockedUntil.toDate().getTime())
        expect(rowOf(expired).rerunBlockReason).toBeNull()
        expect(rowOf(expired).blockedUntil).toBeNull()
    })
})
