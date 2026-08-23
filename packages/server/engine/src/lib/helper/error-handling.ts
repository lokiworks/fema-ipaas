import { isNil } from '@fema/core-utils'
import { CodeAction, ConnectorAction, ExecutionStatus } from '@fema/shared'
import { EngineConstants } from '../handler/context/engine-constants'
import {  WorkflowExecutorContext } from '../handler/context/workflow-execution-context'

export async function runWithExponentialBackoff<T extends CodeAction | ConnectorAction>(
    executionState: WorkflowExecutorContext,
    action: T,
    constants: EngineConstants,
    requestFunction: RequestFunction<T>,
    attemptCount = 1,
): Promise<WorkflowExecutorContext> {
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
    action: CodeAction | ConnectorAction,
    constants: EngineConstants,
): Promise<WorkflowExecutorContext> {
    const continueOnFailure = action.settings.errorHandlingOptions?.continueOnFailure?.value

    if (
        executionState.verdict.status === ExecutionStatus.FAILED &&
        continueOnFailure &&
        isNil(constants.stepNameToTest)
    ) {
        return executionState
            .setVerdict({ status: ExecutionStatus.RUNNING })
    }

    return executionState
}


const executionFailedWithRetryableError = (workflowExecutorContext: WorkflowExecutorContext): boolean => {
    return workflowExecutorContext.verdict.status === ExecutionStatus.FAILED
}

type Request<T extends CodeAction | ConnectorAction> = {
    action: T
    executionState: WorkflowExecutorContext
    constants: EngineConstants
}

type RequestFunction<T extends CodeAction | ConnectorAction> = (request: Request<T>) => Promise<WorkflowExecutorContext>

