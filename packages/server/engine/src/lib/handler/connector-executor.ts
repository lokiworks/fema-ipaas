import { ConnectorPropertyMap, StaticPropsValue } from '@fema-ipaas/connector-sdk'
import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { ConnectorAction, EngineGenericError, ExecutionStatus, ExecutionType, GenericStepOutput, RespondResponse, StepOutputStatus, WorkflowActionType } from '@fema-ipaas/shared'
import { engineRunApi } from '../api/engine-run-api'
import { ConnectorRuntime } from '../core/connector/connector-protocol'
import { connectorRunner } from '../core/connector/connector-runner'
import { continueIfFailureHandler, runWithExponentialBackoff } from '../helper/error-handling'
import { executionProgressReporter } from '../helper/execution-progress-reporter'
import { HookResponse, utils } from '../utils'
import { ActionHandler, BaseExecutor, failStep } from './base-executor'
import { EngineConstants } from './context/engine-constants'

export const connectorExecutor: BaseExecutor<ConnectorAction> = {
    async handle({
        action,
        executionState,
        constants,
    }) {
        if (executionState.isCompleted({ stepName: action.name })) {
            return executionState
        }
        const resultExecution = await runWithExponentialBackoff(executionState, action, constants, executeAction)
        return continueIfFailureHandler(resultExecution, action, constants)
    },
}

const executeAction: ActionHandler<ConnectorAction> = async ({ action, executionState, constants }) => {
    const stepStartTime = performance.now()
    const stepOutput = GenericStepOutput.create({
        input: {},
        type: WorkflowActionType.CONNECTOR,
        status: StepOutputStatus.RUNNING,
    })

    const { data: executionStateResult, error: executionStateError } = await utils.tryCatchAndThrowOnEngineError((async () => {
        const { actionName, connectorName, connectorVersion, propertySettings } = action.settings
        if (isNil(actionName)) {
            throw new EngineGenericError('ActionNameNotSetError', 'Action name is not set')
        }

        const connector = { connectorName, connectorVersion, devConnectors: constants.devConnectors }
        const description = await connectorRunner.describe(connector)
        if (isNil(description.metadata.actions[actionName])) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'step',
                    entityId: actionName,
                    message: `Action not found for connector ${connectorName}@${connectorVersion}`,
                    extra: { connectorName, connectorVersion },
                },
            })
        }
        const contextVersion = description.metadata.contextInfo?.version

        const { resolvedInput, censoredInput } = await constants.getPropsResolver({ contextVersion, connectorName }).resolve<StaticPropsValue<ConnectorPropertyMap>>({
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

        const testSingleStepMode = !isNil(constants.stepNameToTest)
        const useTestMethod = testSingleStepMode && description.hasPath(['actions', actionName, 'test'])
        const { result: output, hooks } = await connectorRunner.call({
            connector,
            path: ['actions', actionName, useTestMethod ? 'test' : 'run'],
            context: {
                kind: 'action',
                runtime: buildRuntime({ constants, connectorName, contextVersion }),
                actionName,
                stepName: action.name,
                resolvedInput,
                propertySettings,
                executionType: isPaused ? ExecutionType.RESUME : ExecutionType.BEGIN,
                resumePayload: constants.resumePayload,
            },
        })

        const hookResponse: HookResponse = hooks?.hookResponse ?? { type: 'none', tags: [] }
        const newExecutionContext = executionState.addTags(hookResponse.tags)

        const webhookResponse = getResponse(hookResponse)
        const isSameConnector = constants.triggerConnectorName === connectorName
        if (!isNil(webhookResponse) && !isNil(constants.workerHandlerId) && !isNil(constants.httpRequestId) && isSameConnector) {
            await engineRunApi.sendWorkflowResponse({
                apiUrl: constants.internalApiUrl,
                engineToken: constants.engineToken,
                request: {
                    workerHandlerId: constants.workerHandlerId,
                    httpRequestId: constants.httpRequestId,
                    runResponse: {
                        status: webhookResponse.status ?? 200,
                        body: webhookResponse.body ?? {},
                        headers: webhookResponse.headers ?? {},
                    },
                },
            })
        }

        const stepEndTime = performance.now()
        if (hookResponse.type === 'stopped') {
            if (isNil(hookResponse.response)) {
                throw new EngineGenericError('StopResponseNotSetError', 'Stop response is not set')
            }
            const succeeded = stepOutput.setOutput(output).setStatus(StepOutputStatus.SUCCEEDED).setDuration(stepEndTime - stepStartTime)
            return (await newExecutionContext.upsertStep(action.name, succeeded)).incrementStepsExecuted().setVerdict({
                status: ExecutionStatus.SUCCEEDED,
                stopResponse: hookResponse.response.response,
            })
        }
        if (hookResponse.type === 'paused') {
            const paused = stepOutput.setOutput(output).setStatus(StepOutputStatus.PAUSED).setDuration(stepEndTime - stepStartTime)
            return (await newExecutionContext.upsertStep(action.name, paused))
                .incrementStepsExecuted()
                .setVerdict({ status: ExecutionStatus.PAUSED })
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

function getResponse(hookResponse: HookResponse): RespondResponse | undefined {
    switch (hookResponse.type) {
        case 'stopped':
        case 'respond':
            return hookResponse.response.response
        case 'paused':
            return hookResponse.responseToSend
        case 'none':
            return undefined
    }
}

export function buildRuntime({ constants, connectorName, contextVersion }: BuildRuntimeParams): ConnectorRuntime {
    return {
        internalApiUrl: constants.internalApiUrl,
        publicApiUrl: constants.publicApiUrl,
        engineToken: constants.engineToken,
        projectId: constants.projectId,
        workflowId: constants.workflowId,
        workflowVersionId: constants.workflowVersionId,
        executionId: constants.executionId,
        connectorName,
        contextVersion,
        actionRunMode: constants.actionRunMode,
        workerHandlerId: constants.workerHandlerId ?? undefined,
        httpRequestId: constants.httpRequestId ?? undefined,
    }
}

type BuildRuntimeParams = {
    constants: EngineConstants
    connectorName: string
    contextVersion?: ConnectorRuntime['contextVersion']
}
