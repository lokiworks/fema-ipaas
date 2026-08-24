import { ExecutionId, generateId, isNil } from '@fema-ipaas/core-utils'
import { EngineHttpResponse, Execution, ExecutionStatus, ExecutionType, isExecutionStateTerminal, ResumeReason, RunEnvironment, StreamStepProgress } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { distributedLock } from '../../../database/redis-connections'
import { engineResponseWatcher } from '../../../workers/engine-response-watcher'
import { workspaceService } from '../../../workspace/workspace-service'
import { addToQueue, executionService, findExecutionOrThrow, WEBHOOK_TIMEOUT_MS } from '../execution-service'
import { executionSideEffects } from '../execution-side-effects'
import { waitpointService } from './waitpoint-service'
import { Waitpoint, WaitpointResumePayload, WaitpointStatus } from './waitpoint-types'

export const resumeService = (log: FastifyBaseLogger) => ({
    async resumeFromWaitpoint({ executionId, waitpointId, resumePayload, workerHandlerId, httpRequestId }: ResumeFromWaitpointParams): Promise<ResumeFromWaitpointResult> {
        return distributedLock(log).runExclusive({
            key: `runs_metadata_${executionId}`,
            timeoutInSeconds: 30,
            fn: () => this.resumeFromWaitpointWithoutLock({ executionId, waitpointId, resumePayload, workerHandlerId, httpRequestId }),
        })
    },

    async resumeFromWaitpointWithoutLock({ executionId, waitpointId, resumePayload, workerHandlerId, httpRequestId }: ResumeFromWaitpointParams): Promise<ResumeFromWaitpointResult> {
        const execution = await findExecutionOrThrow(executionId)
        const processed = await waitpointService(log).handleResumeSignal({
            executionId,
            waitpointId,
            executionStatus: execution.status,
            workspaceId: execution.workspaceId,
            resumePayload: resumePayload ?? null,
            workerHandlerId,
            onReady: async (waitpoint) => {
                await enqueueResume({
                    execution,
                    waitpoint,
                    resumePayload,
                    workerHandlerId,
                    httpRequestId,
                }, log)
            },
        })

        if (processed) {
            const currentExecution = await findExecutionOrThrow(executionId)
            if (currentExecution.status === ExecutionStatus.PAUSED) {
                const latestWaitpoint = await waitpointService(log).getByExecutionId(executionId)
                if (!isNil(latestWaitpoint) && latestWaitpoint.status === WaitpointStatus.COMPLETED) {
                    log.info({ execution: { id: executionId } }, '[resumeService#resumeFromWaitpointWithoutLock] Race detected: metadata worker wrote PAUSED after callback completed waitpoint; consuming waitpoint and enqueuing resume')
                    // Consume the stale COMPLETED waitpoint under the lock so it cannot
                    // poison the next createForPause call on a subsequent loop iteration
                    await waitpointService(log).delete({ id: latestWaitpoint.id })
                    await enqueueResume({
                        execution: currentExecution,
                        waitpoint: latestWaitpoint,
                        resumePayload: resumePayload ?? null,
                        workerHandlerId,
                        httpRequestId,
                    }, log)
                }
            }
        }

        return { execution, stale: !processed }
    },

    async legacyResume({ executionId, resumePayload, workerHandlerId }: LegacyResumeParams): Promise<ResumeFromWaitpointResult> {
        const execution = await findExecutionOrThrow(executionId)
        if (execution.status !== ExecutionStatus.PAUSED) {
            return { execution, stale: true }
        }
        await enqueueResume({ execution, resumePayload, workerHandlerId }, log)
        return { execution, stale: false }
    },

    async handleSyncResumeWorkflow({ runId, waitpointId, payload, correlationId }: HandleSyncResumeWorkflowParams): Promise<EngineHttpResponse> {
        const execution = await executionService(log).getOnePopulatedOrThrow({
            id: runId,
            workspaceId: undefined,
        })

        if (isExecutionStateTerminal({ status: execution.status, ignoreInternalError: false })) {
            return {
                status: StatusCodes.CONFLICT,
                body: { message: 'Workflow run is not paused', executionStatus: execution.status },
                headers: {},
            }
        }

        const syncServerId = engineResponseWatcher(log).getServerId()
        const { stale } = await this.resumeFromWaitpoint({
            executionId: runId,
            waitpointId,
            resumePayload: payload,
            workerHandlerId: syncServerId,
            httpRequestId: correlationId,
        })

        if (stale) {
            return {
                status: StatusCodes.GONE,
                body: { message: 'This link has expired. The action may have already been processed.' },
                headers: {},
            }
        }

        return engineResponseWatcher(log).oneTimeListener<EngineHttpResponse>(correlationId, true, WEBHOOK_TIMEOUT_MS, {
            status: StatusCodes.NO_CONTENT,
            body: {},
            headers: {},
        })
    },

    async legacySyncResume({ runId, payload, correlationId }: LegacySyncResumeParams): Promise<EngineHttpResponse> {
        const execution = await findExecutionOrThrow(runId)
        if (execution.status !== ExecutionStatus.PAUSED) {
            return {
                status: StatusCodes.CONFLICT,
                body: { message: 'Workflow run is not paused', executionStatus: execution.status },
                headers: {},
            }
        }
        const syncServerId = engineResponseWatcher(log).getServerId()
        await enqueueResume({ execution, resumePayload: payload, workerHandlerId: syncServerId, httpRequestId: correlationId }, log)
        return engineResponseWatcher(log).oneTimeListener<EngineHttpResponse>(correlationId, true, WEBHOOK_TIMEOUT_MS, {
            status: StatusCodes.NO_CONTENT,
            body: {},
            headers: {},
        })
    },
})

