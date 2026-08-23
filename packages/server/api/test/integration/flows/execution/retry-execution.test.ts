import { FileCompression, FileType, FlowRetryStrategy, ExecutionStatus, FlowTriggerType, FlowVersionState, RunEnvironment, StepOutputStatus, StepOutputType } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { fileService } from '../../../../../src/app/file/file.service'
import { payloadOffloader } from '../../../../../src/app/workers/payload-offloader'
import { db } from '../../../../helpers/db'
import { createMockFlow, createMockExecution, createMockFlowVersion } from '../../../../helpers/mocks'
import { createTestContext, TestContext } from '../../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../../helpers/test-setup'

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

async function createFailedExecution(params: {
    workspaceId: string
    startTime?: string
    finishTime?: string
}) {
    const flow = createMockFlow({ workspaceId: params.workspaceId })
    await db.save('flow', flow)

    const flowVersion = createMockFlowVersion({
        flowId: flow.id,
        state: FlowVersionState.LOCKED,
    })
    await db.save('flow_version', flowVersion)

    const execution = createMockExecution({
        workspaceId: params.workspaceId,
        flowId: flow.id,
        flowVersionId: flowVersion.id,
        status: ExecutionStatus.FAILED,
        environment: RunEnvironment.PRODUCTION,
        startTime: params.startTime,
        finishTime: params.finishTime,
    })
    await db.save('execution', execution)

    return { flow, flowVersion, execution }
}

