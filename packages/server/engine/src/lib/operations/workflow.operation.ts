import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { EngineGenericError, EngineResponse, EngineResponseStatus, ExecuteTriggerResponse, ExecuteWorkflowOperation, ExecutionError, ExecutionErrorType, ExecutionState, ExecutionStatus, ExecutionType, GenericStepOutput, LoopStepOutput, ResumePayload, ResumeReason, StepOutput, StepOutputStatus, TriggerHookType, TriggerPayload, WorkflowActionType, workflowStructureUtil } from '@fema-ipaas/shared'
import { engineFileApi } from '../api/engine-file-api'
import { triggerRunner } from '../core/connector/trigger-runner'
import { EngineConstants, ResolvedBeginExecuteWorkflowOperation, ResolvedExecuteWorkflowOperation } from '../handler/context/engine-constants'
import { testExecutionContext } from '../handler/context/test-execution-context'
import { WorkflowExecutorContext } from '../handler/context/workflow-execution-context'
import { workflowExecutor } from '../handler/workflow-executor'
import { executionProgressReporter } from '../helper/execution-progress-reporter'
import { utils } from '../utils'
import { resolveJobPayload } from './utils/resolve-job-payload'

export const workflowOperation = {
    execute: async (operation: ExecuteWorkflowOperation): Promise<EngineResponse<undefined>> => {
        const { data: input, error: resolveError } = await tryCatch(() => resolveExecuteWorkflowOperation(operation))
        if (resolveError) {
            // Resolving inputs before execution downloads files: the trigger payload (BEGIN) or the resume
            // log/payload (RESUME). If one was deleted/expired (404), that is a user/data-lifecycle error, not
            // an engine bug — report a FAILED run instead of letting it escape as INTERNAL_ERROR, which
            // fails+retries the worker job and pages oncall (and can never recover an expired file).
            // EngineFileNotFoundError is USER-typed precisely for this; a BEGIN-only gate defeated it on
            // RESUME. Only genuine ENGINE errors (e.g. a transient 5xx download) keep the throw path.
            if (!isEngineExecutionError(resolveError)) {
                return reportFailedTriggerRun({ operation, error: resolveError })
            }
            throw resolveError
        }
        const constants = EngineConstants.fromExecuteWorkflowInput(input)
        const { data: output, error: executionError } = await tryCatch(() => executeSingleStepOrWorkflow(input, constants))
        if (executionError) {
            // Trigger run()/onStart() hooks and single-step test resolution can throw a plain Error/TypeError
            // or a non-ExecutionError (e.g. ENTITY_NOT_FOUND when testing a deleted step). Like an action step
            // throwing, those are user/connector-level failures and must surface as a FAILED run, never
            // INTERNAL_ERROR. Only genuine ENGINE errors keep paging + retrying.
            if (isEngineExecutionError(executionError)) {
                throw executionError
            }
            return reportFailedRun({ input, constants, error: executionError })
        }
        const finished = output.finishExecution()
        await executionProgressReporter.sendUpdate({
            engineConstants: constants,
            workflowExecutorContext: finished,
        })
        await executionProgressReporter.backup()
        const status = finished.verdict.status === ExecutionStatus.LOG_SIZE_EXCEEDED
            ? EngineResponseStatus.LOG_SIZE_EXCEEDED
            : EngineResponseStatus.OK
        return {
            status,
            response: undefined,
        }
    },
}

function isEngineExecutionError(error: unknown): boolean {
    return error instanceof ExecutionError && error.type === ExecutionErrorType.ENGINE
}

async function reportFailedTriggerRun({ operation, error }: ReportFailedTriggerRunParams): Promise<EngineResponse<undefined>> {
    // Inputs were never resolved (that is why we are here), so build a minimal resolved shape purely to report
    // a FAILED run. buildFailedTriggerContext only reads workflowVersion + executionType, so the resume
    // placeholders below are never actually consumed — they exist solely to satisfy ResolvedExecuteWorkflowOperation.
    const input: ResolvedExecuteWorkflowOperation = operation.executionType === ExecutionType.BEGIN
        ? { ...operation, triggerPayload: undefined }
        : { ...operation, resumePayload: { body: undefined, headers: {}, queryParams: {} }, executionState: { steps: {}, tags: [] } }
    return reportFailedRun({ input, constants: EngineConstants.fromExecuteWorkflowInput(input), error })
}

