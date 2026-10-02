import { WorkflowActionType, WorkflowStatus, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../helpers/db'
import { createMockProject, createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createTable({ ctx, projectId, name = 'Dept map', keyLabel = 'Beisen dept', valueLabel = 'Feishu dept', rows = [{ k: 'R&D', v: 'od-1' }] }: { ctx: TestContext, projectId: string, name?: string, keyLabel?: string, valueLabel?: string, rows?: { k: string, v: string }[] }): Promise<string> {
    const response = await ctx.post('/v1/mapping-tables', { projectId, name, description: 'Departments', keyLabel, valueLabel, missingBehavior: 'ERROR', defaultValue: null, rows })
    expect(response.statusCode).toBe(StatusCodes.CREATED)
    return response.json().id
}

async function saveWorkflowUsing({ ctx, tableId }: { ctx: TestContext, tableId: string }): Promise<string> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.DISABLED })
    await db.save('workflow', workflow)
    await db.save('workflow_version', createMockWorkflowVersion({
        workflowId: workflow.id,
        displayName: 'Onboard',
        state: WorkflowVersionState.DRAFT,
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
                name: 'step_1',
                valid: true,
                displayName: 'Map',
                lastUpdatedDate: dayjs().toISOString(),
                settings: {
                    connectorName: '@fema-ipaas/connector-data-mapper',
                    connectorVersion: '0.0.1',
                    actionName: 'map_fields',
                    input: { mapping: { fields: [{ id: 'f1', target: 'dept', source: '{{trigger.dept}}', transforms: [{ type: 'LOOKUP', arg: tableId }] }] } },
                    propertySettings: {},
                },
            },
        },
    }))
    return workflow.id
}

async function lookupArgOf({ ctx, projectId, workflowId }: { ctx: TestContext, projectId: string, workflowId: string }): Promise<string | undefined> {
    const response = await ctx.get(`/v1/workflows/${workflowId}`, { projectId })
    expect(response.statusCode).toBe(StatusCodes.OK)
    const step = response.json().version.trigger.nextAction
    return step.settings.input.mapping.fields[0].transforms[0].arg
}

async function tablesIn({ ctx, projectId }: { ctx: TestContext, projectId: string }): Promise<{ id: string, name: string }[]> {
    return (await ctx.get('/v1/mapping-tables', { projectId })).json()
}

async function secondProject(ctx: TestContext): Promise<string> {
    const project = createMockProject({ tenantId: ctx.tenant.id, ownerId: ctx.user.id })
    await db.save('project', project)
    return project.id
}

