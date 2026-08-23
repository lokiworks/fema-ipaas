import { inspect } from 'node:util'
import { ApplicationError, ErrorCode, isNil, tryCatch } from '@fema-ipaas/core-utils'
import { onCallService } from '@fema-ipaas/server-utils'
import { BeginExecuteWorkflowOperation, EngineOperationType, EngineResponseStatus, ExecuteWorkflowJobData, ExecutionStatus, ExecutionType, FailedStep, ResumeExecuteWorkflowOperation, RunInternalError, RunInternalErrorSource, WorkerJobType, WorkflowVersion } from '@fema-ipaas/shared'
import { system, WorkerSystemProp } from '../../config/configs'
import { workerSettings } from '../../config/worker-settings'
import { FireAndForgetJobResult, JobContext, JobHandler, JobResultKind } from '../types'
import { isSandboxTimeout } from '../utils/sandbox-helpers'

export const executeWorkflowJob: JobHandler<ExecuteWorkflowJobData, FireAndForgetJobResult> = {
    jobType: WorkerJobType.EXECUTE_WORKFLOW,
    async execute(ctx: JobContext, data: ExecuteWorkflowJobData): Promise<FireAndForgetJobResult> {
        const timeoutInSeconds = workerSettings.getSettings().WORKFLOW_TIMEOUT_SECONDS

        const { data: resolved, error: provisionError } = await tryCatch(() =>
            ctx.resolver.resolve({ tenantId: data.tenantId, publicApiUrl: ctx.publicApiUrl, engineToken: ctx.engineToken, workflow: { id: data.workflowId, versionId: data.workflowVersionId, workspaceId: data.workspaceId } }),
        )
        if (provisionError) {
            await reportWorkflowStatus({ ctx, data, status: ExecutionStatus.INTERNAL_ERROR, internalError: toInternalError(RunInternalErrorSource.WORKER, provisionError) })
            throw provisionError
        }

        // A deleted/disabled workflow can't run — the run is correctly marked FAILED, but the job itself must
        // COMPLETE, not return INTERNAL_ERROR. INTERNAL_ERROR fails+retries the job and pages oncall for a
        // user condition (the workflow was disabled/removed while jobs were still queued).
        if (resolved.kind === 'workflow-not-found') {
            ctx.log.info({ workflowVersion: { id: data.workflowVersionId } }, 'Workflow version not found, skipping')
            await reportWorkflowStatus({ ctx, data, status: ExecutionStatus.FAILED })
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }

        if (resolved.kind === 'disabled') {
            await reportWorkflowStatus({ ctx, data, status: ExecutionStatus.FAILED, failedStep: resolved.failedStep })
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }

        // resolved.kind === 'ready' — workflowVersion is guaranteed present when workflow: is passed to resolve
        if (isNil(resolved.workflowVersion)) {
            const error = new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'workflowVersion missing after resolve' } })
            await reportWorkflowStatus({ ctx, data, status: ExecutionStatus.INTERNAL_ERROR, internalError: toInternalError(RunInternalErrorSource.WORKER, error) })
            throw error
        }
        const workflowVersion: WorkflowVersion = resolved.workflowVersion

        if (data.executionType === ExecutionType.RESUME && isNil(data.logsFileId)) {
            const error = new ApplicationError({
                code: ErrorCode.RESUME_LOGS_FILE_MISSING,
                params: { runId: data.runId },
            }, 'logsFileId is missing for RESUME operation')
            await reportWorkflowStatus({ ctx, data, status: ExecutionStatus.INTERNAL_ERROR, internalError: toInternalError(RunInternalErrorSource.WORKER, error) })
            throw error
        }

        try {
            const operation = buildWorkflowOperation(ctx, data, workflowVersion, timeoutInSeconds)
            const result = await ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: EngineOperationType.EXECUTE_WORKFLOW,
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
                await reportWorkflowStatus({ ctx, data, status: ExecutionStatus.LOG_SIZE_EXCEEDED })
                return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.LOG_SIZE_EXCEEDED, logs: result.logs }
            }

            if (result.status === EngineResponseStatus.INTERNAL_ERROR) {
                await reportWorkflowStatus({ ctx, data, status: ExecutionStatus.INTERNAL_ERROR, internalError: {
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
                await reportWorkflowStatus({ ctx, data, status: ExecutionStatus.TIMEOUT })
                return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.TIMEOUT }
            }
            if (e instanceof ApplicationError) {
                if (e.error.code === ErrorCode.SANDBOX_MEMORY_ISSUE) {
                    await reportWorkflowStatus({ ctx, data, status: ExecutionStatus.MEMORY_LIMIT_EXCEEDED })
                    return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.MEMORY_ISSUE }
                }
                if (e.error.code === ErrorCode.SANDBOX_LOG_SIZE_EXCEEDED) {
                    await reportWorkflowStatus({ ctx, data, status: ExecutionStatus.LOG_SIZE_EXCEEDED })
                    return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.LOG_SIZE_EXCEEDED }
                }
            }
            await reportWorkflowStatus({ ctx, data, status: ExecutionStatus.INTERNAL_ERROR, internalError: toInternalError(RunInternalErrorSource.WORKER, e) })
            throw e
        }
    },
}

function buildWorkflowOperation(
    ctx: JobContext,
    data: ExecuteWorkflowJobData,
    workflowVersion: WorkflowVersion,
    timeoutInSeconds: number,
): BeginExecuteWorkflowOperation | ResumeExecuteWorkflowOperation {
    const base = {
        workflowVersion,
        executionId: data.runId,
        workspaceId: data.workspaceId,
        workerHandlerId: data.workerHandlerId ?? null,
        runEnvironment: data.environment,
        httpRequestId: data.httpRequestId ?? null,
        streamStepProgress: data.streamStepProgress,
        stepNameToTest: data.stepNameToTest ?? null,
        logsFileId: data.logsFileId,
        timeoutInSeconds,
        tenantId: data.tenantId,
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
    const isApError = error instanceof ApplicationError
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

async function reportWorkflowStatus({ ctx, data, status, internalError, failedStep }: ReportWorkflowStatusParams): Promise<void> {
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
            message: `Workflow run ${data.runId} ended with INTERNAL_ERROR`,
            params: { runId: data.runId, workflowId: data.workflowId, workspaceId: data.workspaceId },
        }).catch((e) => ctx.log.error({ execution: { id: data.runId }, error: inspect(e) }, 'Failed to send on-call page for INTERNAL_ERROR'))
    }
}

function isDedicatedWorker(): boolean {
    return !isNil(system.get(WorkerSystemProp.WORKER_GROUP_ID))
}

type ReportWorkflowStatusParams = {
    ctx: JobContext
    data: ExecuteWorkflowJobData
    status: ExecutionStatus
    internalError?: RunInternalError
    failedStep?: FailedStep
}