async function reportFailedRun({ input, constants, error }: ReportFailedRunParams): Promise<EngineResponse<undefined>> {
    const baseContext = WorkflowExecutorContext.empty({
        engineApi: {
            engineToken: constants.engineToken,
            internalApiUrl: constants.internalApiUrl,
        },
    })
    const output = (await buildFailedTriggerContext({ input, baseContext, error })).finishExecution()
    await executionProgressReporter.sendUpdate({
        engineConstants: constants,
        workflowExecutorContext: output,
    })
    await executionProgressReporter.backup()
    return {
        status: EngineResponseStatus.OK,
        response: undefined,
    }
}

const executeSingleStepOrWorkflow = async (input: ResolvedExecuteWorkflowOperation, constants: EngineConstants): Promise<WorkflowExecutorContext> => {
    const testSingleStepMode = !isNil(constants.stepNameToTest)
    if (testSingleStepMode) {
        const testContext = await testExecutionContext.stateFromWorkflowVersion({
            apiUrl: input.internalApiUrl,
            workflowVersion: input.workflowVersion,
            excludedStepName: input.stepNameToTest!,
            workspaceId: input.workspaceId,
            engineToken: input.engineToken,
            sampleData: input.sampleData,
            engineConstants: constants,
        })
        const step = workflowStructureUtil.getActionOrThrow(input.stepNameToTest!, input.workflowVersion.trigger)
        const executionState = await resolveStateOrThrowOnNonUserError({ input, constants, baseContext: testContext })
        if (executionState.verdict.status !== ExecutionStatus.RUNNING) {
            return executionState
        }
        return workflowExecutor.execute({
            action: step,
            executionState,
            constants,
        })
    }
    const emptyContext = WorkflowExecutorContext.empty({
        engineApi: {
            engineToken: constants.engineToken,
            internalApiUrl: constants.internalApiUrl,
        },
    })
    const executionState = await resolveStateOrThrowOnNonUserError({ input, constants, baseContext: emptyContext })
    if (executionState.verdict.status !== ExecutionStatus.RUNNING) {
        return executionState
    }
    return workflowExecutor.executeFromTrigger({
        executionState,
        constants,
        input,
    })
}

async function resolveStateOrThrowOnNonUserError({ input, constants, baseContext }: ResolveStateParams): Promise<WorkflowExecutorContext> {
    const { data: executionState, error } = await tryCatch(() => getWorkflowExecutionState(input, constants, baseContext))
    if (!error) {
        return executionState
    }
    if (error instanceof ExecutionError && error.type === ExecutionErrorType.USER) {
        return buildFailedTriggerContext({ input, baseContext, error })
    }
    throw error
}

async function buildFailedTriggerContext({ input, baseContext, error }: BuildFailedTriggerContextParams): Promise<WorkflowExecutorContext> {
    const trigger = input.workflowVersion.trigger
    const message = error instanceof ExecutionError ? utils.formatExecutionError(error) : utils.formatError(error)
    const triggerPayload = input.executionType === ExecutionType.BEGIN ? input.triggerPayload : undefined
    const failedTriggerOutput = GenericStepOutput.create({
        type: trigger.type,
        status: StepOutputStatus.FAILED,
        input: {},
    }).setOutput(triggerPayload ?? {}).setErrorMessage(message)
    return (await baseContext.upsertStep(trigger.name, failedTriggerOutput)).setVerdict({
        status: ExecutionStatus.FAILED,
        failedStep: {
            name: trigger.name,
            displayName: trigger.displayName,
            message,
        },
    })
}

async function getWorkflowExecutionState(input: ResolvedExecuteWorkflowOperation, constants: EngineConstants, workflowContext: WorkflowExecutorContext): Promise<WorkflowExecutorContext> {
    if (input.executionType === ExecutionType.BEGIN) {
        const newPayload = await runOrReturnPayload(input, constants)
        return workflowContext.upsertStep(input.workflowVersion.trigger.name,
            GenericStepOutput.create({
                type: input.workflowVersion.trigger.type,
                status: StepOutputStatus.SUCCEEDED,
                input: {},
            }).setOutput(newPayload))
    }
    workflowContext = workflowContext.addTags(input.executionState.tags)
    const isWaitpointResume = input.resumeReason === ResumeReason.WAITPOINT
    for (const [step, output] of Object.entries(input.executionState.steps)) {
        if (isStepRestorable({ status: output.status, isWaitpointResume })) {
            const newOutput = await insertSuccessStepsOrPausedRecursively({ stepOutput: output, isWaitpointResume })
            if (!isNil(newOutput)) {
                workflowContext = await workflowContext.upsertStep(step, newOutput)
            }
        }
    }
    return workflowContext
}

