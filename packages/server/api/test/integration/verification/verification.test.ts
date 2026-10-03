import { ExecutionStatus, IssueKind, IssueStatus, RunEnvironment, StepOutput, WorkflowActionType, WorkflowStatus, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { ActionRunStatus } from '../../../src/app/action-run/action-run.service'
import { issueRepo } from '../../../src/app/issue/issue.service'
import { verificationService } from '../../../src/app/verification/verification.service'
import { db } from '../../helpers/db'
import { createMockExecution, createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

const readBack = vi.fn()
const stepsOf = new Map<string, Record<string, StepOutput>>()
let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(() => {
    readBack.mockReset()
    stepsOf.clear()
})

function feishuStep({ name, actionName, input }: { name: string, actionName: string, input: Record<string, unknown> }) {
    return {
        type: WorkflowActionType.CONNECTOR,
        name,
        valid: true,
        displayName: name,
        lastUpdatedDate: dayjs().toISOString(),
        settings: {
            connectorName: '@fema-ipaas/connector-feishu',
            connectorVersion: '0.4.0',
            actionName,
            input: { auth: '{{connections[\'feishu-main\']}}', ...input },
            propertySettings: {},
        },
    } as const
}

async function seedWorkflow({ ctx, name, actionName }: { ctx: TestContext, name: string, actionName: string }): Promise<{ workflowId: string, versionId: string }> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({
        workflowId: workflow.id,
        displayName: name,
        state: WorkflowVersionState.LOCKED,
        valid: true,
        trigger: {
            type: WorkflowTriggerType.EMPTY,
            name: 'trigger',
            settings: {},
            valid: true,
            displayName: 'Trigger',
            lastUpdatedDate: dayjs().toISOString(),
            nextAction: feishuStep({ name: 'write', actionName, input: {} }),
        },
    })
    await db.save('workflow_version', version)
    return { workflowId: workflow.id, versionId: version.id }
}

async function seedRun({ ctx, workflowId, versionId, businessKey, minutesAgo = 5, stepInput, stepOutput, environment = RunEnvironment.PRODUCTION }: SeedRunParams): Promise<string> {
    const execution = {
        ...createMockExecution({
            projectId: ctx.project.id,
            workflowId,
            workflowVersionId: versionId,
            status: ExecutionStatus.SUCCEEDED,
            environment,
            created: dayjs().subtract(minutesAgo + 1, 'minute').toISOString(),
            startTime: dayjs().subtract(minutesAgo + 1, 'minute').toISOString(),
            finishTime: dayjs().subtract(minutesAgo, 'minute').toISOString(),
        }),
        businessKey,
    }
    await db.save('execution', execution)
    stepsOf.set(execution.id, { write: { status: 'SUCCEEDED', type: 'CONNECTOR', input: stepInput, output: stepOutput } as StepOutput })
    return execution.id
}

async function verify(ctx: TestContext) {
    return verificationService(app!.log, {
        runConnectorAction: (params) => readBack(params),
        readSteps: ({ execution }) => Promise.resolve(stepsOf.get(execution.id) ?? null),
    }).run({ projectId: ctx.project.id, tenantId: ctx.tenant.id })
}

function feishuReturns(output: Record<string, unknown>) {
    readBack.mockResolvedValue({ status: ActionRunStatus.SUCCEEDED, output, errorMessage: null, neverStarted: false, durationMs: 1 })
}

describe('Reading back what recent runs wrote', () => {
    it('opens a drift issue naming the person when the account is in another department', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx, name: 'Onboard', actionName: 'provision_user' })
        await seedRun({ ctx, workflowId, versionId, businessKey: 'E1001', stepInput: { departmentId: 'od-rd' }, stepOutput: { open_id: 'ou_1', created: true } })
        feishuReturns({ department_ids: ['od-hr'] })

        const result = await verify(ctx)

        expect(result).toMatchObject({ checked: 1, matched: 0, mismatched: 1, unreadable: 0 })
        const [issue] = await issueRepo().find({ where: { projectId: ctx.project.id } })
        expect(issue).toMatchObject({ kind: IssueKind.DRIFT, status: IssueStatus.OPEN, errorCode: 'RESULT_MISMATCH', workflowId })
        expect(issue.message).toContain('E1001')
        expect(readBack.mock.calls[0][0]).toMatchObject({ actionName: 'get_user', input: { openId: 'ou_1', auth: '{{connections[\'feishu-main\']}}' } })
    })

    it('does not count the same drifted run twice and resolves the issue once Feishu agrees', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx, name: 'Onboard', actionName: 'provision_user' })
        await seedRun({ ctx, workflowId, versionId, businessKey: 'E1001', stepInput: { departmentId: 'od-rd' }, stepOutput: { open_id: 'ou_1' } })
        feishuReturns({ department_ids: ['od-hr'] })
        await verify(ctx)
        await verify(ctx)
        expect((await issueRepo().find({ where: { projectId: ctx.project.id } }))[0].occurrences).toBe(1)

        feishuReturns({ department_ids: ['od-rd'] })
        const result = await verify(ctx)

        expect(result).toMatchObject({ matched: 1, mismatched: 0 })
        expect((await issueRepo().find({ where: { projectId: ctx.project.id } }))[0].status).toBe(IssueStatus.RESOLVED)
    })

    it('counts each drifted person once on the same issue', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx, name: 'Onboard', actionName: 'provision_user' })
        await seedRun({ ctx, workflowId, versionId, businessKey: 'E1001', stepInput: { departmentId: 'od-rd' }, stepOutput: { open_id: 'ou_1' } })
        await seedRun({ ctx, workflowId, versionId, businessKey: 'E1002', stepInput: { departmentId: 'od-rd' }, stepOutput: { open_id: 'ou_2' } })
        feishuReturns({ department_ids: ['od-hr'] })

        const result = await verify(ctx)

        expect(result.mismatched).toBe(2)
        const issues = await issueRepo().find({ where: { projectId: ctx.project.id } })
        expect(issues).toHaveLength(1)
        expect(issues[0].occurrences).toBe(2)
        expect(result.problems.map((problem) => problem.businessKey).sort()).toEqual(['E1001', 'E1002'])
    })

    it('only checks the latest write for each person so a later transfer is not reported as drift', async () => {
        const ctx = await createTestContext(app!)
        const onboard = await seedWorkflow({ ctx, name: 'Onboard', actionName: 'provision_user' })
        const transfer = await seedWorkflow({ ctx, name: 'Transfer', actionName: 'update_user' })
        await seedRun({ ctx, workflowId: onboard.workflowId, versionId: onboard.versionId, businessKey: 'E1001', minutesAgo: 60, stepInput: { departmentId: 'od-rd' }, stepOutput: { open_id: 'ou_1' } })
        await seedRun({ ctx, workflowId: transfer.workflowId, versionId: transfer.versionId, businessKey: 'E1001', minutesAgo: 5, stepInput: { openId: 'ou_1', departmentId: 'od-hr' }, stepOutput: {} })
        feishuReturns({ department_ids: ['od-hr'] })

        const result = await verify(ctx)

        expect(result).toMatchObject({ checked: 1, matched: 1, mismatched: 0 })
        expect(readBack).toHaveBeenCalledTimes(1)
        expect(await issueRepo().find({ where: { projectId: ctx.project.id } })).toHaveLength(0)
    })

    it('still supersedes the older write when the later workflow uses a different business key format', async () => {
        const ctx = await createTestContext(app!)
        const onboard = await seedWorkflow({ ctx, name: 'Onboard', actionName: 'provision_user' })
        const transfer = await seedWorkflow({ ctx, name: 'Transfer', actionName: 'update_user' })
        await seedRun({ ctx, workflowId: onboard.workflowId, versionId: onboard.versionId, businessKey: 'E1001', minutesAgo: 60, stepInput: { departmentId: 'od-rd' }, stepOutput: { open_id: 'ou_1' } })
        await seedRun({ ctx, workflowId: transfer.workflowId, versionId: transfer.versionId, businessKey: 'E1001-20302', minutesAgo: 5, stepInput: { openId: 'ou_1', departmentId: 'od-hr' }, stepOutput: {} })
        feishuReturns({ department_ids: ['od-hr'] })

        const result = await verify(ctx)

        expect(result).toMatchObject({ checked: 1, matched: 1, mismatched: 0 })
        expect(await issueRepo().find({ where: { projectId: ctx.project.id } })).toHaveLength(0)
    })

    it('checks the department of an old onboarding even after the person was suspended, because suspension does not touch it', async () => {
        const ctx = await createTestContext(app!)
        const onboard = await seedWorkflow({ ctx, name: 'Onboard', actionName: 'provision_user' })
        const leave = await seedWorkflow({ ctx, name: 'Leave', actionName: 'suspend_user' })
        await seedRun({ ctx, workflowId: onboard.workflowId, versionId: onboard.versionId, businessKey: 'E1001', minutesAgo: 60, stepInput: { departmentId: 'od-rd' }, stepOutput: { open_id: 'ou_1' } })
        await seedRun({ ctx, workflowId: leave.workflowId, versionId: leave.versionId, businessKey: 'E1001', minutesAgo: 5, stepInput: { openId: 'ou_1' }, stepOutput: {} })
        feishuReturns({ department_ids: ['od-rd'], is_frozen: true })

        const result = await verify(ctx)

        expect(result).toMatchObject({ checked: 2, matched: 2, mismatched: 0 })
    })

    it('reports a failed read-back as unreadable and opens no issue', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx, name: 'Leave', actionName: 'suspend_user' })
        await seedRun({ ctx, workflowId, versionId, businessKey: 'E1001', stepInput: { openId: 'ou_1' }, stepOutput: {} })
        readBack.mockResolvedValue({ status: ActionRunStatus.FAILED, output: null, errorMessage: 'permission denied', neverStarted: false, durationMs: 1 })

        const result = await verify(ctx)

        expect(result).toMatchObject({ checked: 1, unreadable: 1, mismatched: 0 })
        expect(await issueRepo().find({ where: { projectId: ctx.project.id } })).toHaveLength(0)
    })

    it('ignores test runs, runs without a business key and old runs', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx, name: 'Leave', actionName: 'suspend_user' })
        await seedRun({ ctx, workflowId, versionId, businessKey: 'E1', environment: RunEnvironment.TESTING, stepInput: { openId: 'ou_1' }, stepOutput: {} })
        await seedRun({ ctx, workflowId, versionId, businessKey: null, stepInput: { openId: 'ou_2' }, stepOutput: {} })
        await seedRun({ ctx, workflowId, versionId, businessKey: 'E3', minutesAgo: 60 * 24 * 10, stepInput: { openId: 'ou_3' }, stepOutput: {} })

        const result = await verify(ctx)

        expect(result.checked).toBe(0)
        expect(readBack).not.toHaveBeenCalled()
    })

    it('does not let a viewer start a check', async () => {
        const owner = await createTestContext(app!)
        const outsider = await createTestContext(app!)

        const response = await outsider.post('/v1/verification/run', { projectId: owner.project.id })

        expect([StatusCodes.FORBIDDEN, StatusCodes.NOT_FOUND]).toContain(response.statusCode)
    })
})

type SeedRunParams = {
    ctx: TestContext
    workflowId: string
    versionId: string
    businessKey: string | null
    minutesAgo?: number
    stepInput: Record<string, unknown>
    stepOutput: Record<string, unknown>
    environment?: RunEnvironment
}
