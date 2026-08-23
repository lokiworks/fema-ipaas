import { FlowActionType, ExecutionStatus, GenericStepOutput, StepOutputStatus, StreamStepProgress, UpdateRunProgressRequest, UploadRunLogsRequest } from '@fema/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlowExecutorContext } from '../../src/lib/handler/context/flow-execution-context'
import { generateMockEngineConstants } from '../handler/test-helper'

const { uploadRunLogMock, updateRunProgressMock, updateStepProgressMock } = vi.hoisted(() => ({
    uploadRunLogMock: vi.fn<(params: { apiUrl: string, engineToken: string, request: UploadRunLogsRequest }) => Promise<void>>(async () => undefined),
    updateRunProgressMock: vi.fn<(params: { apiUrl: string, engineToken: string, request: UpdateRunProgressRequest }) => Promise<void>>(async () => undefined),
    updateStepProgressMock: vi.fn<(params: { apiUrl: string, engineToken: string, request: { workspaceId: string, runId: string, output: unknown } }) => Promise<void>>(async () => undefined),
}))

vi.mock('../../src/lib/api/engine-run-api', () => ({
    engineRunApi: {
        uploadRunLog: uploadRunLogMock,
        updateRunProgress: updateRunProgressMock,
        updateStepProgress: updateStepProgressMock,
    },
}))

