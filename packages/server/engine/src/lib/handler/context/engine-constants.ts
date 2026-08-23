import { ContextVersion } from '@fema/connector-sdk'
import { ensureTrailingSlash, isNil, PlatformId, WorkspaceId } from '@fema/core-utils'
import { BaseEngineOperation, BeginExecuteFlowOperation, DEFAULT_MCP_DATA, EngineGenericError, ExecutePropsOptions, ExecuteTriggerOperation, ExecutionState, ExecutionType, flowStructureUtil, FlowTrigger, FlowVersionState, ResumeExecuteFlowOperation, ResumePayload, RunEnvironment, StreamStepProgress, TriggerHookType, Workspace } from '@fema/shared'
import { retryFetch } from '../../api/retry-fetch'
import { createPropsResolver, PropsResolver } from '../../variables/props-resolver'

type RetryConstants = {
    maxAttempts: number
    retryExponential: number
    retryInterval: number
}

type EngineConstantsParams = {
    flowId: string
    flowVersionId: string
    flowVersionState: FlowVersionState
    triggerConnectorName: string
    flowRunId: string
    publicApiUrl: string
    internalApiUrl: string
    retryConstants: RetryConstants
    engineToken: string
    workspaceId: WorkspaceId
    streamStepProgress: StreamStepProgress
    workerHandlerId: string | null
    httpRequestId: string | null
    resumePayload?: ResumePayload
    runEnvironment?: RunEnvironment
    stepNameToTest?: string
    logsFileId?: string
    timeoutInSeconds: number
    platformId: PlatformId
    stepNames: string[]
    actionRunMode?: boolean
}

const DEFAULT_RETRY_CONSTANTS: RetryConstants = {
    maxAttempts: 4,
    retryExponential: 2,
    retryInterval: 2000,
}

const DEFAULT_TRIGGER_EXECUTION = 'execute-trigger'
const DEFAULT_EXECUTE_PROPERTY = 'execute-property'

export class EngineConstants {
    public static readonly BASE_CODE_DIRECTORY = process.env.FEMA_BASE_CODE_DIRECTORY ?? './codes'
    public static readonly INPUT_FILE = './input.json'
    public static readonly OUTPUT_FILE = './output.json'
    public static readonly DEV_CONNECTORS = process.env.FEMA_DEV_CONNECTORS?.split(',') ?? []
    public static readonly TEST_MODE = process.env.FEMA_TEST_MODE === 'true'

    public readonly platformId: string
    public readonly timeoutInSeconds: number
    public readonly flowId: string
    public readonly flowVersionId: string
    public readonly flowVersionState: FlowVersionState
    public readonly triggerConnectorName: string
    public readonly flowRunId: string
    public readonly publicApiUrl: string
    public readonly internalApiUrl: string
    public readonly retryConstants: RetryConstants
    public readonly engineToken: string
    public readonly workspaceId: WorkspaceId
    public readonly streamStepProgress: StreamStepProgress
    public readonly workerHandlerId: string | null
    public readonly httpRequestId: string | null
    public readonly resumePayload?: ResumePayload
    public readonly runEnvironment?: RunEnvironment
    public readonly stepNameToTest?: string
    public readonly logsFileId?: string
    public readonly stepNames: string[] = []
    public readonly actionRunMode: boolean
    private workspace: Workspace | null = null

    public get isRunningApTests(): boolean {
        return EngineConstants.TEST_MODE
    }

    public get isTestFlow(): boolean {
        return this.streamStepProgress === StreamStepProgress.WEBSOCKET
    }

    public get baseCodeDirectory(): string {
        return EngineConstants.BASE_CODE_DIRECTORY
    }

    public get devConnectors(): string[] {
        return EngineConstants.DEV_CONNECTORS
    }

    public constructor(params: EngineConstantsParams) {
        if (!params.publicApiUrl.endsWith('/api/')) {
            throw new EngineGenericError('PublicUrlNotEndsWithSlashError', `Public URL must end with a slash, got: ${params.publicApiUrl}`)
        }
        if (!params.internalApiUrl.endsWith('/')) {
            throw new EngineGenericError('InternalApiUrlNotEndsWithSlashError', `Internal API URL must end with a slash, got: ${params.internalApiUrl}`)
        }

        this.flowId = params.flowId
        this.flowVersionId = params.flowVersionId
        this.flowVersionState = params.flowVersionState
        this.flowRunId = params.flowRunId
        this.publicApiUrl = params.publicApiUrl
        this.internalApiUrl = params.internalApiUrl
        this.retryConstants = params.retryConstants
        this.triggerConnectorName = params.triggerConnectorName
        this.engineToken = params.engineToken
        this.workspaceId = params.workspaceId
        this.streamStepProgress = params.streamStepProgress
        this.workerHandlerId = params.workerHandlerId
        this.httpRequestId = params.httpRequestId
        this.resumePayload = params.resumePayload
        this.runEnvironment = params.runEnvironment
        this.stepNameToTest = params.stepNameToTest
        this.logsFileId = params.logsFileId
        this.platformId = params.platformId
        this.timeoutInSeconds = params.timeoutInSeconds
        this.stepNames = params.stepNames
        this.actionRunMode = params.actionRunMode ?? false
    }

