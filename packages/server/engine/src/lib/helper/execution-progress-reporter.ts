import { promisify } from 'node:util'
import { zstdCompress as zstdCompressCallback } from 'node:zlib'
import { setTimeout } from 'timers/promises'
import { OutputContext } from '@fema-ipaas/connector-sdk'
import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { DEFAULT_MCP_DATA, EngineGenericError, FileCompression, FileType, isExecutionStateTerminal, logSerializer, RunEnvironment, StepOutputStatus, StepRunResponse, UpdateRunProgressRequest, UploadRunLogsRequest } from '@fema-ipaas/shared'
import { Mutex } from 'async-mutex'
import dayjs from 'dayjs'
import { engineFileApi } from '../api/engine-file-api'
import { engineRunApi } from '../api/engine-run-api'
import { EngineConstants } from '../handler/context/engine-constants'
import { WorkflowExecutorContext } from '../handler/context/workflow-execution-context'
import { utils } from '../utils'


const zstdCompress = promisify(zstdCompressCallback)
const stateLock = new Mutex()

const SNAPSHOT_FLUSH_INTERVAL_MS = 15000
let latestUpdateParams: UpdateStepProgressParams | null = null
let savedStartTime: string | null = null
let flushController: AbortController | null = null
let flushLoopPromise: Promise<void> | null = null

export const executionProgressReporter = {
    init: (): void => {
        if (flushController) {
            return
        }
        flushController = new AbortController()
        flushLoopPromise = runFlushLoop(flushController.signal)
    },
    sendUpdate: async (params: UpdateStepProgressParams): Promise<void> => {
        return stateLock.runExclusive(async () => {
            const { engineConstants, workflowExecutorContext, stepNameToUpdate } = params
            if (params.startTime) {
                savedStartTime = params.startTime
            }
            latestUpdateParams = params
            if (!stepNameToUpdate || !engineConstants.isTestWorkflow) { // live runs are updated by backup job
                return
            }
            const step = workflowExecutorContext.getStepOutput(stepNameToUpdate)
            if (isNil(step)) {
                return
            }
            await sendUpdateProgress({
                engineConstants,
                request: {
                    step: {
                        name: stepNameToUpdate,
                        path: workflowExecutorContext.currentPath.path,
                        output: step,
                    },
                    execution: {
                        workspaceId: engineConstants.workspaceId,
                        workflowId: engineConstants.workflowId,
                        workflowVersionId: engineConstants.workflowVersionId,
                        id: engineConstants.executionId,
                        created: dayjs().toISOString(),
                        updated: dayjs().toISOString(),
                        status: workflowExecutorContext.verdict.status,
                        environment: engineConstants.runEnvironment ?? RunEnvironment.TESTING,
                        failParentOnFailure: false,
                        triggeredBy: engineConstants.triggerConnectorName,
                        tags: Array.from(workflowExecutorContext.tags),
                        startTime: params.startTime,
                    },
                },
            })
        })
    },
    createOutputContext: ({ internalApiUrl, engineToken, workspaceId, executionId }: CreateOutputContextParams): OutputContext => {
        return {
            update: async (params: { data: unknown }) => {
                // Streaming output is best-effort — a failed push must never fail the run.
                const { error } = await tryCatch(() => engineRunApi.updateStepProgress({
                    apiUrl: internalApiUrl,
                    engineToken,
                    request: {
                        workspaceId,
                        runId: executionId,
                        output: params.data,
                    },
                }))
                if (error) {
                    console.error('[Progress] Failed to stream step progress', error)
                }
            },
        }
    },
    backup: async (): Promise<void> => {
        await stateLock.runExclusive(async () => {
            const params = latestUpdateParams
            if (isNil(params)) {
                return
            }
            const { workflowExecutorContext, engineConstants } = params
            if (engineConstants.executionId === DEFAULT_MCP_DATA.executionId) {
                return
            }
            const status = workflowExecutorContext.verdict.status
            const isTerminal = isExecutionStateTerminal({ status, ignoreInternalError: false })

            const serialized = await logSerializer.serialize({
                executionState: {
                    steps: workflowExecutorContext.steps,
                    tags: Array.from(workflowExecutorContext.tags),
                },
            })
            const executionState = await zstdCompress(serialized)

            const logsFileId = engineConstants.logsFileId
            if (isNil(logsFileId)) {
                throw new EngineGenericError('LogsFileIdNotSetError', 'Logs file id is not set')
            }
            await engineFileApi.upload({
                engineToken: engineConstants.engineToken,
                apiUrl: engineConstants.internalApiUrl,
                fileId: logsFileId,
                type: FileType.EXECUTION_LOG,
                compression: FileCompression.ZSTD,
                data: executionState,
            })

            const stepResponse = extractStepResponse({
                workflowExecutorContext,
                runId: engineConstants.executionId,
                stepName: engineConstants.stepNameToTest,
            })

            const request: UploadRunLogsRequest = {
                runId: engineConstants.executionId,
                workspaceId: engineConstants.workspaceId,
                status,
                streamStepProgress: engineConstants.streamStepProgress,
                logsFileId: engineConstants.logsFileId,
                failedStep: 'failedStep' in workflowExecutorContext.verdict ? workflowExecutorContext.verdict.failedStep : undefined,
                stepNameToTest: engineConstants.stepNameToTest,
                stepResponse,
                startTime: savedStartTime ?? undefined,
                finishTime: isTerminal ? dayjs().toISOString() : undefined,
                tags: Array.from(workflowExecutorContext.tags),
                stepsCount: workflowExecutorContext.stepsCount,
            }
            await sendLogsUpdate({ engineConstants, request })
        })
    },
    shutdown: async () => {
        if (!flushController) {
            return
        }

        flushController.abort()

        if (flushLoopPromise) {
            await flushLoopPromise
        }

        flushController = null
        flushLoopPromise = null
        latestUpdateParams = null
        savedStartTime = null
    },
}

