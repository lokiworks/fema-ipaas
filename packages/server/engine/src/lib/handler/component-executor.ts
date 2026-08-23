import { ComponentExecutionContext } from '@fema-ipaas/component-sdk'
import { componentRegistry } from '@fema-ipaas/components'
import { InputPropertyMap, StaticPropsValue } from '@fema-ipaas/connector-sdk'
import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { ComponentAction, ExecutionStatus, ExecutionType, GenericStepOutput, StepOutputStatus, WorkflowActionType } from '@fema-ipaas/shared'
import { createContextStore } from '../connector-context/store'
import { createWorkflowsContext } from '../connector-context/workflows'
import { buildRunContext } from '../core/run-context'
import { continueIfFailureHandler, runWithExponentialBackoff } from '../helper/error-handling'
import { executionProgressReporter } from '../helper/execution-progress-reporter'
import { HookResponse, utils } from '../utils'
import { ActionHandler, BaseExecutor, failStep } from './base-executor'
import { EngineConstants } from './context/engine-constants'

export const componentExecutor: BaseExecutor<ComponentAction> = {
    async handle({ action, executionState, constants }) {
        if (executionState.isCompleted({ stepName: action.name })) {
            return executionState
        }
        const resultExecution = await runWithExponentialBackoff(executionState, action, constants, executeAction)
        return continueIfFailureHandler(resultExecution, action, constants)
    },
}

const executeAction: ActionHandler<ComponentAction> = async ({ action, executionState, constants }) => {
    const stepStartTime = performance.now()
    const stepOutput = GenericStepOutput.create({
        input: {},
        type: WorkflowActionType.COMPONENT,
        status: StepOutputStatus.RUNNING,
    })

    const { data: executionStateResult, error: executionStateError } = await utils.tryCatchAndThrowOnEngineError((async () => {
        const { componentType } = action.settings
        const component = componentRegistry.get(componentType)
        if (isNil(component)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'step',
                    entityId: componentType,
                    message: `Flow component not found, componentType=${componentType}`,
                    extra: { componentType },
                },
            })
        }

        const { resolvedInput, censoredInput } = await constants.getPropsResolver({ contextVersion: undefined }).resolve<StaticPropsValue<InputPropertyMap>>({
            unresolvedInput: action.settings.input,
            executionState,
        })
        stepOutput.input = censoredInput

        const isPaused = executionState.isPaused({ stepName: action.name })
        if (!isPaused) {
            await executionProgressReporter.sendUpdate({
                engineConstants: constants,
                workflowExecutorContext: await executionState.upsertStep(action.name, stepOutput),
                stepNameToUpdate: action.name,
            })
        }

        const hooks: { hookResponse: HookResponse } = { hookResponse: { type: 'none', tags: [] } }
        const pending: Promise<unknown>[] = []
        const context: ComponentExecutionContext<StaticPropsValue<InputPropertyMap>> = {
            input: resolvedInput,
            executionType: isPaused ? ExecutionType.RESUME : ExecutionType.BEGIN,
            resumePayload: constants.resumePayload,
            run: buildRunContext({ runtime: toSuspendableRuntime(constants), stepName: action.name, hooks, pending }),
            server: {
                token: constants.engineToken,
                apiUrl: constants.internalApiUrl,
                publicUrl: constants.publicApiUrl,
            },
            store: createContextStore({
                apiUrl: constants.internalApiUrl,
                prefix: '',
                workflowId: constants.workflowId,
                engineToken: constants.engineToken,
            }),
            workflows: createWorkflowsContext({
                engineToken: constants.engineToken,
                internalApiUrl: constants.internalApiUrl,
                workflowId: constants.workflowId,
                workflowVersionId: constants.workflowVersionId,
            }),
            workspaceId: constants.workspaceId,
            tenantId: constants.tenantId,
            step: { name: action.name, displayName: action.displayName },
        }

        const output = await component.run(context)
        await Promise.allSettled(pending)

        const { hookResponse } = hooks
        const newExecutionContext = executionState.addTags(hookResponse.tags)
        const stepEndTime = performance.now()

        if (hookResponse.type === 'paused') {
            const paused = stepOutput.setOutput(output).setStatus(StepOutputStatus.PAUSED).setDuration(stepEndTime - stepStartTime)
            return (await newExecutionContext.upsertStep(action.name, paused))
                .incrementStepsExecuted()
                .setVerdict({ status: ExecutionStatus.PAUSED })
        }
        if (hookResponse.type === 'stopped') {
            const succeeded = stepOutput.setOutput(output).setStatus(StepOutputStatus.SUCCEEDED).setDuration(stepEndTime - stepStartTime)
            return (await newExecutionContext.upsertStep(action.name, succeeded)).incrementStepsExecuted().setVerdict({
                status: ExecutionStatus.SUCCEEDED,
                stopResponse: hookResponse.response.response,
            })
        }
        const succeeded = stepOutput.setOutput(output).setStatus(StepOutputStatus.SUCCEEDED).setDuration(stepEndTime - stepStartTime)
        return (await newExecutionContext.upsertStep(action.name, succeeded)).incrementStepsExecuted().setVerdict({ status: ExecutionStatus.RUNNING })
    }))

    if (executionStateError) {
        return failStep({
            action,
            executionState,
            stepOutput,
            error: executionStateError,
            durationMs: performance.now() - stepStartTime,
        })
    }

    return executionStateResult
}

function toSuspendableRuntime(constants: EngineConstants) {
    return {
        internalApiUrl: constants.internalApiUrl,
        publicApiUrl: constants.publicApiUrl,
        engineToken: constants.engineToken,
        workspaceId: constants.workspaceId,
        executionId: constants.executionId,
        actionRunMode: constants.actionRunMode,
        workerHandlerId: constants.workerHandlerId ?? undefined,
        httpRequestId: constants.httpRequestId ?? undefined,
    }
}
