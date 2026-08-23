import { ActionContext, backwardCompatabilityContextUtils, Connector, ConnectorAuthProperty, ConnectorPropertyMap, CreateWaitpointHook, CreateWaitpointParams, CreateWaitpointResult, InputPropertyMap, SetScheduleRequest, StaticPropsValue, StopHookParams, TagsManager } from '@fema/connector-sdk'
import { isNil, isObject } from '@fema/core-utils'
import { AUTHENTICATION_PROPERTY_NAME, EngineGenericError, InvalidCronExpressionError, InvalidScheduleIntervalError, PausedFlowTimeoutError, ScheduleOptions, TriggerSourceScheduleType } from '@fema/shared'
import { isValidCron } from 'cron-validator'
import dayjs from 'dayjs'
import { retryFetch } from '../../api/retry-fetch'
import { createFileUploader } from '../../connector-context/file-uploader'
import { createFlowsContext } from '../../connector-context/flows'
import { createContextStore } from '../../connector-context/store'
import { waitpointClient } from '../../connector-context/waitpoint-client'
import { flowRunProgressReporter } from '../../helper/flow-run-progress-reporter'
import { utils } from '../../utils'
import { propsProcessor } from '../../variables/props-processor'
import { ActionContextRequest, CollectedHooks, ConnectorRuntime, ContextRequest, PropsContextRequest, TriggerContextRequest } from './connector-protocol'

export async function buildContext({ connector, request }: BuildContextParams): Promise<BuiltContext> {
    const hooks: CollectedHooks = {
        hookResponse: { type: 'none', tags: [] },
        listeners: [],
    }
    const pending: Promise<unknown>[] = []
    switch (request.kind) {
        case 'action':
            return { args: [await buildActionContext({ connector, request, hooks, pending })], hooks, pending }
        case 'trigger':
            return { args: [await buildTriggerContext({ connector, request, hooks })], hooks, pending }
        case 'props':
            return { args: [request.resolvedInput, buildPropsContext(request)], hooks, pending }
    }
}

async function buildActionContext({ connector, request, hooks, pending }: ActionParams): Promise<unknown> {
    const { runtime, stepName, actionName } = request
    const action = connector.getAction(actionName)
    if (isNil(action)) {
        throw new EngineGenericError('ActionNotFoundError', `Action not found, actionName=${actionName}`)
    }
    const propsValue = await processProps({ request, props: action.props, requireAuth: action.requireAuth, connector })

    const context: ActionContext<ConnectorAuthProperty, InputPropertyMap> = {
        executionType: request.executionType,
        resumePayload: request.resumePayload!,
        store: createContextStore({
            apiUrl: runtime.internalApiUrl,
            prefix: '',
            flowId: runtime.flowId,
            engineToken: runtime.engineToken,
        }),
        output: runtime.actionRunMode
            ? { update: async (): Promise<void> => Promise.resolve() }
            : flowRunProgressReporter.createOutputContext(runtime),
        flows: createFlowsContext({
            engineToken: runtime.engineToken,
            internalApiUrl: runtime.internalApiUrl,
            flowId: runtime.flowId,
            flowVersionId: runtime.flowVersionId,
        }),
        step: { name: stepName },
        auth: propsValue[AUTHENTICATION_PROPERTY_NAME],
        files: createFileUploader({ apiUrl: runtime.internalApiUrl, engineToken: runtime.engineToken }),
        server: {
            token: runtime.engineToken,
            apiUrl: runtime.internalApiUrl,
            publicUrl: runtime.publicApiUrl,
        },
        propsValue,
        tags: createTagsManager(hooks),
        connections: createConnections({ runtime, target: 'actions', hooks }),
        run: {
            id: runtime.flowRunId,
            stop: (request?: StopHookParams) => {
                hooks.hookResponse = { ...hooks.hookResponse, type: 'stopped', response: request ?? { response: {} } }
            },
            respond: (request?: StopHookParams) => {
                hooks.hookResponse = { ...hooks.hookResponse, type: 'respond', response: request ?? { response: {} } }
            },
            createWaitpoint: createWaitpointHook({ runtime, stepName, hooks, pending }),
            waitForWaitpoint: () => {
                assertCanSuspend(runtime)
                hooks.hookResponse = { ...hooks.hookResponse, type: 'paused' }
            },
        },
        workspace: createWorkspaceContext(runtime),
    }

    return backwardCompatabilityContextUtils.makeActionContextBackwardCompatible({
        contextVersion: runtime.contextVersion,
        context,
    })
}

