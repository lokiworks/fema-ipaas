import { generateId } from '@fema-ipaas/core-utils'
import { IssueActivityType, IssueKind, IssueStatus, WorkflowStatus, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { issueActivityRepo, IssueRecordEvent, issueRepo, issueService, issueWorkflowRepo } from '../../../src/app/issue/issue.service'
import { db } from '../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function seedWorkflow({ ctx, connection, name }: { ctx: TestContext, connection: string | null, name: string }) {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({
        id: generateId(),
        workflowId: workflow.id,
        displayName: name,
        state: WorkflowVersionState.LOCKED,
        valid: true,
        trigger: {
            type: WorkflowTriggerType.CONNECTOR,
            name: 'trigger',
            displayName: 'Employee Changed',
            valid: true,
            lastUpdatedDate: dayjs().toISOString(),
            settings: {
                connectorName: '@fema-ipaas/connector-beisen',
                connectorVersion: '0.2.2',
                triggerName: 'employee_changed',
                propertySettings: {},
                input: connection === null ? {} : { auth: `{{connections['${connection}']}}` },
            },
        } as never,
    })
    await db.save('workflow_version', version)
    await db.update('workflow', workflow.id, { publishedVersionId: version.id })
    return { workflowId: workflow.id, version }
}

type Seeded = Awaited<ReturnType<typeof seedWorkflow>>

function fail({ ctx, seeded, message }: { ctx: TestContext, seeded: Seeded, message: string }) {
    return issueService(app!.log).recordTriggerFailure({ projectId: ctx.project.id, workflowVersion: seeded.version, message })
}

function recover({ ctx, seeded }: { ctx: TestContext, seeded: Seeded }) {
    return issueService(app!.log).resolveTriggerFailures({ projectId: ctx.project.id, workflowId: seeded.workflowId, triggerName: 'trigger', workflowName: seeded.version.displayName })
}

const RATE_LIMIT = 'HTTP 429: Beisen API rate limit exceeded'
const SERVER_ERROR = 'HTTP 500: Internal Server Error'

describe('Trigger failures with one cause on one connection', () => {
    it('open a single issue for every workflow and alert only for the first', async () => {
        const ctx = await createTestContext(app!)
        const first = await seedWorkflow({ ctx, connection: 'beisen-main', name: '入职' })
        const second = await seedWorkflow({ ctx, connection: 'beisen-main', name: '调岗' })
        const third = await seedWorkflow({ ctx, connection: 'beisen-main', name: '离职' })

        const outcomes = [
            await fail({ ctx, seeded: first, message: RATE_LIMIT }),
            await fail({ ctx, seeded: second, message: RATE_LIMIT }),
            await fail({ ctx, seeded: third, message: RATE_LIMIT }),
        ]

        expect(outcomes.map((outcome) => outcome.event)).toEqual([IssueRecordEvent.NEW, IssueRecordEvent.OCCURRED, IssueRecordEvent.OCCURRED])
        expect(outcomes.map((outcome) => outcome.counted)).toEqual([true, false, false])
        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(issues).toHaveLength(1)
        expect(issues[0].kind).toBe(IssueKind.TRIGGER)
        expect(issues[0].signature).toBe('trigger:beisen-main:HTTP_429')
        expect(issues[0].workflowId).toBeNull()
        expect(issues[0].title.startsWith('Rate limited: ')).toBe(true)
        expect(issues[0].title).not.toContain('Beisen API rate limit')
        const affected = await issueService(app!.log).affectedWorkflows({ id: issues[0].id, projectId: ctx.project.id })
        expect(affected.map((workflow) => workflow.displayName).sort()).toEqual(['入职', '调岗', '离职'].sort())
    })

    it('are listed under the issue of every workflow filter', async () => {
        const ctx = await createTestContext(app!)
        const first = await seedWorkflow({ ctx, connection: 'beisen-main', name: '入职' })
        const second = await seedWorkflow({ ctx, connection: 'beisen-main', name: '调岗' })
        await fail({ ctx, seeded: first, message: RATE_LIMIT })
        await fail({ ctx, seeded: second, message: RATE_LIMIT })

        const listed = await issueService(app!.log).list({ query: { projectId: ctx.project.id, workflowId: second.workflowId }, currentUserId: ctx.user.id })

        expect(listed.data).toHaveLength(1)
        expect(listed.data[0].affectedWorkflows).toBe(2)
    })
})

