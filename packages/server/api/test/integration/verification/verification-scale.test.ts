import { ExecutionStatus, RunEnvironment, StepOutput, WorkflowActionType, WorkflowStatus, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { ActionRunStatus } from '../../../src/app/action-run/action-run.service'
import { issueRepo } from '../../../src/app/issue/issue.service'
import { verificationService } from '../../../src/app/verification/verification.service'
import { db } from '../../helpers/db'
import { createMockExecution, createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

const readBack = vi.fn()
const sleep = vi.fn()
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
    sleep.mockReset()
    sleep.mockResolvedValue(undefined)
    stepsOf.clear()
})

async function seedWorkflow({ ctx, actionName }: { ctx: TestContext, actionName: string }): Promise<{ workflowId: string, versionId: string }> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({
        workflowId: workflow.id,
        displayName: 'Onboard',
        state: WorkflowVersionState.LOCKED,
        valid: true,
        trigger: {
            type: WorkflowTriggerType.EMPTY,
            name: 'trigger',
            settings: {},
            valid: true,
            displayName: 'Trigger',
            lastUpdatedDate: dayjs().toISOString(),
            nextAction: {
                type: WorkflowActionType.CONNECTOR,
                name: 'write',
                valid: true,
                displayName: 'write',
                lastUpdatedDate: dayjs().toISOString(),
                settings: {
                    connectorName: '@fema-ipaas/connector-feishu',
                    connectorVersion: '0.4.0',
                    actionName,
                    input: { auth: '{{connections[\'feishu-main\']}}' },
                    propertySettings: {},
                },
            },
        },
    })
    await db.save('workflow_version', version)
    return { workflowId: workflow.id, versionId: version.id }
}

async function seedRuns({ ctx, workflowId, versionId, people, minutesAgo, department = 'od-rd' }: SeedRunsParams): Promise<void> {
    const executions = people.map((person, index) => {
        const execution = {
            ...createMockExecution({
                projectId: ctx.project.id,
                workflowId,
                workflowVersionId: versionId,
                status: ExecutionStatus.SUCCEEDED,
                environment: RunEnvironment.PRODUCTION,
                created: dayjs().subtract(minutesAgo + 1, 'minute').subtract(index, 'second').toISOString(),
                startTime: dayjs().subtract(minutesAgo + 1, 'minute').subtract(index, 'second').toISOString(),
                finishTime: dayjs().subtract(minutesAgo, 'minute').subtract(index, 'second').toISOString(),
            }),
            businessKey: person,
        }
        stepsOf.set(execution.id, { write: { status: 'SUCCEEDED', type: 'CONNECTOR', input: { departmentId: department }, output: { open_id: `ou_${person}` } } as StepOutput })
        return execution
    })
    await db.save('execution', executions)
}

async function verify(ctx: TestContext) {
    return verificationService(app!.log, {
        runConnectorAction: (params) => readBack(params),
        readSteps: ({ execution }) => Promise.resolve(stepsOf.get(execution.id) ?? null),
        sleep: (ms) => sleep(ms),
    }).run({ projectId: ctx.project.id, tenantId: ctx.tenant.id })
}

function feishuReturns(output: Record<string, unknown>) {
    readBack.mockResolvedValue({ status: ActionRunStatus.SUCCEEDED, output, errorMessage: null, neverStarted: false, durationMs: 1 })
}

function peopleOf({ count, prefix }: { count: number, prefix: string }): string[] {
    return Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(5, '0')}`)
}

describe('Reading back more people than one page holds', () => {
    it('checks every person in the window and does not stop at the newest few hundred', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx, actionName: 'provision_user' })
        await seedRuns({ ctx, workflowId, versionId, people: peopleOf({ count: 430, prefix: 'E' }), minutesAgo: 5 })
        feishuReturns({ department_ids: ['od-rd'] })

        const result = await verify(ctx)

        expect(result).toMatchObject({ checked: 430, matched: 430, mismatched: 0, truncated: false })
        expect(readBack).toHaveBeenCalledTimes(430)
    })

    it('spaces the reads so the connected system is not hit faster than the configured rate', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx, actionName: 'provision_user' })
        await seedRuns({ ctx, workflowId, versionId, people: peopleOf({ count: 12, prefix: 'P' }), minutesAgo: 5 })
        feishuReturns({ department_ids: ['od-rd'] })

        await verify(ctx)

        expect(readBack).toHaveBeenCalledTimes(12)
        expect(sleep).toHaveBeenCalledTimes(11)
        const waits: number[] = sleep.mock.calls.map(([ms]) => ms)
        expect(waits.every((ms) => ms > 0)).toBe(true)
        expect(waits[waits.length - 1]).toBeGreaterThan(900)
        expect(waits[waits.length - 1]).toBeLessThanOrEqual(1100)
    })

    it('still skips an older write when the later write to the same account sits on an earlier page', async () => {
        const ctx = await createTestContext(app!)
        const onboard = await seedWorkflow({ ctx, actionName: 'provision_user' })
        const transfer = await seedWorkflow({ ctx, actionName: 'update_user' })
        await seedRuns({ ctx, workflowId: onboard.workflowId, versionId: onboard.versionId, people: ['E-OLD'], minutesAgo: 600, department: 'od-rd' })
        await seedRuns({ ctx, workflowId: onboard.workflowId, versionId: onboard.versionId, people: peopleOf({ count: 250, prefix: 'F' }), minutesAgo: 60 })
        stepsOf.forEach((steps) => {
            const output = steps['write']?.output
            if (typeof output === 'object' && output !== null && 'open_id' in output && output.open_id === 'ou_E-OLD') {
                steps['write'] = { ...steps['write'], output: { open_id: 'ou_shared' } } as StepOutput
            }
        })
        await seedRuns({ ctx, workflowId: transfer.workflowId, versionId: transfer.versionId, people: ['E-NEW'], minutesAgo: 1, department: 'od-hr' })
        stepsOf.forEach((steps) => {
            const output = steps['write']?.output
            if (typeof output === 'object' && output !== null && 'open_id' in output && output.open_id === 'ou_E-NEW') {
                steps['write'] = { status: 'SUCCEEDED', type: 'CONNECTOR', input: { openId: 'ou_shared', departmentId: 'od-hr' }, output: {} } as StepOutput
            }
        })
        feishuReturns({ department_ids: ['od-rd', 'od-hr'] })

        const result = await verify(ctx)

        expect(result).toMatchObject({ checked: 251, matched: 251, mismatched: 0, truncated: false })
        expect(readBack).toHaveBeenCalledTimes(251)
    })

    it('does not count the same drifted person again on the next pass once the issue holds more than 200 notes', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx, actionName: 'provision_user' })
        await seedRuns({ ctx, workflowId, versionId, people: peopleOf({ count: 260, prefix: 'D' }), minutesAgo: 5 })
        feishuReturns({ department_ids: ['od-hr'] })

        await verify(ctx)
        await verify(ctx)

        const [issue] = await issueRepo().find({ where: { projectId: ctx.project.id } })
        expect(issue.occurrences).toBe(260)
    })
})

type SeedRunsParams = {
    ctx: TestContext
    workflowId: string
    versionId: string
    people: string[]
    minutesAgo: number
    department?: string
}
