import { performance } from 'node:perf_hooks'
import { isNil } from '@fema-ipaas/core-utils'
import { EngineGenericError, ExecutionStatus, ExecutionType, GenericStepOutput, StepOutputStatus, WorkflowAction, WorkflowActionType, WorkflowTrigger } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { triggerRunner } from '../core/connector/trigger-runner'
import { executionProgressReporter } from '../helper/execution-progress-reporter'
import { loggingUtils } from '../helper/logging-utils'
import { BaseExecutor } from './base-executor'
import { codeExecutor } from './code-executor'
import { connectorExecutor } from './connector-executor'
import { EngineConstants, ResolvedExecuteWorkflowOperation } from './context/engine-constants'
import { WorkflowExecutorContext } from './context/workflow-execution-context'
import { loopExecutor } from './loop-executor'
import { routerExecuter } from './router-executor'

let executors: Record<WorkflowActionType, BaseExecutor<WorkflowAction>> | null = null

// ponytail: lazy because router-executor imports this module back; a module-level
// const would hit the circular import in TDZ depending on bundle order.
function getExecutors(): Record<WorkflowActionType, BaseExecutor<WorkflowAction>> {
    executors ??= {
        [WorkflowActionType.CODE]: codeExecutor,
        [WorkflowActionType.LOOP_ON_ITEMS]: loopExecutor,
        [WorkflowActionType.CONNECTOR]: connectorExecutor,
        [WorkflowActionType.ROUTER]: routerExecuter,
    }
    return executors
}

export const workflowExecutor = {
    getExecutorForAction(type: WorkflowActionType): BaseExecutor<WorkflowAction> {
        const executor = getExecutors()[type]
        if (isNil(executor)) {
            throw new EngineGenericError('ExecutorNotFoundError', `Executor not found for action type: ${type}`)
        }
        return executor
    },
    async executeFromTrigger({ executionState, constants, input }: {
        executionState: WorkflowExecutorContext
        constants: EngineConstants
        input: ResolvedExecuteWorkflowOperation
    }): Promise<WorkflowExecutorContext> {
        const trigger = input.workflowVersion.trigger
        if (input.executionType === ExecutionType.BEGIN) {
            await executionProgressReporter.sendUpdate({
                engineConstants: constants,
                workflowExecutorContext: executionState,
            })
            void executionProgressReporter.backup().catch((err) => {
                console.error('[Progress] Initial payload upload failed', err)
            })
            await triggerRunner.executeOnStart({ trigger, constants, payload: input.triggerPayload })
            await executionProgressReporter.sendUpdate({
                engineConstants: constants,
                workflowExecutorContext: executionState,
                stepNameToUpdate: trigger.name,
                startTime: dayjs().toISOString(),
            })
            executionState = await applyLogSizeLimitIfExceeded(executionState, trigger)
            if (executionState.verdict.status !== ExecutionStatus.RUNNING) {
                return executionState
            }
        }
        return workflowExecutor.execute({
            action: trigger.nextAction,
            executionState,
            constants,
        })
    },
    async execute({ action, constants, executionState }: {
        action: WorkflowAction | null | undefined
        executionState: WorkflowExecutorContext
        constants: EngineConstants
    }): Promise<WorkflowExecutorContext> {
        const workflowStartTime = performance.now()
        let workflowExecutionContext = executionState
        let previousAction: WorkflowAction | null | undefined = action
        let currentAction: WorkflowAction | null | undefined = action
        const testSingleStepMode = !isNil(constants.stepNameToTest)

        while (!isNil(currentAction)) {
            if (currentAction.skip && !testSingleStepMode) {
                currentAction = currentAction.nextAction
                continue
            }
            const handler = this.getExecutorForAction(currentAction.type)

            await executionProgressReporter.sendUpdate({
                engineConstants: constants,
                workflowExecutorContext: workflowExecutionContext,
                stepNameToUpdate: previousAction!.name,
            }).catch(error => {
                console.error('Error sending update:', error)
            })

            workflowExecutionContext = await handler.handle({
                action: currentAction,
                executionState: workflowExecutionContext,
                constants,
            })
            if (!testSingleStepMode) {
                workflowExecutionContext = await runContinueOnFailureBranchIfNeeded({
                    action: currentAction,
                    executionState: workflowExecutionContext,
                    constants,
                })
            }
            workflowExecutionContext = await applyLogSizeLimitIfExceeded(workflowExecutionContext, currentAction)

            const shouldBreakExecution = workflowExecutionContext.verdict.status !== ExecutionStatus.RUNNING || testSingleStepMode
            previousAction = currentAction
            currentAction = currentAction.nextAction

            if (shouldBreakExecution) {
                break
            }

        }

        await executionProgressReporter.sendUpdate({
            engineConstants: constants,
            workflowExecutorContext: workflowExecutionContext,
            stepNameToUpdate: previousAction?.name,
        }).catch(error => {
            console.error('Error sending update:', error)
        })

        const workflowEndTime = performance.now()
        return workflowExecutionContext.setDuration(workflowEndTime - workflowStartTime)
    },
}

async function runContinueOnFailureBranchIfNeeded({ action, executionState, constants }: {
    action: WorkflowAction
    executionState: WorkflowExecutorContext
    constants: EngineConstants
}): Promise<WorkflowExecutorContext> {
    if (action.type !== WorkflowActionType.CODE && action.type !== WorkflowActionType.CONNECTOR) {
        return executionState
    }
    const cofEnabled = action.settings.errorHandlingOptions?.continueOnFailure?.value
    if (!cofEnabled) {
        return executionState
    }
    const branches = action.continueOnFailureBranches
    if (isNil(branches?.onSuccess) && isNil(branches?.onFailure)) {
        return executionState
    }
    if (executionState.verdict.status !== ExecutionStatus.RUNNING) {
        return executionState
    }
    const stepOutput = executionState.getStepOutput(action.name)
    const stepFailed = stepOutput?.status === StepOutputStatus.FAILED
    const branchHead = stepFailed ? branches?.onFailure : branches?.onSuccess
    if (isNil(branchHead)) {
        return executionState
    }
    return workflowExecutor.execute({
        action: branchHead,
        executionState,
        constants,
    })
}

const applyLogSizeLimitIfExceeded = async (
    workflowExecutionContext: WorkflowExecutorContext,
    action: WorkflowAction | WorkflowTrigger,
): Promise<WorkflowExecutorContext> => {
    if (loggingUtils.isWithinSizeLimit(workflowExecutionContext.logSizeBytes)) {
        return workflowExecutionContext
    }
    const failed = await workflowExecutionContext
        .upsertStep(action.name, GenericStepOutput.create({
            input: workflowExecutionContext.getStepOutput(action.name)?.input,
            type: action.type,
            status: StepOutputStatus.FAILED,
            output: undefined,
        })
            .setErrorMessage(`Workflow run data size exceeded the maximum allowed size of ${loggingUtils.maxLogSizeMb} MB`))
    return failed.setVerdict({
        status: ExecutionStatus.LOG_SIZE_EXCEEDED,
        failedStep: {
            name: action.name,
            displayName: action.displayName,
            message: 'Workflow run logs size exceeded',
        },
    })
}