async function buildTriggerContext({ connector, request, hooks }: TriggerParams): Promise<unknown> {
    const { runtime, stepName } = request
    const trigger = connector.getTrigger(stepName)
    if (isNil(trigger)) {
        throw new EngineGenericError('TriggerNotFoundError', `Trigger not found, stepName=${stepName}`)
    }
    const propsValue = await processProps({ request, props: trigger.props, requireAuth: trigger.requireAuth, connector })

    return {
        store: createContextStore({
            apiUrl: runtime.internalApiUrl,
            prefix: request.storePrefix,
            flowId: runtime.flowId,
            engineToken: runtime.engineToken,
        }),
        step: { name: stepName },
        app: {
            createListeners: ({ events, identifierKey, identifierValue }: { events: string[], identifierKey: string, identifierValue: string }): void => {
                hooks.listeners.push({ events, identifierValue, identifierKey })
            },
        },
        setSchedule: (scheduleRequest: SetScheduleRequest) => {
            hooks.scheduleOptions = parseSchedule(scheduleRequest)
        },
        flows: createFlowsContext({
            engineToken: runtime.engineToken,
            internalApiUrl: runtime.internalApiUrl,
            flowId: runtime.flowId,
            flowVersionId: runtime.flowVersionId,
        }),
        webhookUrl: request.webhookUrl,
        isRepublish: request.isRepublish,
        auth: propsValue[AUTHENTICATION_PROPERTY_NAME],
        propsValue,
        payload: request.payload ?? {},
        run: { id: runtime.flowRunId },
        workspace: createWorkspaceContext(runtime),
        server: {
            token: runtime.engineToken,
            apiUrl: runtime.internalApiUrl,
            publicUrl: runtime.publicApiUrl,
        },
        connections: createConnections({ runtime, target: 'triggers', hooks }),
        ...(request.includeFiles ? { files: createFileUploader({ apiUrl: runtime.internalApiUrl, engineToken: runtime.engineToken }) } : {}),
    }
}

function buildPropsContext({ runtime, stepName, searchValue }: PropsContextRequest): unknown {
    return {
        searchValue,
        server: {
            token: runtime.engineToken,
            apiUrl: runtime.internalApiUrl,
            publicUrl: runtime.publicApiUrl,
        },
        workspace: createWorkspaceContext(runtime),
        flows: createFlowsContext({
            engineToken: runtime.engineToken,
            internalApiUrl: runtime.internalApiUrl,
            flowId: runtime.flowId,
            flowVersionId: runtime.flowVersionId,
        }),
        step: { name: stepName },
        connections: createConnections({
            runtime,
            target: 'properties',
            hooks: { hookResponse: { type: 'none', tags: [] }, listeners: [] },
        }),
    }
}

async function processProps({ request, props, requireAuth, connector }: ProcessPropsParams): Promise<StaticPropsValue<ConnectorPropertyMap>> {
    const { processedInput, errors } = await propsProcessor.applyProcessorsAndValidators(
        request.resolvedInput,
        props,
        connector.auth,
        requireAuth,
        request.propertySettings,
    )
    if (Object.keys(errors).length > 0) {
        throw new Error(JSON.stringify(errors, null, 2))
    }
    return processedInput
}

function createConnections({ runtime, target, hooks }: { runtime: ConnectorRuntime, target: 'actions' | 'triggers' | 'properties', hooks: CollectedHooks }): ReturnType<typeof utils.createConnectionManager> {
    return utils.createConnectionManager({
        apiUrl: runtime.internalApiUrl,
        workspaceId: runtime.workspaceId,
        engineToken: runtime.engineToken,
        target,
        hookResponse: hooks.hookResponse,
        contextVersion: runtime.contextVersion,
        connectorName: runtime.connectorName,
    })
}

function createWorkspaceContext(runtime: ConnectorRuntime): { id: string, externalId: () => Promise<string | undefined> } {
    return {
        id: runtime.workspaceId,
        externalId: async () => {
            const response = await retryFetch(`${runtime.internalApiUrl}v1/worker/workspace`, {
                headers: { Authorization: `Bearer ${runtime.engineToken}` },
            })
            const workspace = await response.json()
            return isObject(workspace) && typeof workspace.externalId === 'string' ? workspace.externalId : undefined
        },
    }
}

