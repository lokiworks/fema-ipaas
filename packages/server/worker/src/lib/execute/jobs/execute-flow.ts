import { inspect } from 'node:util'
import { ErrorCode, isNil, PlatformError, tryCatch } from '@fema/core-utils'
import { onCallService } from '@fema/server-utils'
import { BeginExecuteFlowOperation, EngineOperationType, EngineResponseStatus, ExecuteFlowJobData, ExecutionStatus, ExecutionType, FailedStep, FlowVersion, ResumeExecuteFlowOperation, RunInternalError, RunInternalErrorSource, WorkerJobType } from '@fema/shared'
import { system, WorkerSystemProp } from '../../config/configs'
import { workerSettings } from '../../config/worker-settings'
import { FireAndForgetJobResult, JobContext, JobHandler, JobResultKind } from '../types'
import { isSandboxTimeout } from '../utils/sandbox-helpers'

export const executeFlowJob: JobHandler<ExecuteFlowJobData, FireAndForgetJobResult> = {
    jobType: WorkerJobType.EXECUTE_FLOW,
    async execute(ctx: JobContext, data: ExecuteFlowJobData): Promise<FireAndForgetJobResult> {
        const timeoutInSeconds = workerSettings.getSettings().FLOW_TIMEOUT_SECONDS

        const { data: resolved, error: provisionError } = await tryCatch(() =>
            ctx.resolver.resolve({ platformId: data.platformId, publicApiUrl: ctx.publicApiUrl, engineToken: ctx.engineToken, flow: { id: data.flowId, versionId: data.flowVersionId, workspaceId: data.workspaceId } }),
        )
        if (provisionError) {
            await reportFlowStatus({ ctx, data, status: ExecutionStatus.INTERNAL_ERROR, internalError: toInternalError(RunInternalErrorSource.WORKER, provisionError) })
            throw provisionError
        }

        // A deleted/disabled flow can't run — the run is correctly marked FAILED, but the job itself must
        // COMPLETE, not return INTERNAL_ERROR. INTERNAL_ERROR fails+retries the job and pages oncall for a
        // user condition (the flow was disabled/removed while jobs were still queued).
        if (resolved.kind === 'flow-not-found') {
            ctx.log.info({ flowVersion: { id: data.flowVersionId } }, 'Flow version not found, skipping')
            await reportFlowStatus({ ctx, data, status: ExecutionStatus.FAILED })
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }

        if (resolved.kind === 'disabled') {
            await reportFlowStatus({ ctx, data, status: ExecutionStatus.FAILED, failedStep: resolved.failedStep })
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }

        // resolved.kind === 'ready' — flowVersion is guaranteed present when flow: is passed to resolve
        if (isNil(resolved.flowVersion)) {
            const error = new PlatformError({ code: ErrorCode.VALIDATION, params: { message: 'flowVersion missing after resolve' } })
            await reportFlowStatus({ ctx, data, status: ExecutionStatus.INTERNAL_ERROR, internalError: toInternalError(RunInternalErrorSource.WORKER, error) })
            throw error
        }
        const flowVersion: FlowVersion = resolved.flowVersion

        if (data.executionType === ExecutionType.RESUME && isNil(data.logsFileId)) {
            const error = new PlatformError({
                code: ErrorCode.RESUME_LOGS_FILE_MISSING,
                params: { runId: data.runId },
            }, 'logsFileId is missing for RESUME operation')
            await reportFlowStatus({ ctx, data, status: ExecutionStatus.INTERNAL_ERROR, internalError: toInternalError(RunInternalErrorSource.WORKER, error) })
            throw error
        }

        try {
            const operation = buildFlowOperation(ctx, data, flowVersion, timeoutInSeconds)
            const result = await ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: EngineOperationType.EXECUTE_FLOW,
                operation,
                timeoutInSeconds,
                provision: resolved.provision,
            })

            // Best-effort latency breakdown for the runs page; reuses the run-log metadata upload
            // with no status so it only merges the timings the engine's own report can't measure.
            await tryCatch(() => ctx.apiClient.uploadRunLog({
                runId: data.runId,
                workspaceId: data.workspaceId,
                provisionMs: result.timings.provisionMs,
                bootMs: result.timings.bootMs,
                runMs: result.timings.runMs,
            }))

            if (result.status === EngineResponseStatus.LOG_SIZE_EXCEEDED) {
                await reportFlowStatus({ ctx, data, status: ExecutionStatus.LOG_SIZE_EXCEEDED })
                return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.LOG_SIZE_EXCEEDED, logs: result.logs }
            }

            if (result.status === EngineResponseStatus.INTERNAL_ERROR) {
                await reportFlowStatus({ ctx, data, status: ExecutionStatus.INTERNAL_ERROR, internalError: {
                    source: RunInternalErrorSource.ENGINE,
                    message: result.error ?? 'Engine reported an internal error without details',
                    occurredAt: new Date().toISOString(),
                } })
                return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.INTERNAL_ERROR, logs: result.logs }
            }

            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK, logs: result.logs }
        }
        catch (e) {
            if (isSandboxTimeout(e)) {
                await reportFlowStatus({ ctx, data, status: ExecutionStatus.TIMEOUT })
                return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.TIMEOUT }
            }
            if (e instanceof PlatformError) {
                if (e.error.code === ErrorCode.SANDBOX_MEMORY_ISSUE) {
                    await reportFlowStatus({ ctx, data, status: ExecutionStatus.MEMORY_LIMIT_EXCEEDED })
                    return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.MEMORY_ISSUE }
                }
                if (e.error.code === ErrorCode.SANDBOX_LOG_SIZE_EXCEEDED) {
                    await reportFlowStatus({ ctx, data, status: ExecutionStatus.LOG_SIZE_EXCEEDED })
                    return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.LOG_SIZE_EXCEEDED }
                }
            }
            await reportFlowStatus({ ctx, data, status: ExecutionStatus.INTERNAL_ERROR, internalError: toInternalError(RunInternalErrorSource.WORKER, e) })
            throw e
        }
    },
}

