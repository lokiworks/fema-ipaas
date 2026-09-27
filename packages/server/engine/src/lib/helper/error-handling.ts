import { isNil } from '@fema-ipaas/core-utils'
import { CodeAction, ComponentAction, ConnectorAction, errorHandlingUtils, ErrorOutcome, ExecutionStatus, ResolvedErrorStrategy } from '@fema-ipaas/shared'
import { EngineConstants } from '../handler/context/engine-constants'
import {  WorkflowExecutorContext } from '../handler/context/workflow-execution-context'

export async function runWithExponentialBackoff<T extends RetryableAction>(
    executionState: WorkflowExecutorContext,
    action: T,
    constants: EngineConstants,
    requestFunction: RequestFunction<T>,
    attemptCount = 1,
): Promise<WorkflowExecutorContext> {
    if (!isNil(action.settings.errorHandlingOptions?.strategy)) {
        return runWithErrorStrategy({ executionState, action, constants, requestFunction, attempt: 1 })
    }
    const resultExecutionState = await requestFunction({ action, executionState, constants })
    const retryEnabled = action.settings.errorHandlingOptions?.retryOnFailure?.value
    if (
        executionFailedWithRetryableError(resultExecutionState) &&
        attemptCount < constants.retryConstants.maxAttempts &&
        retryEnabled &&
        isNil(constants.stepNameToTest)
    ) {
        const backoffTime = Math.pow(constants.retryConstants.retryExponential, attemptCount) * constants.retryConstants.retryInterval
        await new Promise(resolve => setTimeout(resolve, backoffTime))
        return runWithExponentialBackoff(executionState, action, constants, requestFunction, attemptCount + 1)
    }

    return resultExecutionState
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
    const failedMessage = executionState.verdict.status === ExecutionStatus.FAILED ? executionState.verdict.failedStep?.message : undefined
    const message = executionState.getStepOutput(action.name)?.errorMessage ?? failedMessage
    const { errorCode } = errorHandlingUtils.classifyErrorMessage({ message: typeof message === 'string' ? message : undefined })
    return errorHandlingUtils.resolveStrategy({ options: action.settings.errorHandlingOptions, errorCode })
}

async function runWithErrorStrategy<T extends RetryableAction>({ executionState, action, constants, requestFunction, attempt }: RunWithErrorStrategyParams<T>): Promise<WorkflowExecutorContext> {
    const resultExecutionState = await requestFunction({ action, executionState, constants })
    if (!executionFailedWithRetryableError(resultExecutionState) || !isNil(constants.stepNameToTest)) {
        return resultExecutionState
    }
    const resolved = resolveFailedStepStrategy({ executionState: resultExecutionState, action })
    if (isNil(resolved?.retry) || attempt > resolved.retry.attempts) {
        return resultExecutionState
    }
    await errorStrategyTiming.sleep(resolved.retry.intervalSeconds * 1000)
    return runWithErrorStrategy({ executionState, action, constants, requestFunction, attempt: attempt + 1 })
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
}

export const errorStrategyTiming = {
    sleep: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),
}

export type RetryableAction = CodeAction | ComponentAction | ConnectorAction