describe('Retry flow run', () => {
    it('should retry from failed step and transition to queued status', async () => {
        const { execution } = await createFailedExecution({
            workspaceId: ctx.workspace.id,
        })

        const response = await ctx.post(`/v1/executions/${execution.id}/retry`, {
            strategy: FlowRetryStrategy.FROM_FAILED_STEP,
            workspaceId: ctx.workspace.id,
        })

        expect(response.statusCode).toBe(200)

        const updatedRun = await db.findOneByOrFail<{ id: string, status: string }>('execution', { id: execution.id })
        expect(updatedRun.status).toBe(ExecutionStatus.QUEUED)
    })

    it('should reset startTime and clear finishTime when retrying from failed step', async () => {
        const originalStartTime = new Date('2020-01-01T00:00:00.000Z').toISOString()
        const originalFinishTime = new Date('2020-01-01T00:05:00.000Z').toISOString()
        const { execution } = await createFailedExecution({
            workspaceId: ctx.workspace.id,
            startTime: originalStartTime,
            finishTime: originalFinishTime,
        })

        const response = await ctx.post(`/v1/executions/${execution.id}/retry`, {
            strategy: FlowRetryStrategy.FROM_FAILED_STEP,
            workspaceId: ctx.workspace.id,
        })

        expect(response.statusCode).toBe(200)

        const updatedRun = await db.findOneByOrFail<{ id: string, startTime: Date | null, finishTime: Date | null }>('execution', { id: execution.id })
        expect(updatedRun.startTime).not.toBeNull()
        expect(new Date(updatedRun.startTime!).getTime()).toBeGreaterThan(new Date(originalStartTime).getTime())
        expect(updatedRun.finishTime).toBeNull()
    })

    it('should retry on latest version and create a new run', async () => {
        const { execution } = await createFailedExecution({
            workspaceId: ctx.workspace.id,
        })

        const response = await ctx.post(`/v1/executions/${execution.id}/retry`, {
            strategy: FlowRetryStrategy.ON_LATEST_VERSION,
            workspaceId: ctx.workspace.id,
        })

        expect(response.statusCode).toBe(200)
        const body = response.json()
        expect(body.id).not.toBe(execution.id)
        expect(body.flowId).toBe(execution.flowId)
    })

    it('should return 400 for invalid flow run id', async () => {
        const response = await ctx.post('/v1/executions/non-existent-id/retry', {
            strategy: FlowRetryStrategy.FROM_FAILED_STEP,
            workspaceId: ctx.workspace.id,
        })

        expect(response.statusCode).toBe(400)
    })

    it('should materialize a sliced trigger output on ON_LATEST_VERSION retry instead of replaying the LogSliceRef', async () => {
        const workspaceId = ctx.workspace.id
        const platformId = ctx.platform.id

        const flow = createMockFlow({ workspaceId })
        await db.save('flow', flow)

        const flowVersion = createMockFlowVersion({
            flowId: flow.id,
            state: FlowVersionState.LOCKED,
        })
        await db.save('flow_version', flowVersion)

        // The real (>32 KB) trigger payload that was offloaded to object storage on the original run.
        const realTriggerOutput = {
            issues: Array.from({ length: 200 }, (_, i) => ({ id: i, summary: 'x'.repeat(300) })),
        }
        const sliceData = Buffer.from(JSON.stringify(realTriggerOutput), 'utf-8')
        const sliceFile = await fileService(app.log).save({
            workspaceId,
            platformId,
            type: FileType.EXECUTION_LOG_SLICE,
            data: sliceData,
            size: sliceData.length,
            compression: FileCompression.NONE,
        })

        // The run log stores a LogSliceRef in the trigger's output slot, not the real data.
        const sliceRef = { fileId: sliceFile.id, size: sliceData.length, url: `http://localhost/api/v1/files/${sliceFile.id}` }
        const logContent = {
            executionState: {
                steps: {
                    [flowVersion.trigger.name]: {
                        type: FlowTriggerType.EMPTY,
                        status: StepOutputStatus.SUCCEEDED,
                        input: {},
                        output: sliceRef,
                        outputType: StepOutputType.SLICE,
                    },
                },
                tags: [],
            },
        }
        const logData = Buffer.from(JSON.stringify(logContent), 'utf-8')
        const logFile = await fileService(app.log).save({
            workspaceId,
            platformId,
            type: FileType.EXECUTION_LOG,
            data: logData,
            size: logData.length,
            compression: FileCompression.NONE,
        })

        const execution = createMockExecution({
            workspaceId,
            flowId: flow.id,
            flowVersionId: flowVersion.id,
            status: ExecutionStatus.SUCCEEDED,
            environment: RunEnvironment.PRODUCTION,
            logsFileId: logFile.id,
        })
        await db.save('execution', execution)

        const offloadSpy = vi.spyOn(payloadOffloader, 'offloadPayload')

        const response = await ctx.post(`/v1/executions/${execution.id}/retry`, {
            strategy: FlowRetryStrategy.ON_LATEST_VERSION,
            workspaceId,
        })

        expect(response.statusCode).toBe(200)
        expect(offloadSpy).toHaveBeenCalled()

        // The payload enqueued for the new run must be the materialized trigger data,
        // never the raw LogSliceRef pointer.
        const enqueuedPayload = offloadSpy.mock.calls[offloadSpy.mock.calls.length - 1][1]
        expect(enqueuedPayload).toEqual(realTriggerOutput)
        expect(enqueuedPayload).not.toHaveProperty('fileId')

        offloadSpy.mockRestore()
    })

    it('should fail with 404 on ON_LATEST_VERSION retry when the sliced trigger output file is gone', async () => {
        const workspaceId = ctx.workspace.id
        const platformId = ctx.platform.id

        const flow = createMockFlow({ workspaceId })
        await db.save('flow', flow)

        const flowVersion = createMockFlowVersion({
            flowId: flow.id,
            state: FlowVersionState.LOCKED,
        })
        await db.save('flow_version', flowVersion)

        // The trigger output is a slice ref, but the backing EXECUTION_LOG_SLICE file was never
        // created (simulating a deleted / orphaned slice) — retry must fail rather than run with no payload.
        const sliceRef = { fileId: 'missing-slice-file-id', size: 75770, url: 'http://localhost/api/v1/files/missing-slice-file-id' }
        const logContent = {
            executionState: {
                steps: {
                    [flowVersion.trigger.name]: {
                        type: FlowTriggerType.EMPTY,
                        status: StepOutputStatus.SUCCEEDED,
                        input: {},
                        output: sliceRef,
                        outputType: StepOutputType.SLICE,
                    },
                },
                tags: [],
            },
        }
        const logData = Buffer.from(JSON.stringify(logContent), 'utf-8')
        const logFile = await fileService(app.log).save({
            workspaceId,
            platformId,
            type: FileType.EXECUTION_LOG,
            data: logData,
            size: logData.length,
            compression: FileCompression.NONE,
        })

        const execution = createMockExecution({
            workspaceId,
            flowId: flow.id,
            flowVersionId: flowVersion.id,
            status: ExecutionStatus.SUCCEEDED,
            environment: RunEnvironment.PRODUCTION,
            logsFileId: logFile.id,
        })
        await db.save('execution', execution)

        const response = await ctx.post(`/v1/executions/${execution.id}/retry`, {
            strategy: FlowRetryStrategy.ON_LATEST_VERSION,
            workspaceId,
        })

        expect(response.statusCode).toBe(404)
    })
})
