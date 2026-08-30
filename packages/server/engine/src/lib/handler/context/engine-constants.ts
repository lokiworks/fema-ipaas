import { ContextVersion } from '@fema-ipaas/connector-sdk'
import { ensureTrailingSlash, isNil, ProjectId, TenantId } from '@fema-ipaas/core-utils'
import { BaseEngineOperation, BeginExecuteWorkflowOperation, DEFAULT_MCP_DATA, EngineGenericError, ExecutePropsOptions, ExecuteTriggerOperation, ExecutionState, ExecutionType, Project, ResumeExecuteWorkflowOperation, ResumePayload, RunEnvironment, StreamStepProgress, TriggerHookType, WorkflowGraph, workflowStructureUtil, WorkflowTrigger, WorkflowVersionState } from '@fema-ipaas/shared'
import { retryFetch } from '../../api/retry-fetch'
import { createPropsResolver, PropsResolver } from '../../variables/props-resolver'

type RetryConstants = {
    maxAttempts: number
    retryExponential: number
    retryInterval: number
}

type EngineConstantsParams = {
    workflowId: string
    workflowVersionId: string
    workflowGraph?: WorkflowGraph | null
    workflowVersionState: WorkflowVersionState
    triggerConnectorName: string
    executionId: string
    publicApiUrl: string
    internalApiUrl: string
    retryConstants: RetryConstants
    engineToken: string
    projectId: ProjectId
    streamStepProgress: StreamStepProgress
    workerHandlerId: string | null
    httpRequestId: string | null
    resumePayload?: ResumePayload
    runEnvironment?: RunEnvironment
    stepNameToTest?: string
    logsFileId?: string
    timeoutInSeconds: number
    tenantId: TenantId
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

    public readonly tenantId: string
    public readonly timeoutInSeconds: number
    public readonly workflowId: string
    public readonly workflowVersionId: string
    public readonly workflowGraph: WorkflowGraph | null
    public readonly workflowVersionState: WorkflowVersionState
    public readonly triggerConnectorName: string
    public readonly executionId: string
    public readonly publicApiUrl: string
    public readonly internalApiUrl: string
    public readonly retryConstants: RetryConstants
    public readonly engineToken: string
    public readonly projectId: ProjectId
    public readonly streamStepProgress: StreamStepProgress
    public readonly workerHandlerId: string | null
    public readonly httpRequestId: string | null
    public readonly resumePayload?: ResumePayload
    public readonly runEnvironment?: RunEnvironment
    public readonly stepNameToTest?: string
    public readonly logsFileId?: string
    public readonly stepNames: string[] = []
    public readonly actionRunMode: boolean
    private project: Project | null = null

    public get isRunningApTests(): boolean {
        return EngineConstants.TEST_MODE
    }

    public get isTestWorkflow(): boolean {
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

        this.workflowId = params.workflowId
        this.workflowVersionId = params.workflowVersionId
        this.workflowGraph = params.workflowGraph ?? null
        this.workflowVersionState = params.workflowVersionState
        this.executionId = params.executionId
        this.publicApiUrl = params.publicApiUrl
        this.internalApiUrl = params.internalApiUrl
        this.retryConstants = params.retryConstants
        this.triggerConnectorName = params.triggerConnectorName
        this.engineToken = params.engineToken
        this.projectId = params.projectId
        this.streamStepProgress = params.streamStepProgress
        this.workerHandlerId = params.workerHandlerId
        this.httpRequestId = params.httpRequestId
        this.resumePayload = params.resumePayload
        this.runEnvironment = params.runEnvironment
        this.stepNameToTest = params.stepNameToTest
        this.logsFileId = params.logsFileId
        this.tenantId = params.tenantId
        this.timeoutInSeconds = params.timeoutInSeconds
        this.stepNames = params.stepNames
        this.actionRunMode = params.actionRunMode ?? false
    }

    public static fromExecuteWorkflowInput(input: ResolvedExecuteWorkflowOperation): EngineConstants {
        return new EngineConstants({
            ...sharedFields(input),
            ...workflowFields(input.workflowVersion),
            executionId: input.executionId,
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

    public static fromExecuteActionInput(input: BaseEngineOperation & { workflowVersionId?: string }): EngineConstants {
        return new EngineConstants({
            ...sharedFields(input),
            ...workflowFields(undefined),
            workflowVersionId: input.workflowVersionId ?? DEFAULT_MCP_DATA.workflowVersionId,
            executionId: DEFAULT_MCP_DATA.executionId,
            actionRunMode: true,
        })
    }

    public static fromExecutePropertyInput(input: Omit<ExecutePropsOptions, 'connector'> & { connectorName: string, connectorVersion: string }): EngineConstants {
        const workflow = workflowFields(input.workflowVersion)
        return new EngineConstants({
            ...sharedFields(input),
            ...workflow,
            triggerConnectorName: workflow.triggerConnectorName ?? DEFAULT_MCP_DATA.triggerConnectorName,
            executionId: DEFAULT_EXECUTE_PROPERTY,
        })
    }

    public static fromExecuteTriggerInput(input: ResolvedExecuteTriggerOperation<TriggerHookType>): EngineConstants {
        return new EngineConstants({
            ...sharedFields(input),
            ...workflowFields(input.workflowVersion),
            executionId: DEFAULT_TRIGGER_EXECUTION,
        })
    }
    public getPropsResolver({ contextVersion, connectorName }: GetPropsResolverParams): PropsResolver {
        return createPropsResolver({
            projectId: this.projectId,
            engineToken: this.engineToken,
            apiUrl: this.internalApiUrl,
            contextVersion,
            stepNames: this.stepNames,
            connectorName,
        })
    }
    private async getProject(): Promise<Project> {
        if (this.project) {
            return this.project
        }

        const getWorkerProjectEndpoint = `${this.internalApiUrl}v1/worker/project`

        const response = await retryFetch(getWorkerProjectEndpoint, {
            headers: {
                Authorization: `Bearer ${this.engineToken}`,
            },
        })

        this.project = await response.json() as Project
        return this.project
    }

    public externalProjectId = async (): Promise<string | undefined> => {
        const project = await this.getProject()
        return project.externalId ?? undefined
    }
}

function sharedFields(input: SharedFieldsSource) {
    return {
        publicApiUrl: input.publicApiUrl,
        internalApiUrl: ensureTrailingSlash(input.internalApiUrl),
        engineToken: input.engineToken,
        projectId: input.projectId,
        timeoutInSeconds: input.timeoutInSeconds,
        tenantId: input.tenantId,
        retryConstants: DEFAULT_RETRY_CONSTANTS,
        streamStepProgress: StreamStepProgress.NONE,
        workerHandlerId: null,
        httpRequestId: null,
    }
}

function workflowFields(workflowVersion: WorkflowFieldsSource | undefined) {
    if (isNil(workflowVersion)) {
        return {
            workflowId: DEFAULT_MCP_DATA.workflowId,
            workflowVersionId: DEFAULT_MCP_DATA.workflowVersionId,
            workflowVersionState: DEFAULT_MCP_DATA.workflowVersionState,
            triggerConnectorName: DEFAULT_MCP_DATA.triggerConnectorName,
            stepNames: [],
            workflowGraph: null,
        }
    }
    return {
        workflowId: workflowVersion.workflowId,
        workflowVersionId: workflowVersion.id,
        workflowVersionState: workflowVersion.state,
        triggerConnectorName: workflowVersion.trigger?.settings.connectorName,
        stepNames: isNil(workflowVersion.trigger) ? [] : workflowStructureUtil.getAllSteps(workflowVersion.trigger).map((step) => step.name),
        workflowGraph: workflowVersion.graph ?? null,
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
    projectId: ProjectId
    timeoutInSeconds: number
    tenantId: TenantId
}

type WorkflowFieldsSource = {
    workflowId: string
    id: string
    state: WorkflowVersionState
    trigger?: WorkflowTrigger
    graph?: WorkflowGraph | null
}

export type ResolvedBeginExecuteWorkflowOperation = Omit<BeginExecuteWorkflowOperation, 'triggerPayload'> & {
    triggerPayload: unknown
}

export type ResolvedExecuteTriggerOperation<HT extends TriggerHookType> = Omit<ExecuteTriggerOperation<HT>, 'triggerPayload'> & {
    triggerPayload?: unknown
}

export type ResolvedResumeExecuteWorkflowOperation = Omit<ResumeExecuteWorkflowOperation, 'resumePayload'> & {
    resumePayload: ResumePayload
    executionState: ExecutionState
}

export type ResolvedExecuteWorkflowOperation = ResolvedBeginExecuteWorkflowOperation | ResolvedResumeExecuteWorkflowOperation
