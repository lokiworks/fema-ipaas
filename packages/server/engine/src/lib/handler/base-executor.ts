import { isNil, isString } from '@fema/core-utils'
import { BaseStepOutput, ExecutionStatus, StepOutputStatus, WorkflowAction } from '@fema/shared'
import { utils } from '../utils'
import { EngineConstants } from './context/engine-constants'
import { WorkflowExecutorContext } from './context/workflow-execution-context'

export async function failStep({ action, executionState, stepOutput, error, durationMs }: FailStepParams): Promise<WorkflowExecutorContext> {
    const message = isString(error) ? error : utils.formatError(error)
    const failed = stepOutput.setStatus(StepOutputStatus.FAILED).setErrorMessage(message)
    const withDuration = isNil(durationMs) ? failed : failed.setDuration(durationMs)
    return (await executionState.upsertStep(action.name, withDuration)).setVerdict({
        status: ExecutionStatus.FAILED,
        failedStep: {
            name: action.name,
            displayName: action.displayName,
            message,
        },
    })
}

export type ActionHandler<T extends WorkflowAction> = (request: { action: T, executionState: WorkflowExecutorContext, constants: EngineConstants }) => Promise<WorkflowExecutorContext>

export type BaseExecutor<T extends WorkflowAction> = {
    handle(request: {
        action: T
        executionState: WorkflowExecutorContext
        constants: EngineConstants
    }): Promise<WorkflowExecutorContext>
}

type FailStepParams = {
    action: Pick<WorkflowAction, 'name' | 'displayName'>
    executionState: WorkflowExecutorContext
    stepOutput: BaseStepOutput
    error: Error | string
    durationMs?: number
}
