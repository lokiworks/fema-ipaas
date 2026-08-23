import { apId } from '@fema-ipaas/core-utils'
import { ExecutionType, ExecutionStatus, WorkflowVersionState, RunEnvironment, StreamStepProgress } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { distributedStore } from '../../../../../src/app/database/redis-connections'
import { batchDeleteByWorkflowId } from '../../../../../src/app/workflows/workflow/workflow.jobs'
import { executionSideEffects } from '../../../../../src/app/workflows/execution/execution-side-effects'
import { waitpointService } from '../../../../../src/app/workflows/execution/waitpoint/waitpoint-service'
import { pubsub } from '../../../../../src/app/helper/pubsub'
import { engineResponseWatcher } from '../../../../../src/app/workers/engine-response-watcher'
import { redisMetadataKey, RunsMetadataUpsertData } from '../../../../../src/app/workers/job'
import { createHandlers } from '../../../../../src/app/workers/rpc/worker-rpc-service'
import { db } from '../../../../helpers/db'
import { createMockWorkflow, createMockExecution, createMockWorkflowVersion } from '../../../../helpers/mocks'
import { createTestContext, TestContext } from '../../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../../helpers/test-setup'

async function waitForCondition(fn: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await fn()) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('waitForCondition timed out')
}

let app: FastifyInstance
let ctx: TestContext

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    ctx = await createTestContext(app)
})

async function createPausedExecutionWithWaitpoint(params: {
    workspaceId: string
}) {
    const workflow = createMockWorkflow({ workspaceId: params.workspaceId })
    await db.save('workflow', workflow)

    const workflowVersion = createMockWorkflowVersion({
        workflowId: workflow.id,
        state: WorkflowVersionState.LOCKED,
    })
    await db.save('workflow_version', workflowVersion)

    const execution = createMockExecution({
        workspaceId: params.workspaceId,
        workflowId: workflow.id,
        workflowVersionId: workflowVersion.id,
        status: ExecutionStatus.PAUSED,
        environment: RunEnvironment.PRODUCTION,
    })
    await db.save('execution', execution)

    await db.save('waitpoint', {
        id: apId(),
        executionId: execution.id,
        workspaceId: params.workspaceId,
        stepName: 'approval',
        type: 'WEBHOOK',
        status: 'PENDING',
        httpRequestId: null,
        workerHandlerId: null,
    })

    return { workflow, workflowVersion, execution }
}