describe('Trigger failures with different causes', () => {
    it('stay in separate issues and a workflow that changes cause moves to the new one', async () => {
        const ctx = await createTestContext(app!)
        const first = await seedWorkflow({ ctx, connection: 'beisen-main', name: '入职' })
        const second = await seedWorkflow({ ctx, connection: 'beisen-main', name: '调岗' })
        await fail({ ctx, seeded: first, message: RATE_LIMIT })
        await fail({ ctx, seeded: second, message: RATE_LIMIT })

        await fail({ ctx, seeded: second, message: SERVER_ERROR })

        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        const rateLimited = issues.find((issue) => issue.signature === 'trigger:beisen-main:HTTP_429')!
        const serverError = issues.find((issue) => issue.signature === 'trigger:beisen-main:HTTP_500')!
        expect(rateLimited.status).toBe(IssueStatus.OPEN)
        expect(serverError.status).toBe(IssueStatus.OPEN)
        const stillRateLimited = await issueService(app!.log).affectedWorkflows({ id: rateLimited.id, projectId: ctx.project.id })
        const nowServerError = await issueService(app!.log).affectedWorkflows({ id: serverError.id, projectId: ctx.project.id })
        expect(stillRateLimited.map((workflow) => workflow.id)).toEqual([first.workflowId])
        expect(nowServerError.map((workflow) => workflow.id)).toEqual([second.workflowId])
    })

    it('resolves the old issue when its only workflow changes cause', async () => {
        const ctx = await createTestContext(app!)
        const only = await seedWorkflow({ ctx, connection: 'beisen-main', name: '入职' })
        await fail({ ctx, seeded: only, message: RATE_LIMIT })

        await fail({ ctx, seeded: only, message: SERVER_ERROR })

        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(issues.find((issue) => issue.signature === 'trigger:beisen-main:HTTP_429')!.status).toBe(IssueStatus.RESOLVED)
        expect(issues.find((issue) => issue.signature === 'trigger:beisen-main:HTTP_500')!.status).toBe(IssueStatus.OPEN)
    })

    it('keeps the same cause on different connections apart', async () => {
        const ctx = await createTestContext(app!)
        const main = await seedWorkflow({ ctx, connection: 'beisen-main', name: '入职' })
        const other = await seedWorkflow({ ctx, connection: 'beisen-other', name: '调岗' })

        await fail({ ctx, seeded: main, message: RATE_LIMIT })
        await fail({ ctx, seeded: other, message: RATE_LIMIT })

        expect(await issueRepo().findBy({ projectId: ctx.project.id })).toHaveLength(2)
    })
})

describe('Recovery of a merged trigger issue', () => {
    it('keeps it open while another workflow still fails and resolves it after the last one recovers', async () => {
        const ctx = await createTestContext(app!)
        const first = await seedWorkflow({ ctx, connection: 'beisen-main', name: '入职' })
        const second = await seedWorkflow({ ctx, connection: 'beisen-main', name: '调岗' })
        await fail({ ctx, seeded: first, message: RATE_LIMIT })
        await fail({ ctx, seeded: second, message: RATE_LIMIT })

        await recover({ ctx, seeded: first })

        const [afterFirst] = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(afterFirst.status).toBe(IssueStatus.OPEN)
        const activities = await issueActivityRepo().findBy({ issueId: afterFirst.id, projectId: ctx.project.id })
        const recovered = activities.find((activity) => activity.type === IssueActivityType.TRIGGER_RECOVERED)
        expect(recovered?.data).toMatchObject({ workflowId: first.workflowId, workflowName: '入职', remaining: 1 })
        expect(await issueWorkflowRepo().countBy({ issueId: afterFirst.id, projectId: ctx.project.id })).toBe(1)

        await recover({ ctx, seeded: second })

        const [afterSecond] = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(afterSecond.status).toBe(IssueStatus.RESOLVED)
    })

    it('reopens when the cause returns and lists only the workflows failing again', async () => {
        const ctx = await createTestContext(app!)
        const first = await seedWorkflow({ ctx, connection: 'beisen-main', name: '入职' })
        const second = await seedWorkflow({ ctx, connection: 'beisen-main', name: '调岗' })
        await fail({ ctx, seeded: first, message: RATE_LIMIT })
        await fail({ ctx, seeded: second, message: RATE_LIMIT })
        await recover({ ctx, seeded: first })
        await recover({ ctx, seeded: second })

        const outcome = await fail({ ctx, seeded: second, message: RATE_LIMIT })

        expect(outcome.event).toBe(IssueRecordEvent.REOPENED)
        const affected = await issueService(app!.log).affectedWorkflows({ id: outcome.issue.id, projectId: ctx.project.id })
        expect(affected.map((workflow) => workflow.id)).toEqual([second.workflowId])
    })

    it('does not resolve an ignored issue', async () => {
        const ctx = await createTestContext(app!)
        const only = await seedWorkflow({ ctx, connection: 'beisen-main', name: '入职' })
        const outcome = await fail({ ctx, seeded: only, message: RATE_LIMIT })
        await issueRepo().update({ id: outcome.issue.id, projectId: ctx.project.id }, { status: IssueStatus.IGNORED })

        await recover({ ctx, seeded: only })

        const [issue] = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(issue.status).toBe(IssueStatus.IGNORED)
    })
})

describe('Trigger failures of a workflow without a connection', () => {
    it('still open one issue per workflow', async () => {
        const ctx = await createTestContext(app!)
        const first = await seedWorkflow({ ctx, connection: null, name: '入职' })
        const second = await seedWorkflow({ ctx, connection: null, name: '调岗' })

        await fail({ ctx, seeded: first, message: RATE_LIMIT })
        await fail({ ctx, seeded: second, message: RATE_LIMIT })

        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(issues).toHaveLength(2)
        expect(issues.every((issue) => issue.kind === IssueKind.TRIGGER && issue.workflowId !== null)).toBe(true)
    })
})
