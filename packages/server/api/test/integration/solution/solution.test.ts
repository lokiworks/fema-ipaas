import { DefaultProjectRole, WorkflowActionType, WorkflowStatus, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createMemberContext, createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function savePublishedWorkflow({ ctx, name }: { ctx: TestContext, name: string }): Promise<string> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
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
            nextAction: {
                type: WorkflowActionType.CODE,
                name: 'step_1',
                valid: true,
                displayName: 'Code',
                lastUpdatedDate: dayjs().toISOString(),
                settings: {
                    sourceCodeHash: 'x',
                    input: {},
                    sourceCode: { code: 'export const code = async () => 1', packageJson: '{}' },
                },
            },
        },
    })
    await db.save('workflow', workflow)
    await db.save('workflow_version', version)
    await db.save('workflow', { ...workflow, publishedVersionId: version.id })
    return workflow.id
}

function createBody({ ctx, workflowIds, name = 'People sync' }: { ctx: TestContext, workflowIds: string[], name?: string }): Record<string, unknown> {
    return {
        projectId: ctx.project.id,
        workflowIds,
        name,
        summary: 'Keep people in step',
        category: 'HR',
        visibility: 'TENANT',
        manualChecks: [{ label: 'The app can see every department' }],
    }
}

describe('Solutions API', () => {
    it('starts with an empty library instead of failing', async () => {
        const ctx = await createTestContext(app!)
        const response = await ctx.get('/v1/solutions')
        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.json()).toEqual([])
    })

    it('refuses to package a workflow that was never published', async () => {
        const ctx = await createTestContext(app!)
        const workflow = createMockWorkflow({ projectId: ctx.project.id })
        await db.save('workflow', workflow)
        await db.save('workflow_version', createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.DRAFT }))

        const response = await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflow.id] }))

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('packages published workflows into version 1.0 and lists it', async () => {
        const ctx = await createTestContext(app!)
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })

        const created = await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflowId] }))
        expect(created.statusCode).toBe(StatusCodes.CREATED)
        const detail = created.json()
        expect(detail.currentVersion).toBe('1.0')
        expect(detail.workflowCount).toBe(1)
        expect(detail.package.workflows[0].name).toBe('Onboard')
        expect(detail.package.checks.some((check: { kind: string }) => check.kind === 'MANUAL')).toBe(true)

        const list = await ctx.get('/v1/solutions')
        expect(list.json().map((solution: { id: string }) => solution.id)).toEqual([detail.id])
    })

    it('keeps another tenant from seeing the solution', async () => {
        const owner = await createTestContext(app!)
        const outsider = await createTestContext(app!)
        const workflowId = await savePublishedWorkflow({ ctx: owner, name: 'Onboard' })
        const created = (await owner.post('/v1/solutions', createBody({ ctx: owner, workflowIds: [workflowId] }))).json()

        expect((await outsider.get('/v1/solutions')).json()).toEqual([])
        expect((await outsider.get(`/v1/solutions/${created.id}`)).statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('installs as draft workflows, records the install and counts it', async () => {
        const ctx = await createTestContext(app!)
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })
        const solution = (await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflowId] }))).json()

        const preview = await ctx.post(`/v1/solutions/${solution.id}/preview`, { projectId: ctx.project.id, connections: {}, config: {} })
        expect(preview.statusCode).toBe(StatusCodes.OK)
        expect(preview.json().workflows).toHaveLength(1)
        expect(preview.json().capacityError).toBeNull()

        const install = await ctx.post(`/v1/solutions/${solution.id}/install`, {
            projectId: ctx.project.id,
            connections: {},
            config: {},
            acknowledgedChecks: [],
        })
        expect(install.statusCode).toBe(StatusCodes.CREATED)
        const result = install.json()
        expect(result.workflows).toHaveLength(1)
        expect(result.install.version).toBe('1.0')

        const installs = await ctx.get('/v1/solutions/installs', { projectId: ctx.project.id })
        expect(installs.json().map((entry: { id: string }) => entry.id)).toEqual([result.install.id])

        const detail = await ctx.get(`/v1/solutions/${solution.id}`)
        expect(detail.json().installCount).toBe(1)
    })

    it('upgrades an install after a new version is published', async () => {
        const ctx = await createTestContext(app!)
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })
        const solution = (await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflowId] }))).json()
        const installed = (await ctx.post(`/v1/solutions/${solution.id}/install`, {
            projectId: ctx.project.id,
            connections: {},
            config: {},
            acknowledgedChecks: [],
        })).json()

        const published = await ctx.post(`/v1/solutions/${solution.id}/versions`, { notes: 'Second version' })
        expect(published.statusCode).toBe(StatusCodes.OK)
        expect(published.json().currentVersion).toBe('1.1')

        const [stale] = (await ctx.get('/v1/solutions/installs', { projectId: ctx.project.id })).json()
        expect(stale.version).toBe('1.0')
        expect(stale.latestVersion).toBe('1.1')

        const upgraded = await ctx.post(`/v1/solutions/installs/${installed.install.id}/upgrade`)
        expect(upgraded.statusCode).toBe(StatusCodes.OK)
        expect(upgraded.json().version).toBe('1.1')

        const again = await ctx.post(`/v1/solutions/installs/${installed.install.id}/upgrade`)
        expect(again.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('does not let a read-only member install into the project', async () => {
        const ctx = await createTestContext(app!)
        const viewer = await createMemberContext(app!, ctx, { projectRole: DefaultProjectRole.VIEWER })
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })
        const solution = (await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflowId] }))).json()

        const response = await viewer.post(`/v1/solutions/${solution.id}/install`, {
            projectId: ctx.project.id,
            connections: {},
            config: {},
            acknowledgedChecks: [],
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('only lets the creator publish a new version', async () => {
        const ctx = await createTestContext(app!)
        const editor = await createMemberContext(app!, ctx, { projectRole: DefaultProjectRole.EDITOR })
        const workflowId = await savePublishedWorkflow({ ctx, name: 'Onboard' })
        const solution = (await ctx.post('/v1/solutions', createBody({ ctx, workflowIds: [workflowId] }))).json()

        const response = await editor.post(`/v1/solutions/${solution.id}/versions`, { notes: 'Mine now' })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })
})