async function enqueueResume(params: EnqueueResumeParams, log: FastifyBaseLogger): Promise<void> {
    const { execution, waitpoint, resumePayload, workerHandlerId, httpRequestId } = params
    const tenantId = await workspaceService(log).getTenantId(execution.workspaceId)
    // Namespace the BullMQ job with waitpoint id so it cannot be deduplicated
    // against the still-active BEGIN job or a consecutive resume for a different waitpoint
    const waitpointId = waitpoint?.id ?? 'legacy'
    await addToQueue({
        payload: resumePayload,
        execution,
        tenantId,
        workerHandlerId: workerHandlerId ?? waitpoint?.workerHandlerId ?? undefined,
        httpRequestId: httpRequestId ?? waitpoint?.httpRequestId ?? generateId(),
        streamStepProgress: execution.environment === RunEnvironment.TESTING
            ? StreamStepProgress.WEBSOCKET
            : StreamStepProgress.NONE,
        executionType: ExecutionType.RESUME,
        resumeReason: ResumeReason.WAITPOINT,
        jobId: `${execution.id}-resume-${waitpointId}`,
    }, log)
    await executionSideEffects(log).onResume({ execution, tenantId })
}

type SyncResumePayload = {
    body?: unknown
    headers?: Record<string, string>
    queryParams?: Record<string, string>
}

type HandleSyncResumeWorkflowParams = {
    runId: string
    waitpointId: string
    payload: SyncResumePayload
    correlationId: string
}

type LegacySyncResumeParams = {
    runId: string
    payload: SyncResumePayload
    correlationId: string
}

type ResumeFromWaitpointParams = {
    executionId: ExecutionId
    waitpointId: string
    resumePayload: WaitpointResumePayload
    workerHandlerId?: string
    httpRequestId?: string
}

type LegacyResumeParams = {
    executionId: ExecutionId
    resumePayload: WaitpointResumePayload
    workerHandlerId?: string
}

type ResumeFromWaitpointResult = {
    execution: Execution
    stale: boolean
}

type EnqueueResumeParams = {
    execution: Execution
    waitpoint?: Waitpoint
    resumePayload: WaitpointResumePayload
    workerHandlerId?: string
    httpRequestId?: string
}
