import { isNil, tryCatch } from '@fema/core-utils'
import { ExecutioOutputFile, FileCompression, FileType, isFlowRunStateTerminal, logSerializer, RunInternalError, RunInternalErrorSource, SendFlowResponseRequest, StreamStepProgress, truncateFailedStepMessage, UpdateStepProgressRequest, UploadRunLogsRequest, WebsocketClientEvent } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { websocketService } from '../../core/websockets.service'
import { fileCompressor } from '../../file/file-compressor'
import { fileService } from '../../file/file.service'
import { pubsub } from '../../helper/pubsub'
import { RunsMetadataUpsertData } from '../../workers/job'
import { workspaceService } from '../../workspace/workspace-service'
import { runsMetadataQueue } from './flow-runs-queue'

export const engineRunCallbackService = (log: FastifyBaseLogger) => ({
    updateRunProgress({ workspaceId, request }: UpdateRunProgressParams): void {
        websocketService.to(workspaceId).emit(WebsocketClientEvent.UPDATE_RUN_PROGRESS, request)
    },

    updateStepProgress({ workspaceId, request }: UpdateStepProgressParams): void {
        websocketService.to(workspaceId).emit(WebsocketClientEvent.TEST_STEP_PROGRESS, request)
    },

    async sendFlowResponse({ request }: SendFlowResponseParams): Promise<void> {
        await pubsub.publish(
            `engine-run:sync:${request.workerHandlerId}`,
            JSON.stringify({ requestId: request.httpRequestId, response: request.runResponse }),
        )
    },

    async uploadRunLog({ workspaceId, request }: UploadRunLogParams): Promise<void> {
        const internalErrorEnabled = request.internalError?.source === RunInternalErrorSource.ENGINE || true
        const internalError = internalErrorEnabled ? request.internalError : undefined
        const isTerminal = !isNil(request.status) && isFlowRunStateTerminal({ status: request.status, ignoreInternalError: false })
        if (isTerminal && !isNil(request.logsFileId)) {
            await ensureLogsFileExists({
                log,
                workspaceId,
                logsFileId: request.logsFileId,
                internalError,
            })
        }
        const logData: RunsMetadataUpsertData = {
            id: request.runId,
            workspaceId,
            status: request.status,
            tags: request.tags,
            logsFileId: request.logsFileId,
            failedStep: truncateFailedStepMessage(request.failedStep),
            startTime: request.startTime,
            finishTime: request.finishTime,
            stepsCount: request.stepsCount,
            stepNameToTest: request.stepNameToTest,
            provisionMs: request.provisionMs,
            bootMs: request.bootMs,
            runMs: request.runMs,
        }
        await runsMetadataQueue(log).add(logData)

        if (request.stepResponse && request.streamStepProgress === StreamStepProgress.WEBSOCKET) {
            const stepData = { ...request.stepResponse, workspaceId }
            if (!isTerminal) {
                websocketService.to(workspaceId).emit(WebsocketClientEvent.TEST_STEP_PROGRESS, stepData)
            }
            else {
                websocketService.to(workspaceId).emit(WebsocketClientEvent.TEST_STEP_FINISHED, stepData)
            }
        }
    },
})

async function ensureLogsFileExists({ log, workspaceId, logsFileId, internalError }: EnsureLogsFileParams): Promise<void> {
    const { error } = await tryCatch(async () => {
        const fileExists = await fileService(log).exists({
            workspaceId,
            fileId: logsFileId,
            type: FileType.FLOW_RUN_LOG,
        })
        if (fileExists && isNil(internalError)) {
            return
        }

        const existing = fileExists
            ? await fileService(log).getDataOrUndefined({ workspaceId, fileId: logsFileId, type: FileType.FLOW_RUN_LOG })
            : undefined
        const outputFile: ExecutioOutputFile = !isNil(existing)
            ? JSON.parse(existing.data.toString('utf-8'))
            : { executionState: { steps: {}, tags: [] } }

        const data = await fileCompressor.compress({
            data: await logSerializer.serialize(isNil(internalError) ? outputFile : { ...outputFile, internalError }),
            compression: FileCompression.ZSTD,
        })

        const platformId = await workspaceService(log).getPlatformId(workspaceId)
        await fileService(log).save({
            fileId: logsFileId,
            workspaceId,
            platformId,
            type: FileType.FLOW_RUN_LOG,
            data,
            size: data.length,
            compression: FileCompression.ZSTD,
        })
    })

    if (error) {
        log.error({ error, logsFileId, workspace: { id: workspaceId } }, '[uploadRunLog] Failed to ensure logs file exists')
    }
}

type UpdateRunProgressParams = {
    workspaceId: string
    request: unknown
}

type UpdateStepProgressParams = {
    workspaceId: string
    request: UpdateStepProgressRequest
}

type SendFlowResponseParams = {
    request: SendFlowResponseRequest
}

type UploadRunLogParams = {
    workspaceId: string
    request: UploadRunLogsRequest
}

type EnsureLogsFileParams = {
    log: FastifyBaseLogger
    workspaceId: string
    logsFileId: string
    internalError?: RunInternalError
}