vi.mock('fetch-retry', () => ({
    default: () => async () => new Response(JSON.stringify({ readUrl: 'https://mock.read.url/logs' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }),
}))

import { executionProgressReporter } from '../../src/lib/helper/execution-progress-reporter'

const buildUpdateParams = ({ status }: { status: ExecutionStatus }) => {
    const engineConstants = generateMockEngineConstants({
        streamStepProgress: StreamStepProgress.NONE,
        engineToken: 'mock-engine-token',
        internalApiUrl: 'http://127.0.0.1:65535/',
        logsFileId: 'logs-1',
    })
    const flowExecutorContext = new FlowExecutorContext()
    flowExecutorContext.verdict = status === ExecutionStatus.RUNNING
        ? { status: ExecutionStatus.RUNNING }
        : { status: ExecutionStatus.SUCCEEDED, stopResponse: undefined }
    return { engineConstants, flowExecutorContext }
}

const uploadStatuses = (): ExecutionStatus[] =>
    uploadRunLogMock.mock.calls.map(([{ request }]) => request.status)

const lastUploadStatus = (): ExecutionStatus | undefined => uploadStatuses().at(-1)

describe('execution-progress-reporter backup ordering', () => {
    beforeEach(() => {
        uploadRunLogMock.mockClear()
        updateRunProgressMock.mockClear()
    })

    afterEach(async () => {
        await executionProgressReporter.shutdown()
    })

    it('the last write wins: a periodic backup firing after the terminal sendUpdate cannot overwrite SUCCEEDED', async () => {
        executionProgressReporter.init()

        await executionProgressReporter.sendUpdate(buildUpdateParams({ status: ExecutionStatus.RUNNING }))
        await executionProgressReporter.sendUpdate(buildUpdateParams({ status: ExecutionStatus.SUCCEEDED }))
        await executionProgressReporter.backup()

        // Simulate the periodic loop firing one more time after the terminal
        // state is set. It must read the current latest state (SUCCEEDED) — not
        // a stale RUNNING — so the run never reverts to running.
        await executionProgressReporter.backup()

        expect(lastUploadStatus()).toBe(ExecutionStatus.SUCCEEDED)
        expect(uploadStatuses()).not.toContain(ExecutionStatus.RUNNING)
    })

    it('preserves order under concurrent backup calls', async () => {
        executionProgressReporter.init()

        await executionProgressReporter.sendUpdate(buildUpdateParams({ status: ExecutionStatus.RUNNING }))
        const firstBackup = executionProgressReporter.backup()
        await executionProgressReporter.sendUpdate(buildUpdateParams({ status: ExecutionStatus.SUCCEEDED }))
        const secondBackup = executionProgressReporter.backup()
        await Promise.all([firstBackup, secondBackup])

        expect(lastUploadStatus()).toBe(ExecutionStatus.SUCCEEDED)
        const allStatuses = uploadStatuses()
        const terminalIndex = allStatuses.indexOf(ExecutionStatus.SUCCEEDED)
        const runningAfterTerminal = allStatuses
            .slice(terminalIndex + 1)
            .some((s) => s === ExecutionStatus.RUNNING)
        expect(runningAfterTerminal).toBe(false)
    })

    it('still uploads RUNNING progress while the flow is in progress', async () => {
        executionProgressReporter.init()

        await executionProgressReporter.sendUpdate(buildUpdateParams({ status: ExecutionStatus.RUNNING }))
        await executionProgressReporter.backup()

        expect(lastUploadStatus()).toBe(ExecutionStatus.RUNNING)
    })

    it('clears state on shutdown so the next run starts clean', async () => {
        executionProgressReporter.init()
        await executionProgressReporter.sendUpdate(buildUpdateParams({ status: ExecutionStatus.SUCCEEDED }))
        await executionProgressReporter.backup()
        await executionProgressReporter.shutdown()

        executionProgressReporter.init()
        const before = uploadRunLogMock.mock.calls.length
        await executionProgressReporter.backup()
        expect(uploadRunLogMock.mock.calls.length).toBe(before)

        await executionProgressReporter.sendUpdate(buildUpdateParams({ status: ExecutionStatus.RUNNING }))
        await executionProgressReporter.backup()
        expect(lastUploadStatus()).toBe(ExecutionStatus.RUNNING)
    })
})

describe('execution-progress-reporter slicing in single-step test mode', () => {
    beforeEach(() => {
        uploadRunLogMock.mockClear()
        updateRunProgressMock.mockClear()
        updateStepProgressMock.mockClear()
        updateStepProgressMock.mockImplementation(async () => undefined)
    })

    afterEach(async () => {
        await executionProgressReporter.shutdown()
    })

    it('does not slice step outputs when slicingEnabled is false', async () => {
        const engineConstants = generateMockEngineConstants({
            streamStepProgress: StreamStepProgress.WEBSOCKET,
            engineToken: 'mock-engine-token',
            internalApiUrl: 'http://127.0.0.1:65535/',
            logsFileId: 'logs-1',
            stepNameToTest: 'step_emit_big',
        })

        let flowExecutorContext = FlowExecutorContext.empty({
            engineApi: { engineToken: engineConstants.engineToken, internalApiUrl: engineConstants.internalApiUrl },
            slicingEnabled: false,
        })
        flowExecutorContext.verdict = { status: ExecutionStatus.SUCCEEDED, stopResponse: undefined }

        const big = { big: 'x'.repeat(40_000) }
        flowExecutorContext = await flowExecutorContext.upsertStep('step_emit_big', GenericStepOutput.create({
            type: FlowActionType.CODE,
            status: StepOutputStatus.SUCCEEDED,
            input: {},
            output: big,
        }))

        const stored = flowExecutorContext.steps['step_emit_big']
        expect(stored.outputType).toBeUndefined()
        expect(stored.output).toEqual(big)

        executionProgressReporter.init()
        await executionProgressReporter.sendUpdate({ engineConstants, flowExecutorContext })
        await executionProgressReporter.backup()

        const stepResponse = uploadRunLogMock.mock.calls.at(-1)![0].request.stepResponse
        expect(stepResponse!.output).toEqual(big)
    })

    it('streams the raw payload (runId + output), never a fabricated terminal StepRunResponse', async () => {
        const engineConstants = generateMockEngineConstants({
            streamStepProgress: StreamStepProgress.WEBSOCKET,
            engineToken: 'mock-engine-token',
            internalApiUrl: 'http://127.0.0.1:65535/',
            logsFileId: 'logs-1',
        })

        const outputContext = executionProgressReporter.createOutputContext(engineConstants)

        const big = { big: 'x'.repeat(40_000) }
        await outputContext.update({ data: big })

        const lastCall = updateStepProgressMock.mock.calls.at(-1)
        expect(lastCall).toBeDefined()
        // The streaming frame must carry the actual payload and only progress fields —
        // never the terminal success/standardError fields that 400'd the run (#13885).
        expect(lastCall![0].request).toEqual({
            workspaceId: engineConstants.workspaceId,
            runId: engineConstants.executionId,
            output: big,
        })
    })

    it('is best-effort: a failed streaming push never throws out of update()', async () => {
        const engineConstants = generateMockEngineConstants({
            streamStepProgress: StreamStepProgress.WEBSOCKET,
            engineToken: 'mock-engine-token',
            internalApiUrl: 'http://127.0.0.1:65535/',
            logsFileId: 'logs-1',
        })
        updateStepProgressMock.mockRejectedValueOnce(new Error('Failed to POST step-progress: 400 Bad Request'))

        const outputContext = executionProgressReporter.createOutputContext(engineConstants)

        // Must resolve, not reject — a streaming failure must not fail the run.
        await expect(outputContext.update({ data: { partial: true } })).resolves.toBeUndefined()
    })

    it('backup emits standardError as "" for a non-success step that has no errorMessage', async () => {
        const engineConstants = generateMockEngineConstants({
            streamStepProgress: StreamStepProgress.WEBSOCKET,
            engineToken: 'mock-engine-token',
            internalApiUrl: 'http://127.0.0.1:65535/',
            logsFileId: 'logs-1',
            stepNameToTest: 'failing_step',
        })

        let flowExecutorContext = FlowExecutorContext.empty({
            engineApi: { engineToken: engineConstants.engineToken, internalApiUrl: engineConstants.internalApiUrl },
            slicingEnabled: false,
        })
        flowExecutorContext.verdict = { status: ExecutionStatus.RUNNING }
        flowExecutorContext = await flowExecutorContext.upsertStep('failing_step', GenericStepOutput.create({
            type: FlowActionType.CONNECTOR,
            status: StepOutputStatus.FAILED,
            input: {},
            output: undefined,
        }))

        executionProgressReporter.init()
        await executionProgressReporter.sendUpdate({ engineConstants, flowExecutorContext })
        await executionProgressReporter.backup()

        const stepResponse = uploadRunLogMock.mock.calls.at(-1)![0].request.stepResponse
        expect(stepResponse!.standardError).toBe('')
    })
})