process.on('SIGTERM', () => void executionProgressReporter.shutdown())
process.on('SIGINT', () => void executionProgressReporter.shutdown())

async function runFlushLoop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
        const { error: flushError } = await tryCatch(() => executionProgressReporter.backup())
        if (flushError) {
            console.error('[Progress] Snapshot flush failed', flushError)
        }

        // sleep aborted → loop will exit naturally on the next signal check
        await tryCatch(() => setTimeout(SNAPSHOT_FLUSH_INTERVAL_MS, undefined, { signal }))
    }
}

const sendUpdateProgress = async ({ engineConstants, request }: SendUpdateProgressParams): Promise<void> => {
    const result = await utils.tryCatchAndThrowOnEngineError(() =>
        engineRunApi.updateRunProgress({
            apiUrl: engineConstants.internalApiUrl,
            engineToken: engineConstants.engineToken,
            request,
        }),
    )
    if (result.error) {
        throw new EngineGenericError('ProgressUpdateError', 'Failed to send updateRunProgress', result.error)
    }
}

const sendLogsUpdate = async ({ engineConstants, request }: SendLogsUpdateParams): Promise<void> => {
    const result = await utils.tryCatchAndThrowOnEngineError(() =>
        engineRunApi.uploadRunLog({
            apiUrl: engineConstants.internalApiUrl,
            engineToken: engineConstants.engineToken,
            request,
        }),
    )
    if (result.error) {
        throw new EngineGenericError('ProgressUpdateError', 'Failed to send uploadRunLog', result.error)
    }
}

const extractStepResponse = (params: ExtractStepResponse): StepRunResponse | undefined => {
    if (isNil(params.stepName)) {
        return undefined
    }

    const stepOutput = params.workflowExecutorContext.getStepOutput(params.stepName)
    if (isNil(stepOutput)) {
        return undefined
    }
    const isSuccess = stepOutput.status === StepOutputStatus.SUCCEEDED || stepOutput.status === StepOutputStatus.PAUSED
    return {
        runId: params.runId,
        success: isSuccess,
        input: stepOutput.input,
        output: stepOutput.output,
        standardError: isSuccess ? '' : (stepOutput.errorMessage ?? ''),
        standardOutput: '',
    }
}

type SendUpdateProgressParams = {
    engineConstants: EngineConstants
    request: UpdateRunProgressRequest
}

type SendLogsUpdateParams = {
    engineConstants: EngineConstants
    request: UploadRunLogsRequest
}

type UpdateStepProgressParams = {
    engineConstants: EngineConstants
    workflowExecutorContext: WorkflowExecutorContext
    stepNameToUpdate?: string
    startTime?: string
}

type CreateOutputContextParams = {
    internalApiUrl: string
    engineToken: string
    workspaceId: string
    executionId: string
}

type ExtractStepResponse = {
    workflowExecutorContext: WorkflowExecutorContext
    runId: string
    stepName?: string
}