function buildFlowOperation(
    ctx: JobContext,
    data: ExecuteFlowJobData,
    flowVersion: FlowVersion,
    timeoutInSeconds: number,
): BeginExecuteFlowOperation | ResumeExecuteFlowOperation {
    const base = {
        flowVersion,
        executionId: data.runId,
        workspaceId: data.workspaceId,
        workerHandlerId: data.workerHandlerId ?? null,
        runEnvironment: data.environment,
        httpRequestId: data.httpRequestId ?? null,
        streamStepProgress: data.streamStepProgress,
        stepNameToTest: data.stepNameToTest ?? null,
        logsFileId: data.logsFileId,
        timeoutInSeconds,
        platformId: data.platformId,
        engineToken: ctx.engineToken,
        internalApiUrl: ctx.internalApiUrl,
        publicApiUrl: ctx.publicApiUrl,
    }

    if (data.executionType === ExecutionType.RESUME) {
        return {
            ...base,
            executionType: ExecutionType.RESUME,
            resumePayload: data.payload,
            resumeReason: data.resumeReason,
        }
    }

    return {
        ...base,
        executionType: ExecutionType.BEGIN,
        triggerPayload: data.payload,
        executeTrigger: data.executeTrigger ?? false,
        sampleData: data.sampleData,
    }
}

function toInternalError(source: RunInternalErrorSource, error: unknown): RunInternalError {
    const isApError = error instanceof PlatformError
    const base = error instanceof Error
        ? [error.name, error.message, error.stack].filter(Boolean).join('\n')
        : inspect(error, { depth: 1 })
    return {
        source,
        message: base,
        code: isApError ? error.error.code : undefined,
        occurredAt: new Date().toISOString(),
    }
}

async function reportFlowStatus({ ctx, data, status, internalError, failedStep }: ReportFlowStatusParams): Promise<void> {
    // A status report has no log file of its own; carry logsFileId only for an internalError the server may
    // persist into one (see uploadRunLog). Sending it on a plain status report would dangle execution.logsFileId.
    await ctx.apiClient.uploadRunLog({
        runId: data.runId,
        status,
        workspaceId: data.workspaceId,
        streamStepProgress: data.streamStepProgress,
        finishTime: new Date().toISOString(),
        ...(isNil(internalError) ? {} : { logsFileId: data.logsFileId }),
        internalError,
        failedStep,
    })

    if (status === ExecutionStatus.INTERNAL_ERROR && isDedicatedWorker()) {
        onCallService(ctx.log, workerSettings.getSettings().PAGE_ONCALL_WEBHOOK).page({
            code: ErrorCode.ENGINE_OPERATION_FAILURE,
            message: `Flow run ${data.runId} ended with INTERNAL_ERROR`,
            params: { runId: data.runId, flowId: data.flowId, workspaceId: data.workspaceId },
        }).catch((e) => ctx.log.error({ execution: { id: data.runId }, error: inspect(e) }, 'Failed to send on-call page for INTERNAL_ERROR'))
    }
}

function isDedicatedWorker(): boolean {
    return !isNil(system.get(WorkerSystemProp.WORKER_GROUP_ID))
}

type ReportFlowStatusParams = {
    ctx: JobContext
    data: ExecuteFlowJobData
    status: ExecutionStatus
    internalError?: RunInternalError
    failedStep?: FailedStep
}