    public static fromExecuteFlowInput(input: ResolvedExecuteFlowOperation): EngineConstants {
        return new EngineConstants({
            ...sharedFields(input),
            ...flowFields(input.flowVersion),
            flowRunId: input.flowRunId,
            internalApiUrl: input.internalApiUrl,
            streamStepProgress: input.streamStepProgress,
            workerHandlerId: input.workerHandlerId ?? null,
            httpRequestId: input.httpRequestId ?? null,
            resumePayload: input.executionType === ExecutionType.RESUME ? input.resumePayload : undefined,
            runEnvironment: input.runEnvironment,
            stepNameToTest: input.stepNameToTest ?? undefined,
            logsFileId: input.logsFileId,
        })
    }

    public static fromExecuteActionInput(input: BaseEngineOperation & { flowVersionId?: string }): EngineConstants {
        return new EngineConstants({
            ...sharedFields(input),
            ...flowFields(undefined),
            flowVersionId: input.flowVersionId ?? DEFAULT_MCP_DATA.flowVersionId,
            flowRunId: DEFAULT_MCP_DATA.flowRunId,
            actionRunMode: true,
        })
    }

    public static fromExecutePropertyInput(input: Omit<ExecutePropsOptions, 'connector'> & { connectorName: string, connectorVersion: string }): EngineConstants {
        const flow = flowFields(input.flowVersion)
        return new EngineConstants({
            ...sharedFields(input),
            ...flow,
            triggerConnectorName: flow.triggerConnectorName ?? DEFAULT_MCP_DATA.triggerConnectorName,
            flowRunId: DEFAULT_EXECUTE_PROPERTY,
        })
    }

    public static fromExecuteTriggerInput(input: ResolvedExecuteTriggerOperation<TriggerHookType>): EngineConstants {
        return new EngineConstants({
            ...sharedFields(input),
            ...flowFields(input.flowVersion),
            flowRunId: DEFAULT_TRIGGER_EXECUTION,
        })
    }
    public getPropsResolver({ contextVersion, connectorName }: GetPropsResolverParams): PropsResolver {
        return createPropsResolver({
            workspaceId: this.workspaceId,
            engineToken: this.engineToken,
            apiUrl: this.internalApiUrl,
            contextVersion,
            stepNames: this.stepNames,
            connectorName,
        })
    }
    private async getWorkspace(): Promise<Workspace> {
        if (this.workspace) {
            return this.workspace
        }

        const getWorkerWorkspaceEndpoint = `${this.internalApiUrl}v1/worker/workspace`

        const response = await retryFetch(getWorkerWorkspaceEndpoint, {
            headers: {
                Authorization: `Bearer ${this.engineToken}`,
            },
        })

        this.workspace = await response.json() as Workspace
        return this.workspace
    }

    public externalWorkspaceId = async (): Promise<string | undefined> => {
        const workspace = await this.getWorkspace()
        return workspace.externalId ?? undefined
    }
}

function sharedFields(input: SharedFieldsSource) {
    return {
        publicApiUrl: input.publicApiUrl,
        internalApiUrl: ensureTrailingSlash(input.internalApiUrl),
        engineToken: input.engineToken,
        workspaceId: input.workspaceId,
        timeoutInSeconds: input.timeoutInSeconds,
        platformId: input.platformId,
        retryConstants: DEFAULT_RETRY_CONSTANTS,
        streamStepProgress: StreamStepProgress.NONE,
        workerHandlerId: null,
        httpRequestId: null,
    }
}

function flowFields(flowVersion: FlowFieldsSource | undefined) {
    if (isNil(flowVersion)) {
        return {
            flowId: DEFAULT_MCP_DATA.flowId,
            flowVersionId: DEFAULT_MCP_DATA.flowVersionId,
            flowVersionState: DEFAULT_MCP_DATA.flowVersionState,
            triggerConnectorName: DEFAULT_MCP_DATA.triggerConnectorName,
            stepNames: [],
        }
    }
    return {
        flowId: flowVersion.flowId,
        flowVersionId: flowVersion.id,
        flowVersionState: flowVersion.state,
        triggerConnectorName: flowVersion.trigger?.settings.connectorName,
        stepNames: isNil(flowVersion.trigger) ? [] : flowStructureUtil.getAllSteps(flowVersion.trigger).map((step) => step.name),
    }
}

type GetPropsResolverParams = {
    contextVersion: ContextVersion | undefined
    connectorName?: string
}

type SharedFieldsSource = {
    publicApiUrl: string
    internalApiUrl: string
    engineToken: string
    workspaceId: WorkspaceId
    timeoutInSeconds: number
    platformId: PlatformId
}

type FlowFieldsSource = {
    flowId: string
    id: string
    state: FlowVersionState
    trigger?: FlowTrigger
}

export type ResolvedBeginExecuteFlowOperation = Omit<BeginExecuteFlowOperation, 'triggerPayload'> & {
    triggerPayload: unknown
}

export type ResolvedExecuteTriggerOperation<HT extends TriggerHookType> = Omit<ExecuteTriggerOperation<HT>, 'triggerPayload'> & {
    triggerPayload?: unknown
}

export type ResolvedResumeExecuteFlowOperation = Omit<ResumeExecuteFlowOperation, 'resumePayload'> & {
    resumePayload: ResumePayload
    executionState: ExecutionState
}

export type ResolvedExecuteFlowOperation = ResolvedBeginExecuteFlowOperation | ResolvedResumeExecuteFlowOperation