async function runOrReturnPayload(input: ResolvedBeginExecuteWorkflowOperation, constants: EngineConstants): Promise<TriggerPayload> {
    if (!input.executeTrigger) {
        return input.triggerPayload as TriggerPayload
    }
    const newPayload = await triggerRunner.executeTrigger({
        params: {
            ...input,
            hookType: TriggerHookType.RUN,
            test: false,
            webhookUrl: '',
            triggerPayload: input.triggerPayload,
        },
        constants,
    }) as ExecuteTriggerResponse<TriggerHookType.RUN>
    return newPayload.output[0] as TriggerPayload
}


async function insertSuccessStepsOrPausedRecursively({ stepOutput, isWaitpointResume }: InsertStepsParams): Promise<StepOutput | null> {
    if (!isStepRestorable({ status: stepOutput.status, isWaitpointResume })) {
        return null
    }
    if (stepOutput.type === WorkflowActionType.LOOP_ON_ITEMS) {
        const loopOutput = new LoopStepOutput(stepOutput)
        const iterations = loopOutput.output?.iterations ?? []
        const newIterations: Record<string, StepOutput>[] = []
        for (const iteration of iterations) {
            const newSteps: Record<string, StepOutput> = {}
            for (const [step, output] of Object.entries(iteration)) {
                const newOutput = await insertSuccessStepsOrPausedRecursively({ stepOutput: output, isWaitpointResume })
                if (!isNil(newOutput)) {
                    newSteps[step] = newOutput
                }
            }
            newIterations.push(newSteps)
        }
        return loopOutput.setIterations(newIterations)
    }
    return stepOutput
}

async function resolveExecuteWorkflowOperation(operation: ExecuteWorkflowOperation): Promise<ResolvedExecuteWorkflowOperation> {
    if (operation.executionType === ExecutionType.BEGIN) {
        return {
            ...operation,
            triggerPayload: await resolveJobPayload({ payload: operation.triggerPayload, apiUrl: operation.internalApiUrl, engineToken: operation.engineToken }),
        }
    }
    const executionState = await fetchExecutionStateFromLogs(operation.logsFileId, operation)
    if (Object.keys(executionState.steps).length === 0) {
        throw new EngineGenericError('EmptyResumeStateError', 'RESUME operation received with empty execution state')
    }
    return {
        ...operation,
        resumePayload: await resolveJobPayload({ payload: operation.resumePayload, apiUrl: operation.internalApiUrl, engineToken: operation.engineToken }) as ResumePayload,
        executionState,
    }
}

async function fetchExecutionStateFromLogs(logsFileId: string | undefined, operation: ExecuteWorkflowOperation): Promise<ExecutionState> {
    if (isNil(logsFileId)) {
        throw new EngineGenericError('ResumeLogsFileMissing', 'logsFileId is missing for RESUME operation')
    }
    const bytes = await engineFileApi.download({
        fileId: logsFileId,
        apiUrl: operation.internalApiUrl,
        engineToken: operation.engineToken,
    })
    const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes))
    if (isNil(parsed?.executionState)) {
        throw new EngineGenericError('ExecutionStateMissing', 'executionState is missing in logs file')
    }
    return parsed.executionState as ExecutionState
}

// Waitpoint resumes preserve FAILED so a `continueOnFailure` step isn't replayed,
// which would re-fire its waitpoint and let the global `constants.resumePayload`
// pollute the new output. Retry resumes (WorkflowRetryStrategy.FROM_FAILED_STEP) drop
// FAILED so the engine re-executes the failed step. The discriminator is the
// explicit `resumeReason` set when the run is enqueued.
function isStepRestorable({ status, isWaitpointResume }: IsStepRestorableParams): boolean {
    if (status === StepOutputStatus.SUCCEEDED || status === StepOutputStatus.PAUSED) {
        return true
    }
    return isWaitpointResume && status === StepOutputStatus.FAILED
}

type ResolveStateParams = {
    input: ResolvedExecuteWorkflowOperation
    constants: EngineConstants
    baseContext: WorkflowExecutorContext
}

type BuildFailedTriggerContextParams = {
    input: ResolvedExecuteWorkflowOperation
    baseContext: WorkflowExecutorContext
    error: Error
}

type ReportFailedTriggerRunParams = {
    operation: ExecuteWorkflowOperation
    error: Error
}

type ReportFailedRunParams = {
    input: ResolvedExecuteWorkflowOperation
    constants: EngineConstants
    error: Error
}

type IsStepRestorableParams = {
    status: StepOutputStatus
    isWaitpointResume: boolean
}

type InsertStepsParams = {
    stepOutput: StepOutput
    isWaitpointResume: boolean
}
