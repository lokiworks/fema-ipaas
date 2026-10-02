import { Execution, ExecutionStatus, IssueStatus, RunEnvironment, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { issueSideEffects } from '../../../src/app/issue/issue-side-effects'
import { issueActivityRepo, issueRepo } from '../../../src/app/issue/issue.service'
import { executionHooks } from '../../../src/app/workflows/execution/execution-hooks'
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

async function seedWorkflow({ ctx }: { ctx: TestContext }): Promise<{ workflowId: string, versionId: string }> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, valid: true })
    await db.save('workflow_version', version)
    return { workflowId: workflow.id, versionId: version.id }
}

async function seedRun({ ctx, workflowId, versionId, status, rerunOfExecutionId }: { ctx: TestContext, workflowId: string, versionId: string, status: ExecutionStatus, rerunOfExecutionId?: string }): Promise<string> {
    const execution = {
        ...createMockExecution({
            projectId: ctx.project.id,
            workflowId,
            workflowVersionId: versionId,
            status,
            environment: RunEnvironment.PRODUCTION,
            created: dayjs().subtract(1, 'minute').toISOString(),
            startTime: dayjs().subtract(1, 'minute').toISOString(),
            finishTime: dayjs().toISOString(),
        }),
        failedStep: status === ExecutionStatus.FAILED ? { name: 'step_1', displayName: 'Create account', message: JSON.stringify({ message: 'Unprocessable entity', status: 422 }) } : undefined,
        rerunOfExecutionId: rerunOfExecutionId ?? null,
    }
    await db.save('execution', execution)
    return execution.id
}

async function recordFailureOf({ executionId }: { executionId: string }): Promise<void> {
    const execution = await db.findOneByOrFail<Execution & { failedStep: { name: string, displayName: string, message: string } }>('execution', { id: executionId })
    await issueSideEffects(app!.log).onProductionFailure({ execution, workflowVersion: null })
}

async function finish({ executionId }: { executionId: string }): Promise<void> {
    const execution = await db.findOneByOrFail<Execution>('execution', { id: executionId })
    await executionHooks(app!.log).onFinish(execution)
}

async function onlyIssue({ ctx }: { ctx: TestContext }): Promise<{ id: string, status: IssueStatus }> {
    const issues = await issueRepo().find({ where: { projectId: ctx.project.id } })
    expect(issues).toHaveLength(1)
    return issues[0]
}

describe('Closing an issue once every failed run was replayed successfully', () => {
    it('stays open while some failed runs have no successful replay, then resolves itself', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const first = await seedRun({ ctx, workflowId, versionId, status: ExecutionStatus.FAILED })
        const second = await seedRun({ ctx, workflowId, versionId, status: ExecutionStatus.FAILED })
        await recordFailureOf({ executionId: first })
        await recordFailureOf({ executionId: second })

        const firstReplay = await seedRun({ ctx, workflowId, versionId, status: ExecutionStatus.SUCCEEDED, rerunOfExecutionId: first })
        await finish({ executionId: firstReplay })
        expect((await onlyIssue({ ctx })).status).toBe(IssueStatus.OPEN)

        const secondReplay = await seedRun({ ctx, workflowId, versionId, status: ExecutionStatus.SUCCEEDED, rerunOfExecutionId: second })
        await finish({ executionId: secondReplay })

        const issue = await onlyIssue({ ctx })
        expect(issue.status).toBe(IssueStatus.RESOLVED)
        const activities = await issueActivityRepo().find({ where: { issueId: issue.id } })
        expect(activities.some((activity) => (activity.data as { reason?: string } | null)?.reason === 'REPLAY_SUCCEEDED')).toBe(true)
    })

    it('does not resolve when the replay itself failed', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const failed = await seedRun({ ctx, workflowId, versionId, status: ExecutionStatus.FAILED })
        await recordFailureOf({ executionId: failed })

        const failedReplay = await seedRun({ ctx, workflowId, versionId, status: ExecutionStatus.FAILED, rerunOfExecutionId: failed })
        await finish({ executionId: failedReplay })

        expect((await onlyIssue({ ctx })).status).toBe(IssueStatus.OPEN)
    })

    it('reopens when the same failure happens again after it was resolved', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const failed = await seedRun({ ctx, workflowId, versionId, status: ExecutionStatus.FAILED })
        await recordFailureOf({ executionId: failed })
        const replay = await seedRun({ ctx, workflowId, versionId, status: ExecutionStatus.SUCCEEDED, rerunOfExecutionId: failed })
        await finish({ executionId: replay })
        expect((await onlyIssue({ ctx })).status).toBe(IssueStatus.RESOLVED)

        const again = await seedRun({ ctx, workflowId, versionId, status: ExecutionStatus.FAILED })
        await recordFailureOf({ executionId: again })

        expect((await onlyIssue({ ctx })).status).toBe(IssueStatus.OPEN)
    })

    it('ignores ordinary successful runs that are not replays', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const failed = await seedRun({ ctx, workflowId, versionId, status: ExecutionStatus.FAILED })
        await recordFailureOf({ executionId: failed })

        const fresh = await seedRun({ ctx, workflowId, versionId, status: ExecutionStatus.SUCCEEDED })
        await finish({ executionId: fresh })

        expect((await onlyIssue({ ctx })).status).toBe(IssueStatus.OPEN)
    })
})
