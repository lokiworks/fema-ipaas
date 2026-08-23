import {
    PopulatedWorkflow,
} from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Trigger Events API', () => {
    describe('POST /v1/trigger-events (Save)', () => {
        it('should save a trigger event', async () => {
            const ctx = await createTestContext(app!)

            const workflowResponse = await ctx.post('/v1/workflows', {
                displayName: 'trigger event test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = workflowResponse?.json()

            const response = await ctx.post('/v1/trigger-events', {
                workspaceId: ctx.workspace.id,
                workflowId: workflow.id,
                mockData: { key: 'value', nested: { a: 1 } },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.workflowId).toBe(workflow.id)
            expect(body.workspaceId).toBe(ctx.workspace.id)
        })
    })

    describe('GET /v1/trigger-events (List)', () => {
        it('should list trigger events', async () => {
            const ctx = await createTestContext(app!)

            const workflowResponse = await ctx.post('/v1/workflows', {
                displayName: 'list trigger events workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = workflowResponse?.json()

            await ctx.post('/v1/trigger-events', {
                workflowId: workflow.id,
                workspaceId: ctx.workspace.id,
                mockData: { event: 'one' },
            })
            await ctx.post('/v1/trigger-events', {
                workspaceId: ctx.workspace.id,
                workflowId: workflow.id,
                mockData: { event: 'two' },
            })

            const response = await ctx.get('/v1/trigger-events', {
                workspaceId: ctx.workspace.id,
                workflowId: workflow.id,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data.length).toBeGreaterThanOrEqual(2)
        })

        it('should return empty for workflow with no events', async () => {
            const ctx = await createTestContext(app!)

            const workflowResponse = await ctx.post('/v1/workflows', {
                displayName: 'empty trigger events workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = workflowResponse?.json()

            const response = await ctx.get('/v1/trigger-events', {
                workspaceId: ctx.workspace.id,
                workflowId: workflow.id,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data).toHaveLength(0)
        })

        it('should respect limit parameter', async () => {
            const ctx = await createTestContext(app!)

            const workflowResponse = await ctx.post('/v1/workflows', {
                displayName: 'paginate trigger events workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = workflowResponse?.json()

            await ctx.post('/v1/trigger-events', { workspaceId: ctx.workspace.id, workflowId: workflow.id, mockData: { n: 1 } })
            await ctx.post('/v1/trigger-events', { workspaceId: ctx.workspace.id, workflowId: workflow.id, mockData: { n: 2 } })
            await ctx.post('/v1/trigger-events', { workspaceId: ctx.workspace.id, workflowId: workflow.id, mockData: { n: 3 } })

            const response = await ctx.get('/v1/trigger-events', {
                workspaceId: ctx.workspace.id,
                workflowId: workflow.id,
                limit: '2',
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data).toHaveLength(2)
        })
    })

    describe('Cross-workspace isolation', () => {
        it('should not allow saving events for another workspace workflow', async () => {
            const ctx1 = await createTestContext(app!)
            const ctx2 = await createTestContext(app!)

            const workflowResponse = await ctx1.post('/v1/workflows', {
                displayName: 'cross workspace workflow',
                workspaceId: ctx1.workspace.id,
            }, { query: { workspaceId: ctx1.workspace.id } })
            const workflow: PopulatedWorkflow = workflowResponse?.json()

            const response = await ctx2.post('/v1/trigger-events', {
                workspaceId: ctx2.workspace.id,
                workflowId: workflow.id,
                mockData: { unauthorized: true },
            })

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })
})