function createTagsManager(hooks: CollectedHooks): TagsManager {
    return {
        add: async ({ name }: { name: string }): Promise<void> => {
            hooks.hookResponse.tags.push(name)
        },
    }
}

function createWaitpointHook({ runtime, stepName, hooks, pending }: WaitpointHookParams): CreateWaitpointHook {
    return (params: CreateWaitpointParams) => {
        const created = createWaitpoint({ runtime, stepName, hooks, params })
        pending.push(created)
        return created
    }
}

async function createWaitpoint({ runtime, stepName, hooks, params }: SubmitWaitpointParams): Promise<CreateWaitpointResult> {
    assertCanSuspend(runtime)
    assertDelayWithinTimeout(params.resumeDateTime)
    if (!isNil(params.responseToSend)) {
        hooks.hookResponse = { ...hooks.hookResponse, responseToSend: params.responseToSend }
    }
    const result = await waitpointClient.create({
        apiUrl: runtime.internalApiUrl,
        engineToken: runtime.engineToken,
        flowRunId: runtime.flowRunId,
        workspaceId: runtime.workspaceId,
        stepName,
        type: params.type,
        version: params.version ?? 'V1',
        resumeDateTime: params.resumeDateTime,
        responseToSend: params.responseToSend,
        workerHandlerId: runtime.workerHandlerId,
        httpRequestId: runtime.httpRequestId,
    })
    return {
        ...result,
        buildResumeUrl: ({ queryParams, sync }) => {
            const url = new URL(`${result.resumeUrl}${sync ? '/sync' : ''}`)
            url.search = new URLSearchParams(queryParams).toString()
            return url.toString()
        },
    }
}

function parseSchedule(request: SetScheduleRequest): ScheduleOptions {
    if ('intervalMs' in request) {
        const parsed = ScheduleOptions.safeParse({ type: TriggerSourceScheduleType.INTERVAL, intervalMs: request.intervalMs })
        if (!parsed.success) {
            throw new InvalidScheduleIntervalError(request.intervalMs)
        }
        return parsed.data
    }
    if (!isValidCron(request.cronExpression)) {
        throw new InvalidCronExpressionError(request.cronExpression)
    }
    return {
        type: TriggerSourceScheduleType.CRON_EXPRESSION,
        cronExpression: request.cronExpression,
        timezone: request.timezone ?? 'UTC',
    }
}

function assertCanSuspend(runtime: ConnectorRuntime): void {
    if (runtime.actionRunMode) {
        throw new Error('This action pauses the run (waitpoint) and can only run inside a flow, not as a action run.')
    }
}

function assertDelayWithinTimeout(resumeDateTime?: string): void {
    if (isNil(resumeDateTime)) {
        return
    }
    if (dayjs(resumeDateTime).diff(dayjs(), 'days') > FEMA_PAUSED_FLOW_TIMEOUT_DAYS) {
        throw new PausedFlowTimeoutError(undefined, FEMA_PAUSED_FLOW_TIMEOUT_DAYS)
    }
}

const FEMA_PAUSED_FLOW_TIMEOUT_DAYS = Number(process.env.FEMA_PAUSED_FLOW_TIMEOUT_DAYS)


type BuildContextParams = {
    connector: Connector
    request: ContextRequest
}

type ActionParams = {
    connector: Connector
    request: ActionContextRequest
    hooks: CollectedHooks
    pending: Promise<unknown>[]
}

type TriggerParams = {
    connector: Connector
    request: TriggerContextRequest
    hooks: CollectedHooks
}

type ProcessPropsParams = {
    request: ActionContextRequest | TriggerContextRequest
    props: Parameters<typeof propsProcessor.applyProcessorsAndValidators>[1]
    requireAuth: boolean
    connector: Connector
}

type WaitpointHookParams = {
    runtime: ConnectorRuntime
    stepName: string
    hooks: CollectedHooks
    pending: Promise<unknown>[]
}

type SubmitWaitpointParams = {
    runtime: ConnectorRuntime
    stepName: string
    hooks: CollectedHooks
    params: CreateWaitpointParams
}

export type BuiltContext = {
    args: unknown[]
    hooks: CollectedHooks
    pending: Promise<unknown>[]
}