describe('Resume workflow run', () => {
    it('should resume legacy PAUSED workflow with no waitpoint via async endpoint', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const execution = createMockExecution({
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            status: ExecutionStatus.PAUSED,
            environment: RunEnvironment.PRODUCTION,
        })
        await db.save('execution', execution)

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/requests/${apId()}`,
            body: { data: 'test' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({
            message: 'Your response has been recorded. You can close this page now.',
        })
    })

    it('should trigger resume when uploadRunLog finds a pre-completed waitpoint', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const execution = createMockExecution({
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            status: ExecutionStatus.RUNNING,
            environment: RunEnvironment.PRODUCTION,
        })
        await db.save('execution', execution)

        const runId = execution.id
        const requestId = apId()

        await distributedStore.merge(redisMetadataKey(runId), {
            id: runId,
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            environment: RunEnvironment.PRODUCTION,
            status: ExecutionStatus.RUNNING,
        })

        await db.save('waitpoint', {
            id: apId(),
            executionId: runId,
            workspaceId: ctx.workspace.id,
            stepName: 'approval',
            type: 'WEBHOOK',
            status: 'COMPLETED',
            resumePayload: {
                payload: { body: { status: 'success' } },
                progressUpdateType: 'TEST_WORKFLOW',
                executionType: 'RESUME',
            },
        })

        const handlers = createHandlers(app.log)
        await handlers.uploadRunLog({
            runId,
            workspaceId: ctx.workspace.id,
            status: ExecutionStatus.PAUSED,
        })

        await waitForCondition(async () => {
            const wp = await db.findOneBy('waitpoint', { executionId: runId })
            return wp === null
        })

        const dbRun = await db.findOneBy<{ id: string, status: string }>('execution', { id: runId })
        expect(dbRun).not.toBeNull()

        const waitpoint = await db.findOneBy('waitpoint', { executionId: runId })
        expect(waitpoint).toBeNull()
    })

    it('should not resume when workflow is in terminal state', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const execution = createMockExecution({
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            status: ExecutionStatus.SUCCEEDED,
            environment: RunEnvironment.PRODUCTION,
        })
        await db.save('execution', execution)

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/requests/${apId()}`,
            body: { data: 'test' },
        })

        expect(response.statusCode).toBe(200)
    })

    it('sync: should resume legacy PAUSED workflow with no waitpoint', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const requestId = apId()
        const execution = createMockExecution({
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            status: ExecutionStatus.PAUSED,
            environment: RunEnvironment.PRODUCTION,
        })
        await db.save('execution', execution)

        const responsePromise = app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/requests/${requestId}/sync`,
            body: { data: 'test' },
        })

        await new Promise((resolve) => setTimeout(resolve, 500))
        await pubsub.publish(`engine-run:sync:${engineResponseWatcher(app.log).getServerId()}`, JSON.stringify({
            requestId,
            response: { status: 200, body: { ok: true }, headers: {} },
        }))

        const response = await responsePromise
        expect(response.statusCode).toBe(200)
    })

    it('should persist PAUSED status for a Redis-only run', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const runId = apId()
        const requestId = apId()

        const runMetadata: RunsMetadataUpsertData = {
            id: runId,
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            environment: RunEnvironment.PRODUCTION,
            status: ExecutionStatus.RUNNING,
        }
        await distributedStore.merge(redisMetadataKey(runId), runMetadata)

        await db.save('waitpoint', {
            id: apId(),
            executionId: runId,
            workspaceId: ctx.workspace.id,
            stepName: 'approval',
            type: 'WEBHOOK',
            status: 'PENDING',
            httpRequestId: null,
            workerHandlerId: null,
        })

        const handlers = createHandlers(app.log)
        await handlers.uploadRunLog({
            runId,
            workspaceId: ctx.workspace.id,
            status: ExecutionStatus.PAUSED,
        })

        await waitForCondition(async () => {
            const dbRun = await db.findOneBy<{ status: string }>('execution', { id: runId })
            return dbRun?.status === ExecutionStatus.PAUSED
        })

        const waitpoint = await db.findOneBy<{ status: string, type: string }>('waitpoint', { executionId: runId })
        expect(waitpoint).not.toBeNull()
        expect(waitpoint!.status).toBe('PENDING')
        expect(waitpoint!.type).toBe('WEBHOOK')

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/executions/${runId}/requests/${requestId}`,
            body: { status: 'success', data: { greeting: 'Hello' } },
        })
        expect(response.statusCode).toBe(200)
    })

    it('should persist DELAY waitpoint with waitpointId via uploadRunLog', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const runId = apId()
        const resumeDateTime = new Date(Date.now() + 60000).toISOString()

        const runMetadata: RunsMetadataUpsertData = {
            id: runId,
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            environment: RunEnvironment.PRODUCTION,
            status: ExecutionStatus.RUNNING,
        }
        await distributedStore.merge(redisMetadataKey(runId), runMetadata)

        await db.save('waitpoint', {
            id: apId(),
            executionId: runId,
            workspaceId: ctx.workspace.id,
            stepName: 'delay_step',
            type: 'DELAY',
            status: 'PENDING',
            resumeDateTime,
            httpRequestId: null,
            workerHandlerId: null,
        })

        const handlers = createHandlers(app.log)
        await handlers.uploadRunLog({
            runId,
            workspaceId: ctx.workspace.id,
            status: ExecutionStatus.PAUSED,
        })

        await waitForCondition(async () => {
            const dbRun = await db.findOneBy<{ status: string }>('execution', { id: runId })
            return dbRun?.status === ExecutionStatus.PAUSED
        })

        const waitpoint = await db.findOneBy<{ status: string, type: string, resumeDateTime: string }>('waitpoint', { executionId: runId })
        expect(waitpoint).not.toBeNull()
        expect(waitpoint!.type).toBe('DELAY')
        expect(waitpoint!.status).toBe('PENDING')
        expect(new Date(waitpoint!.resumeDateTime).toISOString()).toBe(resumeDateTime)
    })

    it('should clean up waitpoint when workflow run finishes (onFinish)', async () => {
        const { execution } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })

        const waitpointBefore = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointBefore).not.toBeNull()

        await db.update('execution', execution.id, { status: ExecutionStatus.SUCCEEDED })
        const updatedRun = await db.findOneByOrFail<{ id: string, status: string, workspaceId: string }>('execution', { id: execution.id })
        await executionSideEffects(app.log).onFinish({ execution: updatedRun as any, tenantId: ctx.tenant.id })

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).toBeNull()
    })

    it('markParentRunAsFailed should complete waitpoint when parent is PAUSED', async () => {
        const { execution: parentRun } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })

        const childRun = createMockExecution({
            workspaceId: ctx.workspace.id,
            workflowId: parentRun.workflowId,
            workflowVersionId: parentRun.workflowVersionId,
            status: ExecutionStatus.FAILED,
            environment: RunEnvironment.PRODUCTION,
            parentRunId: parentRun.id,
            failParentOnFailure: true,
        })
        await db.save('execution', childRun)

        const existingWaitpoint = await db.findOneBy<{ id: string }>('waitpoint', { executionId: parentRun.id })
        await waitpointService(app.log).complete({
            executionId: parentRun.id,
            workspaceId: ctx.workspace.id,
            waitpointId: existingWaitpoint!.id,
            resumePayload: {
                payload: { body: { status: 'error', data: { message: 'Subflow execution failed' } } },
                streamStepProgress: StreamStepProgress.WEBSOCKET,
                executionType: ExecutionType.RESUME,
            },
        })

        const waitpoint = await db.findOneBy<{ status: string, resumePayload: unknown }>('waitpoint', { executionId: parentRun.id })
        expect(waitpoint).not.toBeNull()
        expect(waitpoint!.status).toBe('COMPLETED')
    })

    it('markParentRunAsFailed should drop the failure when parent has no PENDING waitpoint (regression: subflow retry must not hijack a future pause)', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const parentRun = createMockExecution({
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            status: ExecutionStatus.RUNNING,
            environment: RunEnvironment.PRODUCTION,
        })
        await db.save('execution', parentRun)

        const result = await waitpointService(app.log).complete({
            executionId: parentRun.id,
            workspaceId: ctx.workspace.id,
            waitpointId: apId(),
            resumePayload: {
                payload: { body: { status: 'error', data: { message: 'Subflow execution failed' } } },
                streamStepProgress: StreamStepProgress.WEBSOCKET,
                executionType: ExecutionType.RESUME,
            },
        })

        expect(result.completedExisting).toBe(false)
        expect(result.waitpoint).toBeNull()

        const waitpoint = await db.findOneBy('waitpoint', { executionId: parentRun.id })
        expect(waitpoint).toBeNull()
    })

    it('should drop stale resume signal when parent is already in terminal state and not produce a buffered waitpoint', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const parentRun = createMockExecution({
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            status: ExecutionStatus.FAILED,
            environment: RunEnvironment.PRODUCTION,
        })
        await db.save('execution', parentRun)

        const result = await waitpointService(app.log).complete({
            executionId: parentRun.id,
            workspaceId: ctx.workspace.id,
            waitpointId: apId(),
            resumePayload: {
                payload: { body: { status: 'error', data: { message: 'Subflow execution failed' } } },
                streamStepProgress: StreamStepProgress.WEBSOCKET,
                executionType: ExecutionType.RESUME,
            },
        })
        expect(result.completedExisting).toBe(false)
        expect(result.waitpoint).toBeNull()

        await waitpointService(app.log).handleResumeSignal({
            executionId: parentRun.id,
            waitpointId: apId(),
            executionStatus: ExecutionStatus.FAILED,
            workspaceId: ctx.workspace.id,
            resumePayload: { body: { status: 'error' } },
            onReady: async () => {
                throw new Error('onReady should not be called for terminal state')
            },
        })

        const orphanedWaitpoint = await db.findOneBy('waitpoint', { executionId: parentRun.id })
        expect(orphanedWaitpoint).toBeNull()
    })

    it('should resume via new /:id/waitpoints/:waitpointId route', async () => {
        const { execution } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })

        const waitpoint = await db.findOneBy<{ id: string }>('waitpoint', { executionId: execution.id })
        expect(waitpoint).not.toBeNull()

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/waitpoints/${waitpoint!.id}`,
            body: { status: 'success', data: { greeting: 'Hello' } },
        })

        expect(response.statusCode).toBe(200)

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).toBeNull()
    })

    it('should return stale message on double resume via waitpoint route', async () => {
        const { execution } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })

        const waitpoint = await db.findOneBy<{ id: string }>('waitpoint', { executionId: execution.id })
        expect(waitpoint).not.toBeNull()

        const firstResponse = await app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/waitpoints/${waitpoint!.id}`,
            body: { status: 'success', data: { greeting: 'Hello' } },
        })
        expect(firstResponse.statusCode).toBe(200)
        expect(firstResponse.json()).toEqual({
            message: 'Your response has been recorded. You can close this page now.',
        })

        const secondResponse = await app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/waitpoints/${waitpoint!.id}`,
            body: { status: 'success', data: { greeting: 'Hello again' } },
        })
        expect(secondResponse.statusCode).toBe(200)
        expect(secondResponse.json()).toEqual({
            message: 'This link has expired. The action may have already been processed.',
        })

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).toBeNull()
    })

    it('should clean up waitpoints when workflow is deleted via batchDeleteByWorkflowId', async () => {
        const { execution, workflow } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })

        const waitpointBefore = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointBefore).not.toBeNull()

        await batchDeleteByWorkflowId(workflow.id)

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).toBeNull()

        const runAfter = await db.findOneBy('execution', { id: execution.id })
        expect(runAfter).toBeNull()
    })

    it('V0 async: should resume via waitpoint path when V0 waitpoint exists', async () => {
        const { execution } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })

        const waitpointBefore = await db.findOneBy<{ id: string }>('waitpoint', { executionId: execution.id })
        expect(waitpointBefore).not.toBeNull()

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/requests/${apId()}`,
            body: { status: 'approved' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({
            message: 'Your response has been recorded. You can close this page now.',
        })

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).toBeNull()
    })

    it('V0 async: should take legacy path when only V1 waitpoint exists', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const execution = createMockExecution({
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            status: ExecutionStatus.PAUSED,
            environment: RunEnvironment.PRODUCTION,
        })
        await db.save('execution', execution)

        const waitpointId = apId()
        await db.save('waitpoint', {
            id: waitpointId,
            executionId: execution.id,
            workspaceId: ctx.workspace.id,
            stepName: 'approval',
            type: 'WEBHOOK',
            version: 'V1',
            status: 'PENDING',
            httpRequestId: null,
            workerHandlerId: null,
        })

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/requests/${apId()}`,
            body: { status: 'approved' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({
            message: 'Your response has been recorded. You can close this page now.',
        })

        const waitpointAfter = await db.findOneBy<{ id: string, version: string }>('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).not.toBeNull()
        expect(waitpointAfter!.id).toBe(waitpointId)
        expect(waitpointAfter!.version).toBe('V1')
    })

    it('confirm page: GET renders Approve/Disapprove and does NOT consume the waitpoint (scanner prefetch)', async () => {
        const { execution } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })
        const waitpoint = await db.findOneBy<{ id: string }>('waitpoint', { executionId: execution.id })

        const response = await app.inject({
            method: 'GET',
            url: `/api/v1/executions/${execution.id}/waitpoints/${waitpoint!.id}/confirm`,
            headers: { accept: 'text/html' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.headers['content-type']).toContain('text/html')
        expect(response.body).toContain('Confirm your response')
        expect(response.body).toContain('Approve')
        expect(response.body).toContain('Disapprove')
        const decodedBody = response.body.replace(/&#x3D;/g, '=').replace(/&#x2F;/g, '/')
        expect(decodedBody).toContain('action=approve')
        expect(decodedBody).toContain('action=disapprove')
        expect(response.body).not.toContain('<script')

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).not.toBeNull()
    })

    it('confirm page: HEAD does NOT consume the waitpoint', async () => {
        const { execution } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })
        const waitpoint = await db.findOneBy<{ id: string }>('waitpoint', { executionId: execution.id })

        const response = await app.inject({
            method: 'HEAD',
            url: `/api/v1/executions/${execution.id}/waitpoints/${waitpoint!.id}/confirm`,
            headers: { accept: 'text/html' },
        })

        expect(response.statusCode).toBe(200)

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).not.toBeNull()
    })

    it('confirm page: an already-responded run shows the already-responded state', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const execution = createMockExecution({
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            status: ExecutionStatus.SUCCEEDED,
            environment: RunEnvironment.PRODUCTION,
        })
        await db.save('execution', execution)

        const response = await app.inject({
            method: 'GET',
            url: `/api/v1/executions/${execution.id}/waitpoints/${apId()}/confirm`,
            headers: { accept: 'text/html' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.headers['content-type']).toContain('text/html')
        expect(response.body).toContain('Already responded')
        expect(response.body).not.toContain('Disapprove')
    })

    it('confirm page: POST with Accept text/html records the response and consumes the waitpoint', async () => {
        const { execution } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })
        const waitpoint = await db.findOneBy<{ id: string }>('waitpoint', { executionId: execution.id })

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/waitpoints/${waitpoint!.id}/confirm?action=approve`,
            headers: { accept: 'text/html' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.headers['content-type']).toContain('text/html')
        expect(response.body).toContain('You approved this request')

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).toBeNull()
    })

    it('confirm page: POST with JSON Accept keeps the JSON contract and consumes', async () => {
        const { execution } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })
        const waitpoint = await db.findOneBy<{ id: string }>('waitpoint', { executionId: execution.id })

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/waitpoints/${waitpoint!.id}/confirm?action=approve`,
            headers: { accept: 'application/json' },
            body: { status: 'success' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({
            message: 'Your response has been recorded. You can close this page now.',
        })

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).toBeNull()
    })

    it('confirm page: preserves extra query params (e.g. chat_id) in the Approve/Disapprove actions', async () => {
        const { execution } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })
        const waitpoint = await db.findOneBy<{ id: string }>('waitpoint', { executionId: execution.id })

        const response = await app.inject({
            method: 'GET',
            url: `/api/v1/executions/${execution.id}/waitpoints/${waitpoint!.id}/confirm?chat_id=12345`,
            headers: { accept: 'text/html' },
        })

        expect(response.statusCode).toBe(200)
        const decodedBody = response.body.replace(/&#x3D;/g, '=').replace(/&#x2F;/g, '/').replace(/&amp;/g, '&')
        expect(decodedBody).toContain('chat_id=12345')
        expect(decodedBody).toContain('action=approve')
        expect(decodedBody).toContain('action=disapprove')

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).not.toBeNull()
    })

    it('deprecated route: a bare GET still resumes and consumes the waitpoint (kept for old emails)', async () => {
        const { execution } = await createPausedExecutionWithWaitpoint({
            workspaceId: ctx.workspace.id,
        })
        const waitpoint = await db.findOneBy<{ id: string }>('waitpoint', { executionId: execution.id })

        const response = await app.inject({
            method: 'GET',
            url: `/api/v1/executions/${execution.id}/waitpoints/${waitpoint!.id}?action=approve`,
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({
            message: 'Your response has been recorded. You can close this page now.',
        })

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).toBeNull()
    })

    it('V0 sync: should return 409 when workflow run is in terminal state', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const execution = createMockExecution({
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            status: ExecutionStatus.SUCCEEDED,
            environment: RunEnvironment.PRODUCTION,
        })
        await db.save('execution', execution)

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/requests/${apId()}/sync`,
            body: { data: 'test' },
        })

        expect(response.statusCode).toBe(409)
        expect(response.json()).toEqual(expect.objectContaining({
            message: 'Workflow run is not paused',
        }))
    })

    it('V0 sync: should resume via waitpoint path when V0 waitpoint exists', async () => {
        const workflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', workflow)

        const workflowVersion = createMockWorkflowVersion({
            workflowId: workflow.id,
            state: WorkflowVersionState.LOCKED,
        })
        await db.save('workflow_version', workflowVersion)

        const execution = createMockExecution({
            workspaceId: ctx.workspace.id,
            workflowId: workflow.id,
            workflowVersionId: workflowVersion.id,
            status: ExecutionStatus.PAUSED,
            environment: RunEnvironment.PRODUCTION,
        })
        await db.save('execution', execution)

        const waitpointId = apId()
        const workerHandlerId = engineResponseWatcher(app.log).getServerId()
        await db.save('waitpoint', {
            id: waitpointId,
            executionId: execution.id,
            workspaceId: ctx.workspace.id,
            stepName: 'approval',
            type: 'WEBHOOK',
            status: 'PENDING',
            workerHandlerId,
            httpRequestId: null,
        })

        const responsePromise = app.inject({
            method: 'POST',
            url: `/api/v1/executions/${execution.id}/requests/${apId()}/sync`,
            body: { data: 'test' },
        })

        await new Promise((resolve) => setTimeout(resolve, 500))

        await pubsub.publish(`engine-run:sync:${engineResponseWatcher(app.log).getServerId()}`, JSON.stringify({
            requestId: workerHandlerId,
            response: { status: 200, body: { ok: true }, headers: {} },
        }))

        const response = await responsePromise
        expect(response.statusCode).toBe(200)

        const waitpointAfter = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpointAfter).toBeNull()
    })
})
