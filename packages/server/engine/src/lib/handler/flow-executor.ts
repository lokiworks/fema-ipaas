import { performance } from 'node:perf_hooks'
import { isNil } from '@fema/core-utils'
import { EngineGenericError, ExecutionStatus, ExecutionType, FlowAction, FlowActionType, FlowTrigger, GenericStepOutput, StepOutputStatus } from '@fema/shared'
import dayjs from 'dayjs'
import { triggerRunner } from '../core/connector/trigger-runner'
import { executionProgressReporter } from '../helper/execution-progress-reporter'
import { loggingUtils } from '../helper/logging-utils'
import { BaseExecutor } from './base-executor'
import { codeExecutor } from './code-executor'
import { connectorExecutor } from './connector-executor'
import { EngineConstants, ResolvedExecuteFlowOperation } from './context/engine-constants'
import { FlowExecutorContext } from './context/flow-execution-context'
import { loopExecutor } from './loop-executor'
import { routerExecuter } from './router-executor'

let executors: Record<FlowActionType, BaseExecutor<FlowAction>> | null = null

// ponytail: lazy because router-executor imports this module back; a module-level
// const would hit the circular import in TDZ depending on bundle order.
function getExecutors(): Record<FlowActionType, BaseExecutor<FlowAction>> {
    executors ??= {
        [FlowActionType.CODE]: codeExecutor,
        [FlowActionType.LOOP_ON_ITEMS]: loopExecutor,
        [FlowActionType.CONNECTOR]: connectorExecutor,
        [FlowActionType.ROUTER]: routerExecuter,
    }
    return executors
}

export const flowExecutor = {
    getExecutorForAction(type: FlowActionType): BaseExecutor<FlowAction> {
        const executor = getExecutors()[type]
        if (isNil(executor)) {
            throw new EngineGenericError('ExecutorNotFoundError', `Executor not found for action type: ${type}`)
        }
        return executor
    },
    async executeFromTrigger({ executionState, constants, input }: {
        executionState: FlowExecutorContext
        constants: EngineConstants
        input: ResolvedExecuteFlowOperation
    }): Promise<FlowExecutorContext> {
        const trigger = input.flowVersion.trigger
        if (input.executionType === ExecutionType.BEGIN) {
            await executionProgressReporter.sendUpdate({
                engineConstants: constants,
                flowExecutorContext: executionState,
            })
            void executionProgressReporter.backup().catch((err) => {
                console.error('[Progress] Initial payload upload failed', err)
            })
            await triggerRunner.executeOnStart({ trigger, constants, payload: input.triggerPayload })
            await executionProgressReporter.sendUpdate({
                engineConstants: constants,
                flowExecutorContext: executionState,
                stepNameToUpdate: trigger.name,
                startTime: dayjs().toISOString(),
            })
            executionState = await applyLogSizeLimitIfExceeded(executionState, trigger)
            if (executionState.verdict.status !== ExecutionStatus.RUNNING) {
                return executionState
            }
        }
        return flowExecutor.execute({
            action: trigger.nextAction,
            executionState,
            constants,
        })
    },
    async execute({ action, constants, executionState }: {
        action: FlowAction | null | undefined
        executionState: FlowExecutorContext
        constants: EngineConstants
    }): Promise<FlowExecutorContext> {
        const flowStartTime = performance.now()
        let flowExecutionContext = executionState
        let previousAction: FlowAction | null | undefined = action
        let currentAction: FlowAction | null | undefined = action
        const testSingleStepMode = !isNil(constants.stepNameToTest)

        while (!isNil(currentAction)) {
            if (currentAction.skip && !testSingleStepMode) {
                currentAction = currentAction.nextAction
                continue
            }
            const handler = this.getExecutorForAction(currentAction.type)

            await executionProgressReporter.sendUpdate({
                engineConstants: constants,
                flowExecutorContext: flowExecutionContext,
                stepNameToUpdate: previousAction!.name,
            }).catch(error => {
                console.error('Error sending update:', error)
            })

            flowExecutionContext = await handler.handle({
                action: currentAction,
                executionState: flowExecutionContext,
                constants,
            })
            if (!testSingleStepMode) {
                flowExecutionContext = await runContinueOnFailureBranchIfNeeded({
                    action: currentAction,
                    executionState: flowExecutionContext,
                    constants,
                })
            }
            flowExecutionContext = await applyLogSizeLimitIfExceeded(flowExecutionContext, currentAction)

            const shouldBreakExecution = flowExecutionContext.verdict.status !== ExecutionStatus.RUNNING || testSingleStepMode
            previousAction = currentAction
            currentAction = currentAction.nextAction

            if (shouldBreakExecution) {
                break
            }

        }

        await executionProgressReporter.sendUpdate({
            engineConstants: constants,
            flowExecutorContext: flowExecutionContext,
            stepNameToUpdate: previousAction?.name,
        }).catch(error => {
            console.error('Error sending update:', error)
        })

        const flowEndTime = performance.now()
        return flowExecutionContext.setDuration(flowEndTime - flowStartTime)
    },
}

async function runContinueOnFailureBranchIfNeeded({ action, executionState, constants }: {
    action: FlowAction
    executionState: FlowExecutorContext
    constants: EngineConstants
}): Promise<FlowExecutorContext> {
    if (action.type !== FlowActionType.CODE && action.type !== FlowActionType.CONNECTOR) {
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
    return flowExecutor.execute({
        action: branchHead,
        executionState,
        constants,
    })
}

const applyLogSizeLimitIfExceeded = async (
    flowExecutionContext: FlowExecutorContext,
    action: FlowAction | FlowTrigger,
): Promise<FlowExecutorContext> => {
    if (loggingUtils.isWithinSizeLimit(flowExecutionContext.logSizeBytes)) {
        return flowExecutionContext
    }
    const failed = await flowExecutionContext
        .upsertStep(action.name, GenericStepOutput.create({
            input: flowExecutionContext.getStepOutput(action.name)?.input,
            type: action.type,
            status: StepOutputStatus.FAILED,
            output: undefined,
        })
            .setErrorMessage(`Flow run data size exceeded the maximum allowed size of ${loggingUtils.maxLogSizeMb} MB`))
    return failed.setVerdict({
        status: ExecutionStatus.LOG_SIZE_EXCEEDED,
        failedStep: {
            name: action.name,
            displayName: action.displayName,
            message: 'Flow run logs size exceeded',
        },
    })
}
