import { DefaultProjectRole, ExecutionStatus, RunEnvironment, RunRerunBlockReason, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../helpers/db'
import { createMockExecution, createMockProject, createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createMemberContext, createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function seedProjectWithRuns({ ctx, ageMinutes }: { ctx: TestContext, ageMinutes: number[] }): Promise<{ projectId: string, runIds: string[] }> {
    const project = createMockProject({ ownerId: ctx.user.id, tenantId: ctx.tenant.id })
    await db.save('project', project)
    const workflow = createMockWorkflow({ projectId: project.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, valid: true })
    await db.save('workflow_version', version)
    await db.update('workflow', workflow.id, { publishedVersionId: version.id })
    const executions = ageMinutes.map((age) => ({
        ...createMockExecution({
            projectId: project.id,
            workflowId: workflow.id,
            workflowVersionId: version.id,
            status: ExecutionStatus.FAILED,
            environment: RunEnvironment.PRODUCTION,
            created: dayjs().subtract(age, 'minute').toISOString(),
            startTime: dayjs().subtract(age, 'minute').toISOString(),
            finishTime: dayjs().subtract(age, 'minute').add(1, 'second').toISOString(),
        }),
        failedStep: { name: 'step_1', displayName: 'Step', message: 'boom' },
    }))
    await db.save('execution', executions)
    return { projectId: project.id, runIds: executions.map((execution) => execution.id) }
}

async function seedExpiredRun({ projectId, ageDays }: { projectId: string, ageDays: number }): Promise<string> {
    const template = await db.findOneByOrFail<{ workflowId: string, workflowVersionId: string }>('execution', { projectId })
    const created = dayjs().subtract(ageDays, 'day').toISOString()
    const expired = {
        ...createMockExecution({
            projectId,
            workflowId: template.workflowId,
            workflowVersionId: template.workflowVersionId,
            status: ExecutionStatus.FAILED,
            environment: RunEnvironment.PRODUCTION,
            created,
            startTime: created,
            finishTime: created,
        }),
        failedStep: { name: 'step_1', displayName: 'Step', message: 'boom' },
    }
    await db.save('execution', expired)
    return expired.id
}

describe('Run log access and retention', () => {
    it('lets a member see only the projects they belong to, while an admin sees every project', async () => {
        const admin = await createTestContext(app!)
        const mine = await seedProjectWithRuns({ ctx: admin, ageMinutes: [5] })
        const hidden = await seedProjectWithRuns({ ctx: admin, ageMinutes: [6] })
        const member = await createMemberContext(app!, admin, { projectRole: DefaultProjectRole.VIEWER })
        await db.save('project_member', { id: 'rl-member-mine', created: dayjs().toISOString(), updated: dayjs().toISOString(), projectId: mine.projectId, userId: member.user.id, role: DefaultProjectRole.VIEWER })

        const memberRows = (await member.get('/v1/run-logs', { time: '24h', limit: 100 })).json().data.map((row: { projectId: string }) => row.projectId)
        const adminRows = (await admin.get('/v1/run-logs', { time: '24h', limit: 100 })).json().data.map((row: { projectId: string }) => row.projectId)

        expect(memberRows).toContain(mine.projectId)
        expect(memberRows).not.toContain(hidden.projectId)
        expect(adminRows).toEqual(expect.arrayContaining([mine.projectId, hidden.projectId]))
    })

    it('does not let a member open the detail of a run in a project they do not belong to', async () => {
        const admin = await createTestContext(app!)
        const hidden = await seedProjectWithRuns({ ctx: admin, ageMinutes: [6] })
        const member = await createMemberContext(app!, admin, { projectRole: DefaultProjectRole.VIEWER })

        const detail = await member.get(`/v1/run-logs/${hidden.runIds[0]}`)

        expect([StatusCodes.FORBIDDEN, StatusCodes.NOT_FOUND]).toContain(detail.statusCode)
    })

    it('keeps a viewer from rerunning or terminating', async () => {
        const admin = await createTestContext(app!)
        const seeded = await seedProjectWithRuns({ ctx: admin, ageMinutes: [5] })
        const viewer = await createMemberContext(app!, admin, { projectRole: DefaultProjectRole.VIEWER })
        await db.save('project_member', { id: 'rl-viewer-project', created: dayjs().toISOString(), updated: dayjs().toISOString(), projectId: seeded.projectId, userId: viewer.user.id, role: DefaultProjectRole.VIEWER })

        const rows = (await viewer.get('/v1/run-logs', { time: '24h' })).json().data
        const rerun = await viewer.post('/v1/run-logs/rerun', { executionIds: seeded.runIds, strategy: 'ON_LATEST_VERSION' })
        const terminate = await viewer.post(`/v1/run-logs/${seeded.runIds[0]}/terminate`, { stopChildRuns: false })

        expect(rows[0].rerunBlockReason).toBe(RunRerunBlockReason.VIEW_ONLY)
        expect(rerun.statusCode).toBe(StatusCodes.OK)
        expect(rerun.json().results[0].blockReason).toBe(RunRerunBlockReason.VIEW_ONLY)
        expect(rerun.json().results[0].rerunExecutionId).toBeNull()
        expect(terminate.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('hides runs older than the project retention even when the time range is wider', async () => {
        const admin = await createTestContext(app!)
        const seeded = await seedProjectWithRuns({ ctx: admin, ageMinutes: [30] })
        await db.update('project', seeded.projectId, { executionDataRetentionDays: 1 })
        const scope = (await admin.get('/v1/run-logs/scope')).json()
        const retentionDays: number = scope.projects.find((project: { id: string }) => project.id === seeded.projectId).retentionDays
        const expired = await seedExpiredRun({ projectId: seeded.projectId, ageDays: retentionDays + 1 })

        const rows = (await admin.get('/v1/run-logs', { time: '30d', projectId: seeded.projectId, limit: 100 })).json().data

        expect(rows.map((row: { id: string }) => row.id)).toEqual([seeded.runIds[0]])
        expect(rows.map((row: { id: string }) => row.id)).not.toContain(expired)
    })

    it('narrows the list to the requested run ids and ignores ids outside the visible projects', async () => {
        const admin = await createTestContext(app!)
        const seeded = await seedProjectWithRuns({ ctx: admin, ageMinutes: [5, 6, 7] })
        const outsider = await createTestContext(app!)
        const foreign = await seedProjectWithRuns({ ctx: outsider, ageMinutes: [5] })

        const rows = (await admin.get('/v1/run-logs', { time: '24h', runIds: [seeded.runIds[1], foreign.runIds[0]], limit: 100 })).json().data

        expect(rows.map((row: { id: string }) => row.id)).toEqual([seeded.runIds[1]])
    })

    it('treats a batch of reruns of one trigger chain as a single rerun', async () => {
        const admin = await createTestContext(app!)
        const seeded = await seedProjectWithRuns({ ctx: admin, ageMinutes: [5] })
        const root = seeded.runIds[0]
        const twin = createMockExecution({
            projectId: seeded.projectId,
            workflowId: (await db.findOneByOrFail<{ workflowId: string }>('execution', { id: root })).workflowId,
            workflowVersionId: (await db.findOneByOrFail<{ workflowVersionId: string }>('execution', { id: root })).workflowVersionId,
            status: ExecutionStatus.FAILED,
            environment: RunEnvironment.PRODUCTION,
        })
        await db.save('execution', { ...twin, failedStep: { name: 'step_1', displayName: 'Step', message: 'boom' }, rerunOfExecutionId: root })

        const response = await admin.post('/v1/run-logs/rerun', { executionIds: [root, twin.id], strategy: 'ON_LATEST_VERSION' })

        const results: { executionId: string, blockReason: string | null }[] = response.json().results
        const skippedAsInProgress = results.filter((result) => result.blockReason === RunRerunBlockReason.RERUN_IN_PROGRESS)
        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(results).toHaveLength(2)
        expect(skippedAsInProgress.length).toBeGreaterThanOrEqual(1)
    })
})