describe('Moving a workflow that looks values up in a mapping table', () => {
    it('exports the tables the workflow uses, with their rows', async () => {
        const ctx = await createTestContext(app!)
        const tableId = await createTable({ ctx, projectId: ctx.project.id })
        await createTable({ ctx, projectId: ctx.project.id, name: 'Unused', keyLabel: 'A', valueLabel: 'B' })
        const workflowId = await saveWorkflowUsing({ ctx, tableId })

        const response = await ctx.get(`/v1/project-workspace/workflows/${workflowId}/export`, { projectId: ctx.project.id })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const file = response.json()
        expect(file.mappingTables).toHaveLength(1)
        expect(file.mappingTables[0]).toMatchObject({ id: tableId, name: 'Dept map', rows: [{ k: 'R&D', v: 'od-1' }] })
    })

    it('creates the table in the target project on import and points the workflow at it', async () => {
        const ctx = await createTestContext(app!)
        const tableId = await createTable({ ctx, projectId: ctx.project.id })
        const workflowId = await saveWorkflowUsing({ ctx, tableId })
        const file = (await ctx.get(`/v1/project-workspace/workflows/${workflowId}/export`, { projectId: ctx.project.id })).json()
        const targetId = await secondProject(ctx)

        const imported = await ctx.post('/v1/project-workspace/workflows/import', { projectId: targetId, file })

        expect(imported.statusCode).toBe(StatusCodes.CREATED)
        const [created] = await tablesIn({ ctx, projectId: targetId })
        expect(created.id).not.toBe(tableId)
        expect(await lookupArgOf({ ctx, projectId: targetId, workflowId: imported.json().workflowId })).toBe(created.id)
    })

    it('reuses the same table when the file is imported again', async () => {
        const ctx = await createTestContext(app!)
        const tableId = await createTable({ ctx, projectId: ctx.project.id })
        const workflowId = await saveWorkflowUsing({ ctx, tableId })
        const file = (await ctx.get(`/v1/project-workspace/workflows/${workflowId}/export`, { projectId: ctx.project.id })).json()
        const targetId = await secondProject(ctx)

        const first = (await ctx.post('/v1/project-workspace/workflows/import', { projectId: targetId, file })).json()
        const second = (await ctx.post('/v1/project-workspace/workflows/import', { projectId: targetId, file })).json()

        const tables = await tablesIn({ ctx, projectId: targetId })
        expect(tables).toHaveLength(1)
        expect(await lookupArgOf({ ctx, projectId: targetId, workflowId: first.workflowId })).toBe(tables[0].id)
        expect(await lookupArgOf({ ctx, projectId: targetId, workflowId: second.workflowId })).toBe(tables[0].id)
    })

    it('does not reuse a table that only shares the name but means something else', async () => {
        const ctx = await createTestContext(app!)
        const tableId = await createTable({ ctx, projectId: ctx.project.id })
        const workflowId = await saveWorkflowUsing({ ctx, tableId })
        const file = (await ctx.get(`/v1/project-workspace/workflows/${workflowId}/export`, { projectId: ctx.project.id })).json()
        const targetId = await secondProject(ctx)
        const unrelated = await createTable({ ctx, projectId: targetId, keyLabel: 'City', valueLabel: 'Code', rows: [{ k: 'Paris', v: 'FR' }] })

        const imported = (await ctx.post('/v1/project-workspace/workflows/import', { projectId: targetId, file })).json()

        const tables = await tablesIn({ ctx, projectId: targetId })
        expect(tables).toHaveLength(2)
        const arg = await lookupArgOf({ ctx, projectId: targetId, workflowId: imported.workflowId })
        expect(arg).not.toBe(unrelated)
        expect(tables.map((table) => table.id)).toContain(arg)
    })

    it('copies the table along when a workflow is copied to another project', async () => {
        const ctx = await createTestContext(app!)
        const tableId = await createTable({ ctx, projectId: ctx.project.id })
        const workflowId = await saveWorkflowUsing({ ctx, tableId })
        const targetId = await secondProject(ctx)

        const copied = await ctx.post(`/v1/project-workspace/workflows/${workflowId}/copy`, { projectId: ctx.project.id, targetProjectId: targetId })

        expect(copied.statusCode).toBe(StatusCodes.CREATED)
        const [created] = await tablesIn({ ctx, projectId: targetId })
        expect(created.id).not.toBe(tableId)
        expect(await lookupArgOf({ ctx, projectId: targetId, workflowId: copied.json().workflowId })).toBe(created.id)
    })

    it('leaves the table alone when copying inside the same project', async () => {
        const ctx = await createTestContext(app!)
        const tableId = await createTable({ ctx, projectId: ctx.project.id })
        const workflowId = await saveWorkflowUsing({ ctx, tableId })

        const copied = await ctx.post(`/v1/project-workspace/workflows/${workflowId}/copy`, { projectId: ctx.project.id, targetProjectId: ctx.project.id })

        expect(copied.statusCode).toBe(StatusCodes.CREATED)
        expect(await tablesIn({ ctx, projectId: ctx.project.id })).toHaveLength(1)
        expect(await lookupArgOf({ ctx, projectId: ctx.project.id, workflowId: copied.json().workflowId })).toBe(tableId)
    })
})
