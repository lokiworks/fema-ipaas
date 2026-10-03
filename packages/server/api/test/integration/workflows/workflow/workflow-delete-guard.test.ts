import { ConnectionType, ConnectorType, PackageType, WorkflowActionType, WorkflowOperationStatus, WorkflowStatus, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { connectorMetadataService } from '../../../../src/app/connectors/metadata/connector-metadata-service'
import { db } from '../../../helpers/db'
import { createMockConnectorMetadata, createMockWorkflow, createMockWorkflowVersion } from '../../../helpers/mocks'
import { createTestContext, TestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null
let mockLog: FastifyBaseLogger

beforeAll(async () => {
    app = await setupTestEnvironment()
    mockLog = app!.log!
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function saveWorkflow({ ctx, name, nextAction, connectionIds = [], externalId }: SaveWorkflowParams): Promise<{ id: string, externalId: string }> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.DISABLED, ...(externalId ? { externalId } : {}) })
    await db.save('workflow', workflow)
    await db.save('workflow_version', createMockWorkflowVersion({
        workflowId: workflow.id,
        displayName: name,
        state: WorkflowVersionState.DRAFT,
        valid: true,
        connectionIds,
        trigger: {
            type: WorkflowTriggerType.EMPTY,
            name: 'trigger',
            settings: {},
            valid: true,
            displayName: 'Trigger',
            lastUpdatedDate: dayjs().toISOString(),
            ...(nextAction ? { nextAction } : {}),
        },
    }))
    return { id: workflow.id, externalId: workflow.externalId }
}

function callWorkflowStep(targetExternalId: string) {
    return {
        type: WorkflowActionType.CONNECTOR,
        name: 'step_1',
        valid: true,
        displayName: 'Call workflow',
        lastUpdatedDate: dayjs().toISOString(),
        settings: {
            connectorName: '@fema-ipaas/connector-subflows',
            connectorVersion: '0.0.1',
            actionName: 'callWorkflow',
            input: { workflowId: targetExternalId },
            propertySettings: {},
        },
    } as const
}

describe('Deleting something that is still in use', () => {
    it('blocks deleting a workflow that another workflow calls, and names the caller', async () => {
        const ctx = await createTestContext(app!)
        const target = await saveWorkflow({ ctx, name: 'Callable target' })
        await saveWorkflow({ ctx, name: 'Daily caller', nextAction: callWorkflowStep(target.externalId) })

        const response = await ctx.delete(`/v1/workflows/${target.id}`)

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(JSON.stringify(response.json())).toContain('Daily caller')
    })

    it('deletes a workflow nobody calls', async () => {
        const ctx = await createTestContext(app!)
        const lonely = await saveWorkflow({ ctx, name: 'Lonely' })
        await saveWorkflow({ ctx, name: 'Other', nextAction: callWorkflowStep('someone-else') })

        const response = await ctx.delete(`/v1/workflows/${lonely.id}`)

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
    })

    it('blocks deleting a connection a workflow still uses, and allows it once unused', async () => {
        const ctx = await createTestContext(app!)
        const connector = createMockConnectorMetadata({
            tenantId: ctx.tenant.id,
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
        })
        await db.save('connector_metadata', connector)
        connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(connector)
        const created = await ctx.post('/v1/connections', {
            externalId: 'in-use-connection',
            displayName: 'In use',
            connectorName: connector.name,
            projectId: ctx.project.id,
            type: ConnectionType.SECRET_TEXT,
            value: { type: ConnectionType.SECRET_TEXT, secret_text: 's' },
            connectorVersion: connector.version,
        })
        const connectionId = created.json().id
        await saveWorkflow({ ctx, name: 'Uses it', connectionIds: ['in-use-connection'] })

        const blocked = await ctx.delete(`/v1/connections/${connectionId}`)
        expect(blocked.statusCode).toBe(StatusCodes.CONFLICT)

        const unusedCreated = await ctx.post('/v1/connections', {
            externalId: 'free-connection',
            displayName: 'Free',
            connectorName: connector.name,
            projectId: ctx.project.id,
            type: ConnectionType.SECRET_TEXT,
            value: { type: ConnectionType.SECRET_TEXT, secret_text: 's' },
            connectorVersion: connector.version,
        })
        const allowed = await ctx.delete(`/v1/connections/${unusedCreated.json().id}`)
        expect(allowed.statusCode).toBe(StatusCodes.NO_CONTENT)
    })
})

describe('Deleting workflows in a batch honours the same guard', () => {
    async function batchDelete({ ctx, workflowIds }: { ctx: TestContext, workflowIds: string[] }) {
        return ctx.inject({
            method: 'DELETE',
            url: '/api/v1/project-workspace/batch',
            body: { projectId: ctx.project.id, workflowIds },
        })
    }

    async function deletingCount({ ids }: { ids: string[] }): Promise<number> {
        const rows = await Promise.all(ids.map((id) => db.findOneBy<{ operationStatus: WorkflowOperationStatus }>('workflow', { id })))
        return rows.filter((row) => row?.operationStatus === WorkflowOperationStatus.DELETING).length
    }

    it('blocks the whole batch when one workflow is called by a workflow outside it', async () => {
        const ctx = await createTestContext(app!)
        const target = await saveWorkflow({ ctx, name: 'Batch target' })
        const free = await saveWorkflow({ ctx, name: 'Batch free' })
        await saveWorkflow({ ctx, name: 'Outside caller', nextAction: callWorkflowStep(target.externalId) })

        const response = await batchDelete({ ctx, workflowIds: [free.id, target.id] })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(JSON.stringify(response.json())).toContain('Outside caller')
        expect(await deletingCount({ ids: [free.id, target.id] })).toBe(0)
    })

    it('allows deleting a workflow together with the only workflows that call it', async () => {
        const ctx = await createTestContext(app!)
        const target = await saveWorkflow({ ctx, name: 'Pair target' })
        const caller = await saveWorkflow({ ctx, name: 'Pair caller', nextAction: callWorkflowStep(target.externalId) })

        const response = await batchDelete({ ctx, workflowIds: [caller.id, target.id] })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.json().deleted).toBe(2)
        expect(await deletingCount({ ids: [caller.id, target.id] })).toBe(2)
    })

    it('deletes unreferenced workflows as before', async () => {
        const ctx = await createTestContext(app!)
        const first = await saveWorkflow({ ctx, name: 'Plain one' })
        const second = await saveWorkflow({ ctx, name: 'Plain two' })

        const response = await batchDelete({ ctx, workflowIds: [first.id, second.id] })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.json().deleted).toBe(2)
    })
})

type SaveWorkflowParams = {
    ctx: TestContext
    name: string
    nextAction?: ReturnType<typeof callWorkflowStep>
    connectionIds?: string[]
    externalId?: string
}
