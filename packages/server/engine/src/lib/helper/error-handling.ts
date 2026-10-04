import { isNil } from '@fema-ipaas/core-utils'
import { CodeAction, ComponentAction, ConnectorAction, errorHandlingUtils, ErrorOutcome, ExecutionStatus, PendingReliabilityEvent, RATE_LIMIT_QUEUE, ReliabilityEventKind, reliabilityUtils, ResolvedErrorStrategy } from '@fema-ipaas/shared'
import { EngineConstants } from '../handler/context/engine-constants'
import {  WorkflowExecutorContext } from '../handler/context/workflow-execution-context'

export async function runWithExponentialBackoff<T extends RetryableAction>(
    executionState: WorkflowExecutorContext,
    action: T,
    constants: EngineConstants,
    requestFunction: RequestFunction<T>,
): Promise<WorkflowExecutorContext> {
    const outcome = isNil(action.settings.errorHandlingOptions?.strategy)
        ? await runWithLegacyRetry({ executionState, action, constants, requestFunction, attemptCount: 1, carried: [] })
        : await runWithErrorStrategy({ executionState, action, constants, requestFunction, attempt: 1, carried: [] })
    return outcome.state.withReliabilityEvents({
        events: outcome.events,
        stepName: action.name,
        executionId: constants.executionId,
        workflowId: constants.workflowId,
    })
}

export async function continueIfFailureHandler(
    executionState: WorkflowExecutorContext,
    action: RetryableAction,
    constants: EngineConstants,
): Promise<WorkflowExecutorContext> {
    if (executionState.verdict.status !== ExecutionStatus.FAILED || !isNil(constants.stepNameToTest)) {
        return executionState
    }
    if (!isNil(action.settings.errorHandlingOptions?.strategy)) {
        const resolved = resolveFailedStepStrategy({ executionState, action })
        if (isNil(resolved) || resolved.outcome === ErrorOutcome.STOP) {
            return executionState
        }
        return executionState.setVerdict({ status: ExecutionStatus.RUNNING })
    }
    const continueOnFailure = action.settings.errorHandlingOptions?.continueOnFailure?.value
    if (continueOnFailure) {
        return executionState
            .setVerdict({ status: ExecutionStatus.RUNNING })
    }

    return executionState
}

export function resolveFailedStepStrategy({ executionState, action }: { executionState: WorkflowExecutorContext, action: RetryableAction }): ResolvedErrorStrategy | null {
    const { errorCode } = errorHandlingUtils.classifyErrorMessage({ message: failureMessageOf({ state: executionState, action }) })
    return errorHandlingUtils.resolveStrategy({ options: action.settings.errorHandlingOptions, errorCode })
}

async function runWithLegacyRetry<T extends RetryableAction>({ executionState, action, constants, requestFunction, attemptCount, carried }: RunWithLegacyRetryParams<T>): Promise<AttemptOutcome> {
    const attempt = await requestWithRateLimitQueue({ executionState, action, constants, requestFunction, waited: [] })
    const events = [...carried, ...attempt.events]
    const retryEnabled = action.settings.errorHandlingOptions?.retryOnFailure?.value
    if (
        !executionFailedWithRetryableError(attempt.state) ||
        attemptCount >= constants.retryConstants.maxAttempts ||
        !retryEnabled ||
        !isNil(constants.stepNameToTest)
    ) {
        return { state: attempt.state, events }
    }
    const backoffTime = Math.pow(constants.retryConstants.retryExponential, attemptCount) * constants.retryConstants.retryInterval
    const retry = retryEventOf({ state: attempt.state, action, waitMs: backoffTime })
    await new Promise(resolve => setTimeout(resolve, backoffTime))
    return runWithLegacyRetry({ executionState, action, constants, requestFunction, attemptCount: attemptCount + 1, carried: [...events, retry] })
}

async function runWithErrorStrategy<T extends RetryableAction>({ executionState, action, constants, requestFunction, attempt, carried }: RunWithErrorStrategyParams<T>): Promise<AttemptOutcome> {
    const result = await requestWithRateLimitQueue({ executionState, action, constants, requestFunction, waited: [] })
    const events = [...carried, ...result.events]
    if (!executionFailedWithRetryableError(result.state) || !isNil(constants.stepNameToTest)) {
        return { state: result.state, events }
    }
    const resolved = resolveFailedStepStrategy({ executionState: result.state, action })
    if (isNil(resolved?.retry) || attempt > resolved.retry.attempts) {
        return { state: result.state, events }
    }
    const retry = retryEventOf({ state: result.state, action, waitMs: resolved.retry.intervalSeconds * 1000 })
    await errorStrategyTiming.sleep(resolved.retry.intervalSeconds * 1000)
    return runWithErrorStrategy({ executionState, action, constants, requestFunction, attempt: attempt + 1, carried: [...events, retry] })
}

