import { blockedUntilMarker } from '@fema-ipaas/core-utils'
import { ExecutionStatus, RunEnvironment, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { issueSideEffects } from '../../../src/app/issue/issue-side-effects'
import { issueRepo } from '../../../src/app/issue/issue.service'
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

async function seedRateLimitedRun({ ctx, blockedUntil }: { ctx: TestContext, blockedUntil: Date }): Promise<{ issueId: string, executionId: string, workflowId: string }> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, valid: true })
    await db.save('workflow_version', version)
    await db.update('workflow', workflow.id, { updated: dayjs().subtract(20, 'minute').toISOString() })
    const message = JSON.stringify({
        __apErrorVersion: 1,
        message: blockedUntilMarker.attach({ message: 'HTTP 429: Beisen API rate limit exceeded', until: blockedUntil }),
        status: 429,
    })
    const execution = {
        ...createMockExecution({
            projectId: ctx.project.id,
            workflowId: workflow.id,
            workflowVersionId: version.id,
            status: ExecutionStatus.FAILED,
            environment: RunEnvironment.PRODUCTION,
            created: dayjs().subtract(10, 'minute').toISOString(),
            startTime: dayjs().subtract(10, 'minute').toISOString(),
            finishTime: dayjs().subtract(9, 'minute').toISOString(),
        }),
        failedStep: { name: 'step_1', displayName: 'Fetch employees', message },
    }
    await db.save('execution', execution)
    await issueSideEffects(app!.log).onProductionFailure({ execution: await db.findOneByOrFail('execution', { id: execution.id }), workflowVersion: null })
    const [issue] = await issueRepo().findBy({ projectId: ctx.project.id })
    return { issueId: issue.id, executionId: execution.id, workflowId: workflow.id }
}

describe('A failure the connector marked as blocked until a later time', () => {
    it('keeps the issue signature on the error code', async () => {
        const ctx = await createTestContext(app!)
        const { issueId, workflowId } = await seedRateLimitedRun({ ctx, blockedUntil: dayjs().add(5, 'hour').toDate() })

        const issue = await issueRepo().findOneByOrFail({ id: issueId })

        expect(issue.signature).toBe(`${workflowId}:step_1:HTTP_429`)
        expect(issue.errorCode).toBe('HTTP_429')
        expect(issue.title).toContain('HTTP 429: Beisen API rate limit exceeded')
        expect(issue.title).not.toContain('blocked-until')
    })

    it('is held back by the replay check and not replayed while the block lasts', async () => {
        const ctx = await createTestContext(app!)
        const blockedUntil = dayjs().add(5, 'hour').toDate()
        const { issueId, executionId } = await seedRateLimitedRun({ ctx, blockedUntil })

        const check = (await ctx.post(`/v1/issues/${issueId}/replay-check`, {})).json()

        expect(check.items).toHaveLength(1)
        expect(check.items[0].executionId).toBe(executionId)
        expect(check.items[0].category).toBe('BLOCKED')
        expect(check.items[0].reason).toBe('BLOCKED_UNTIL')
        expect(check.items[0].blockedUntil).toBe(blockedUntil.toISOString())

        const replay = await ctx.post(`/v1/issues/${issueId}/replay`, { strategy: 'FROM_FAILED_STEP', includeDataProblems: true })
        expect(replay.json()).toEqual({ queued: 0, skipped: 1 })
    })

    it('tells the reader not to retry before the marked time', async () => {
        const ctx = await createTestContext(app!)
        const blockedUntil = dayjs().add(5, 'hour').toDate()
        const { issueId } = await seedRateLimitedRun({ ctx, blockedUntil })

        const insight = (await ctx.get(`/v1/issues/${issueId}/insight`)).json()

        expect(insight.cause).toBe('BLOCKED_UNTIL')
        expect(insight.blockedUntil).toBe(blockedUntil.toISOString())
        const fixKinds = insight.fixes.map((fix: { kind: string }) => fix.kind)
        expect(fixKinds).not.toContain('OPEN_STEP_ERROR_HANDLING')
    })

    it('becomes replayable again once the marked time has passed', async () => {
        const ctx = await createTestContext(app!)
        const { issueId } = await seedRateLimitedRun({ ctx, blockedUntil: dayjs().subtract(1, 'minute').toDate() })

        const check = (await ctx.post(`/v1/issues/${issueId}/replay-check`, {})).json()
        const insight = (await ctx.get(`/v1/issues/${issueId}/insight`)).json()

        expect(check.items[0].category).toBe('REPLAYABLE')
        expect(check.items[0].reason).toBe('TRANSIENT_ERROR')
        expect(check.items[0].blockedUntil ?? null).toBeNull()
        expect(insight.cause).toBe('RATE_LIMITED')
    })
})
