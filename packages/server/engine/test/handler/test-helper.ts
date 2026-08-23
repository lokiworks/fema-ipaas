import { ActionErrorHandlingOptions, ComponentAction, ParallelAction, BeginExecuteWorkflowOperation, BranchCondition, BranchExecutionType, CodeAction, ExecutionType, WorkflowAction, WorkflowActionType, WorkflowVersionState, LoopOnItemsAction, ConnectorAction, PropertyExecutionType, RouterExecutionType, RunEnvironment, StreamStepProgress } from '@fema-ipaas/shared'
import { EngineConstants, ResolvedBeginExecuteWorkflowOperation } from '../../src/lib/handler/context/engine-constants'

export const generateMockEngineConstants = (params?: Partial<EngineConstants>): EngineConstants => {
    return new EngineConstants(
        {
            tenantId: params?.tenantId ?? 'tenantId',
            timeoutInSeconds: params?.timeoutInSeconds ?? 10,
            workflowId: params?.workflowId ?? 'workflowId',
            workflowVersionId: params?.workflowVersionId ?? 'workflowVersionId',
            workflowVersionState: params?.workflowVersionState ?? WorkflowVersionState.DRAFT,
            executionId: params?.executionId ?? 'executionId',
            publicApiUrl: params?.publicApiUrl ?? 'http://127.0.0.1:4200/api/',
            internalApiUrl: params?.internalApiUrl ?? 'http://127.0.0.1:3000/',
            retryConstants: params?.retryConstants ?? {
                maxAttempts: 2,
                retryExponential: 1,
                retryInterval: 1,
            },
            engineToken: params?.engineToken ?? 'engineToken',
            workspaceId: params?.workspaceId ?? 'workspaceId',
            triggerConnectorName: params?.triggerConnectorName ?? 'mcp-trigger-connector-name',
            streamStepProgress: params?.streamStepProgress ?? StreamStepProgress.NONE,
            workerHandlerId: params?.workerHandlerId ?? null,
            httpRequestId: params?.httpRequestId ?? null,
            resumePayload: params?.resumePayload,
            runEnvironment: params?.runEnvironment ?? RunEnvironment.TESTING,
            stepNameToTest: params?.stepNameToTest ?? undefined,
            stepNames: params?.stepNames ?? [],
            logsFileId: params?.logsFileId,
        })
}

export function buildSimpleLoopAction({
    name,
    loopItems,
    firstLoopAction,
    skip,
}: {
    name: string
    loopItems: string
    firstLoopAction?: WorkflowAction
    skip?: boolean
}): LoopOnItemsAction {
    return {
        name,
        displayName: 'Loop',
        type: WorkflowActionType.LOOP_ON_ITEMS,
        skip: skip ?? false,
        settings: {
            items: loopItems,
        },
        firstLoopAction,
        valid: true,
    }
}

export function buildRouterWithOneCondition({ children, conditions, executionType, skip }: { children: WorkflowAction[], conditions: (BranchCondition | null)[], executionType: RouterExecutionType, skip?: boolean }): WorkflowAction {
    return {
        name: 'router',
        displayName: 'Your Router Name',
        type: WorkflowActionType.ROUTER,
        skip: skip ?? false,
        settings: {
            branches: conditions.map((condition) => {
                if (condition === null) {
                    return {
                        branchType: BranchExecutionType.FALLBACK,
                        branchName: 'Fallback Branch',
                    }
                }
                return {
                    conditions: [[condition]],
                    branchType: BranchExecutionType.CONDITION,
                    branchName: 'Test Branch',
                }
            }),
            executionType,
        },
        children,
        valid: true,
    }
}

export function buildCodeAction({ name, input, skip, nextAction, errorHandlingOptions }: { name: 'echo_step' | 'runtime' | 'echo_step_1' | 'system_error' | 'process_exit' | 'unhandled_rejection' | 'hello_world_npm' | 'stdout_on_failure' | 'setTimeout_error', input: Record<string, unknown>, skip?: boolean, errorHandlingOptions?: ActionErrorHandlingOptions, nextAction?: WorkflowAction }): CodeAction {
    return {
        name,
        displayName: 'Your Action Name',
        type: WorkflowActionType.CODE,
        skip: skip ?? false,
        settings: {
            input,
            sourceCode: {
                packageJson: '',
                code: '',
            },
            errorHandlingOptions,
        },
        nextAction,
        valid: true,
    }
}

export function buildConnectorAction({ name, input, skip, connectorName, actionName, nextAction, errorHandlingOptions }: { errorHandlingOptions?: ActionErrorHandlingOptions, name: string, input: Record<string, unknown>, skip?: boolean, connectorName: string, actionName: string, nextAction?: WorkflowAction }): ConnectorAction {
    return {
        name,
        displayName: 'Your Action Name',
        type: WorkflowActionType.CONNECTOR,
        skip: skip ?? false,
        settings: {
            input,
            connectorName,
            connectorVersion: '1.0.0', // Not required since it's running in development mode
            actionName,
            propertySettings: Object.fromEntries(Object.entries(input).map(([key]) => [key, {
                type: PropertyExecutionType.MANUAL,
                schema: undefined,
            }])),
            errorHandlingOptions,
        },
        nextAction,
        valid: true,
    }
}

export function buildComponentAction({ name, input, skip, componentType, nextAction, errorHandlingOptions }: { errorHandlingOptions?: ActionErrorHandlingOptions, name: string, input: Record<string, unknown>, skip?: boolean, componentType: string, nextAction?: WorkflowAction }): ComponentAction {
    return {
        name,
        displayName: 'Your Component Name',
        type: WorkflowActionType.COMPONENT,
        skip: skip ?? false,
        settings: {
            input,
            componentType,
            propertySettings: Object.fromEntries(Object.entries(input).map(([key]) => [key, {
                type: PropertyExecutionType.MANUAL,
                schema: undefined,
            }])),
            errorHandlingOptions,
        },
        nextAction,
        valid: true,
    }
}

export function buildParallelAction({ name, branches, children, nextAction }: { name: string, branches: string[], children: (WorkflowAction | null)[], nextAction?: WorkflowAction }): ParallelAction {
    return {
        name,
        displayName: 'Parallel',
        type: WorkflowActionType.PARALLEL,
        skip: false,
        valid: true,
        settings: {
            branches: branches.map((branchName) => ({ branchName })),
        },
        children,
        nextAction,
    }
}

export function buildMockBeginExecuteWorkflowOperation(
    params: Partial<ResolvedBeginExecuteWorkflowOperation> & Pick<BeginExecuteWorkflowOperation, 'workflowVersion'>,
): ResolvedBeginExecuteWorkflowOperation {
    return {
        workspaceId: 'workspaceId',
        engineToken: 'engineToken',
        internalApiUrl: 'http://127.0.0.1:3000/',
        publicApiUrl: 'http://127.0.0.1:4200/api/',
        timeoutInSeconds: 10,
        tenantId: 'tenantId',
        executionId: 'executionId',
        executionType: ExecutionType.BEGIN,
        runEnvironment: RunEnvironment.TESTING,
        workerHandlerId: null,
        httpRequestId: null,
        streamStepProgress: StreamStepProgress.NONE,
        stepNameToTest: null,
        triggerPayload: {},
        executeTrigger: false,
        ...params,
    }
}
