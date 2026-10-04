import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { errorSanitizer, ExecutioOutputFile, FileCompression, FileType, isExecutionStateTerminal, logSerializer, RunInternalError, RunInternalErrorSource, SendWorkflowResponseRequest, StreamStepProgress, truncateFailedStepMessage, UpdateStepProgressRequest, UploadRunLogsRequest, WebsocketClientEvent } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { fileCompressor } from '../../file/file-compressor'
import { fileService } from '../../file/file.service'
import { pubsub } from '../../helper/pubsub'
import { testRunBroadcaster } from '../../privacy/test-run-broadcaster'
import { projectService } from '../../project/project-service'
import { reliabilityEventService } from '../../reliability/reliability-event.service'
import { RunsMetadataUpsertData } from '../../workers/job'
import { executionOwnership } from './execution-ownership'
import { runsMetadataQueue } from './executions-queue'

export const engineRunCallbackService = (log: FastifyBaseLogger) => ({
    async updateRunProgress({ projectId, request }: UpdateRunProgressParams): Promise<void> {
        const { error } = await tryCatch(() => testRunBroadcaster(log).runProgress({ projectId, request }))
        if (error) {
            log.error({ error, project: { id: projectId } }, '[updateRunProgress] Failed to broadcast the masked progress')
        }
    },

    async updateStepProgress({ projectId, request }: UpdateStepProgressParams): Promise<void> {
        const { error } = await tryCatch(() => testRunBroadcaster(log).stepProgress({ projectId, request }))
        if (error) {
            log.error({ error, execution: { id: request.runId } }, '[updateStepProgress] Failed to broadcast the masked progress')
        }
    },

    async sendWorkflowResponse({ request }: SendWorkflowResponseParams): Promise<void> {
        await pubsub.publish(
            `engine-run:sync:${request.workerHandlerId}`,
            JSON.stringify({ requestId: request.httpRequestId, response: request.runResponse }),
        )
    },

    async uploadRunLog({ projectId, request }: UploadRunLogParams): Promise<void> {
        await executionOwnership.assertNotOwnedByAnotherProject({ executionId: request.runId, projectId })
        const internalErrorEnabled = request.internalError?.source === RunInternalErrorSource.ENGINE || true
        const internalError = internalErrorEnabled ? request.internalError : undefined
        const isTerminal = !isNil(request.status) && isExecutionStateTerminal({ status: request.status, ignoreInternalError: false })
        if (isTerminal && !isNil(request.logsFileId)) {
            await ensureLogsFileExists({
                log,
                projectId,
                logsFileId: request.logsFileId,
                internalError,
            })
        }
        const logData: RunsMetadataUpsertData = {
            id: request.runId,
            projectId,
            status: request.status,
            tags: request.tags,
            logsFileId: request.logsFileId,
            displayLogsFileId: request.displayLogsFileId,
            failedStep: truncateFailedStepMessage(errorSanitizer.stripFailedStepMessage({ failedStep: request.failedStep })),
            startTime: request.startTime,
            finishTime: request.finishTime,
            stepsCount: request.stepsCount,
            stepNameToTest: request.stepNameToTest,
            provisionMs: request.provisionMs,
            bootMs: request.bootMs,
            runMs: request.runMs,
        }
        await runsMetadataQueue(log).add(logData)
        const reliabilityEvents = request.reliabilityEvents ?? []
        if (reliabilityEvents.length > 0) {
            const { error } = await tryCatch(() => reliabilityEventService(log).recordEngineEvents({ projectId, executionId: request.runId, events: reliabilityEvents }))
            if (error) {
                log.error({ error, execution: { id: request.runId } }, '[uploadRunLog] Failed to record the reliability events')
            }
        }

        if (request.stepResponse && request.streamStepProgress === StreamStepProgress.WEBSOCKET) {
            const stepResponse = request.stepResponse
            const { error } = await tryCatch(() => testRunBroadcaster(log).stepResponse({
                projectId,
                event: isTerminal ? WebsocketClientEvent.TEST_STEP_FINISHED : WebsocketClientEvent.TEST_STEP_PROGRESS,
                response: stepResponse,
                stepName: request.stepNameToTest,
            }))
            if (error) {
                log.error({ error, execution: { id: request.runId } }, '[uploadRunLog] Failed to broadcast the masked step result')
            }
        }
    },
})

async function ensureLogsFileExists({ log, projectId, logsFileId, internalError }: EnsureLogsFileParams): Promise<void> {
    const { error } = await tryCatch(async () => {
        const fileExists = await fileService(log).exists({
            projectId,
            fileId: logsFileId,
            type: FileType.EXECUTION_LOG,
        })
        if (fileExists && isNil(internalError)) {
            return
        }

        const existing = fileExists
            ? await fileService(log).getDataOrUndefined({ projectId, fileId: logsFileId, type: FileType.EXECUTION_LOG })
            : undefined
        const outputFile: ExecutioOutputFile = !isNil(existing)
            ? JSON.parse(existing.data.toString('utf-8'))
            : { executionState: { steps: {}, tags: [] } }

        const data = await fileCompressor.compress({
            data: await logSerializer.serialize(isNil(internalError) ? outputFile : { ...outputFile, internalError }),
            compression: FileCompression.ZSTD,
        })

        const tenantId = await projectService(log).getTenantId(projectId)
        await fileService(log).save({
            fileId: logsFileId,
            projectId,
            tenantId,
            type: FileType.EXECUTION_LOG,
            data,
            size: data.length,
            compression: FileCompression.ZSTD,
        })
    })

    if (error) {
        log.error({ error, logsFileId, project: { id: projectId } }, '[uploadRunLog] Failed to ensure logs file exists')
    }
}

type UpdateRunProgressParams = {
    projectId: string
    request: unknown
}

type UpdateStepProgressParams = {
    projectId: string
    request: UpdateStepProgressRequest
}

type SendWorkflowResponseParams = {
    request: SendWorkflowResponseRequest
}

type UploadRunLogParams = {
    projectId: string
    request: UploadRunLogsRequest
}

type EnsureLogsFileParams = {
    log: FastifyBaseLogger
    projectId: string
    logsFileId: string
    internalError?: RunInternalError
}
