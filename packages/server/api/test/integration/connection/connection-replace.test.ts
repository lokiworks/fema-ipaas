import { Connection, ConnectionScope, WorkflowStatus, WorkflowVersionState } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../../helpers/db'
import {
    createMockConnection,
    createMockWorkflow,
    createMockWorkflowVersion,
} from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

const CONNECTOR_NAME = '@fema/connector-slack'

describe('POST /v1/connections/replace', () => {
    it('keeps the source connection when deleteSourceConnection is not set', async () => {
        const ctx = await createTestContext(app!)

        const source = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        const target = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        await db.save('connection', [source, target])

        const response = await ctx.post('/v1/connections/replace', {
            sourceConnectionId: source.id,
            targetConnectionId: target.id,
            workspaceId: ctx.workspace.id,
        })

        expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        const stillThere = await db.findOneBy<Connection>('connection', { id: source.id })
        expect(stillThere?.id).toBe(source.id)
    })

    it('deletes the source connection when deleteSourceConnection is true', async () => {
        const ctx = await createTestContext(app!)

        const source = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        const target = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        await db.save('connection', [source, target])

        const response = await ctx.post('/v1/connections/replace', {
            sourceConnectionId: source.id,
            targetConnectionId: target.id,
            workspaceId: ctx.workspace.id,
            deleteSourceConnection: true,
        })

        expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        const deleted = await db.findOneBy<Connection>('connection', { id: source.id })
        expect(deleted).toBeNull()
    })

    it('rejects replacing a connection with itself', async () => {
        const ctx = await createTestContext(app!)

        const source = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        await db.save('connection', source)

        const response = await ctx.post('/v1/connections/replace', {
            sourceConnectionId: source.id,
            targetConnectionId: source.id,
            workspaceId: ctx.workspace.id,
            deleteSourceConnection: true,
        })

        expect(response?.statusCode).toBe(StatusCodes.CONFLICT)
        const stillThere = await db.findOneBy<Connection>('connection', { id: source.id })
        expect(stillThere?.id).toBe(source.id)
    })

    it('rejects deleting a platform source from the workspace replace', async () => {
        const ctx = await createTestContext(app!)

        const source: Connection = {
            ...createMockConnection({
                platformId: ctx.platform.id,
                workspaceIds: [ctx.workspace.id],
                connectorName: CONNECTOR_NAME,
            }, ctx.user.id),
            scope: ConnectionScope.PLATFORM,
        }
        const target = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        await db.save('connection', [source, target])

        const response = await ctx.post('/v1/connections/replace', {
            sourceConnectionId: source.id,
            targetConnectionId: target.id,
            workspaceId: ctx.workspace.id,
            deleteSourceConnection: true,
        })

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        const stillThere = await db.findOneBy<Connection>('connection', { id: source.id })
        expect(stillThere?.id).toBe(source.id)
    })

    it('replaces workflows off a platform source without deleting it', async () => {
        const ctx = await createTestContext(app!)

        const source: Connection = {
            ...createMockConnection({
                platformId: ctx.platform.id,
                workspaceIds: [ctx.workspace.id],
                connectorName: CONNECTOR_NAME,
            }, ctx.user.id),
            scope: ConnectionScope.PLATFORM,
        }
        const target = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        await db.save('connection', [source, target])

        const workflow = createMockWorkflow({
            workspaceId: ctx.workspace.id,
            status: WorkflowStatus.DISABLED,
        })
        await db.save('workflow', workflow)
        const draftVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.DRAFT,
            connectionIds: [source.externalId],
        })
        await db.save('workflow_version', draftVersion)

        const response = await ctx.post('/v1/connections/replace', {
            sourceConnectionId: source.id,
            targetConnectionId: target.id,
            workspaceId: ctx.workspace.id,
        })

        expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        const stillThere = await db.findOneBy<Connection>('connection', { id: source.id })
        expect(stillThere?.id).toBe(source.id)
    })

    it('repoints draft workflows before deleting the source', async () => {
        const ctx = await createTestContext(app!)

        const source = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        const target = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        await db.save('connection', [source, target])

        const workflow = createMockWorkflow({
            workspaceId: ctx.workspace.id,
            status: WorkflowStatus.DISABLED,
        })
        await db.save('workflow', workflow)
        const draftVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.DRAFT,
            connectionIds: [source.externalId],
        })
        await db.save('workflow_version', draftVersion)

        const response = await ctx.post('/v1/connections/replace', {
            sourceConnectionId: source.id,
            targetConnectionId: target.id,
            workspaceId: ctx.workspace.id,
            deleteSourceConnection: true,
        })

        // The delete only goes through after the final integrity gate confirms no
        // workflow still references the source, so a 204 + deleted source proves the
        // draft was actually repointed first.
        expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        const deleted = await db.findOneBy<Connection>('connection', { id: source.id })
        expect(deleted).toBeNull()
    })

    it('blocks deleting the source when published workflows are not updated', async () => {
        const ctx = await createTestContext(app!)

        const source = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        const target = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        await db.save('connection', [source, target])

        const workflow = createMockWorkflow({
            workspaceId: ctx.workspace.id,
            status: WorkflowStatus.DISABLED,
        })
        await db.save('workflow', workflow)
        const publishedVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
            connectionIds: [source.externalId],
        })
        await db.save('workflow_version', publishedVersion)
        workflow.publishedVersionId = publishedVersion.id
        await db.save('workflow', workflow)

        const response = await ctx.post('/v1/connections/replace', {
            sourceConnectionId: source.id,
            targetConnectionId: target.id,
            workspaceId: ctx.workspace.id,
            deleteSourceConnection: true,
        })

        expect(response?.statusCode).toBe(StatusCodes.CONFLICT)
        const stillThere = await db.findOneBy<Connection>('connection', { id: source.id })
        expect(stillThere?.id).toBe(source.id)
    })

    it('blocks a draft-and-published replace when a published version it cannot see still references the source', async () => {
        const ctx = await createTestContext(app!)

        const source = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        const target = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        await db.save('connection', [source, target])

        // Published version still uses the source but the newer draft dropped it:
        // the replace cannot update that published version without overwriting
        // the draft, so a draft-and-published replace must refuse instead of
        // reporting success while the published workflow stays on the old connection.
        const workflow = createMockWorkflow({
            workspaceId: ctx.workspace.id,
            status: WorkflowStatus.DISABLED,
        })
        await db.save('workflow', workflow)
        const publishedVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
            created: '2020-01-01T00:00:00.000Z',
            connectionIds: [source.externalId],
        })
        const newerDraftVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.DRAFT,
            created: '2020-06-01T00:00:00.000Z',
            connectionIds: [],
        })
        await db.save('workflow_version', [publishedVersion, newerDraftVersion])
        workflow.publishedVersionId = publishedVersion.id
        await db.save('workflow', workflow)

        const response = await ctx.post('/v1/connections/replace', {
            sourceConnectionId: source.id,
            targetConnectionId: target.id,
            workspaceId: ctx.workspace.id,
            applyToPublishedVersions: true,
        })

        expect(response?.statusCode).toBe(StatusCodes.CONFLICT)
        const stillThere = await db.findOneBy<Connection>('connection', { id: source.id })
        expect(stillThere?.id).toBe(source.id)
    })

    it('allows a draft-only replace even when a published version still references the source', async () => {
        const ctx = await createTestContext(app!)

        const source = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        const target = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        await db.save('connection', [source, target])

        const workflow = createMockWorkflow({
            workspaceId: ctx.workspace.id,
            status: WorkflowStatus.DISABLED,
        })
        await db.save('workflow', workflow)
        const publishedVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
            created: '2020-01-01T00:00:00.000Z',
            connectionIds: [source.externalId],
        })
        const newerDraftVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.DRAFT,
            created: '2020-06-01T00:00:00.000Z',
            connectionIds: [],
        })
        await db.save('workflow_version', [publishedVersion, newerDraftVersion])
        workflow.publishedVersionId = publishedVersion.id
        await db.save('workflow', workflow)

        const response = await ctx.post('/v1/connections/replace', {
            sourceConnectionId: source.id,
            targetConnectionId: target.id,
            workspaceId: ctx.workspace.id,
        })

        expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        const stillThere = await db.findOneBy<Connection>('connection', { id: source.id })
        expect(stillThere?.id).toBe(source.id)
    })

    it('blocks deleting the source when a published version the replace cannot see still references it', async () => {
        const ctx = await createTestContext(app!)

        const source = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        const target = createMockConnection({
            platformId: ctx.platform.id,
            workspaceIds: [ctx.workspace.id],
            connectorName: CONNECTOR_NAME,
        }, ctx.user.id)
        await db.save('connection', [source, target])

        // The published version still uses the source, but the newer draft dropped
        // it, so the workflow is invisible to the replace's connection filter and its
        // published version would be orphaned by the delete.
        const workflow = createMockWorkflow({
            workspaceId: ctx.workspace.id,
            status: WorkflowStatus.DISABLED,
        })
        await db.save('workflow', workflow)
        const publishedVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
            created: '2020-01-01T00:00:00.000Z',
            connectionIds: [source.externalId],
        })
        const newerDraftVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.DRAFT,
            created: '2020-06-01T00:00:00.000Z',
            connectionIds: [],
        })
        await db.save('workflow_version', [publishedVersion, newerDraftVersion])
        workflow.publishedVersionId = publishedVersion.id
        await db.save('workflow', workflow)

        const response = await ctx.post('/v1/connections/replace', {
            sourceConnectionId: source.id,
            targetConnectionId: target.id,
            workspaceId: ctx.workspace.id,
            deleteSourceConnection: true,
            applyToPublishedVersions: true,
        })

        expect(response?.statusCode).toBe(StatusCodes.CONFLICT)
        const stillThere = await db.findOneBy<Connection>('connection', { id: source.id })
        expect(stillThere?.id).toBe(source.id)
    })
})