async function requestWithRateLimitQueue<T extends RetryableAction>({ executionState, action, constants, requestFunction, waited }: RequestWithRateLimitQueueParams<T>): Promise<AttemptOutcome> {
    const state = await requestFunction({ action, executionState, constants })
    const waitMs = rateLimitWaitMsOf({ state, action })
    if (isNil(waitMs) || waited.length >= RATE_LIMIT_QUEUE.maxAttempts || !isNil(constants.stepNameToTest) || !executionFailedWithRetryableError(state)) {
        return { state, events: waited }
    }
    const event: PendingReliabilityEvent = {
        kind: ReliabilityEventKind.RATE_LIMIT_QUEUED,
        errorCode: classifiedCodeOf({ state, action }),
        connectorName: connectorNameOf({ action }),
        waitSeconds: Math.ceil(waitMs / MS_PER_SECOND),
    }
    await errorStrategyTiming.sleep(waitMs)
    return requestWithRateLimitQueue({ executionState, action, constants, requestFunction, waited: [...waited, event] })
}

function failureMessageOf({ state, action }: { state: WorkflowExecutorContext, action: RetryableAction }): string | undefined {
    const failedMessage = state.verdict.status === ExecutionStatus.FAILED ? state.verdict.failedStep?.message : undefined
    const message = state.getStepOutput(action.name)?.errorMessage ?? failedMessage
    return typeof message === 'string' ? message : undefined
}

function rateLimitWaitMsOf({ state, action }: { state: WorkflowExecutorContext, action: RetryableAction }): number | null {
    return reliabilityUtils.rateLimitWaitMs({ message: failureMessageOf({ state, action }), now: Date.now() })
}

function classifiedCodeOf({ state, action }: { state: WorkflowExecutorContext, action: RetryableAction }): string {
    return errorHandlingUtils.classifyErrorMessage({ message: failureMessageOf({ state, action }) }).errorCode
}

function connectorNameOf({ action }: { action: RetryableAction }): string | undefined {
    return 'connectorName' in action.settings && typeof action.settings.connectorName === 'string' ? action.settings.connectorName : undefined
}

function retryEventOf({ state, action, waitMs }: { state: WorkflowExecutorContext, action: RetryableAction, waitMs: number }): PendingReliabilityEvent {
    return {
        kind: ReliabilityEventKind.AUTO_RETRY,
        errorCode: classifiedCodeOf({ state, action }),
        connectorName: connectorNameOf({ action }),
        waitSeconds: Math.ceil(waitMs / MS_PER_SECOND),
    }
}

const executionFailedWithRetryableError = (workflowExecutorContext: WorkflowExecutorContext): boolean => {
    return workflowExecutorContext.verdict.status === ExecutionStatus.FAILED
}

type Request<T extends RetryableAction> = {
    action: T
    executionState: WorkflowExecutorContext
    constants: EngineConstants
}

type RequestFunction<T extends RetryableAction> = (request: Request<T>) => Promise<WorkflowExecutorContext>

type RunWithErrorStrategyParams<T extends RetryableAction> = {
    executionState: WorkflowExecutorContext
    action: T
    constants: EngineConstants
    requestFunction: RequestFunction<T>
    attempt: number
    carried: PendingReliabilityEvent[]
}

type RunWithLegacyRetryParams<T extends RetryableAction> = {
    executionState: WorkflowExecutorContext
    action: T
    constants: EngineConstants
    requestFunction: RequestFunction<T>
    attemptCount: number
    carried: PendingReliabilityEvent[]
}

type RequestWithRateLimitQueueParams<T extends RetryableAction> = {
    executionState: WorkflowExecutorContext
    action: T
    constants: EngineConstants
    requestFunction: RequestFunction<T>
    waited: PendingReliabilityEvent[]
}

type AttemptOutcome = {
    state: WorkflowExecutorContext
    events: PendingReliabilityEvent[]
}

const MS_PER_SECOND = 1000

export const errorStrategyTiming = {
    sleep: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),
}

export type RetryableAction = CodeAction | ComponentAction | ConnectorAction
