import { ActionContext, backwardCompatabilityContextUtils, Connector, ConnectorAuthProperty, ConnectorPropertyMap, InputPropertyMap, SetScheduleRequest, StaticPropsValue, TagsManager } from '@fema-ipaas/connector-sdk'
import { isNil, isObject } from '@fema-ipaas/core-utils'
import { AUTHENTICATION_PROPERTY_NAME, EngineGenericError, InvalidCronExpressionError, InvalidScheduleIntervalError, ScheduleOptions, TriggerSourceScheduleType } from '@fema-ipaas/shared'
import { isValidCron } from 'cron-validator'
import { retryFetch } from '../../api/retry-fetch'
import { createFileUploader } from '../../connector-context/file-uploader'
import { createContextStore } from '../../connector-context/store'
import { createWorkflowsContext } from '../../connector-context/workflows'
import { executionProgressReporter } from '../../helper/execution-progress-reporter'
import { utils } from '../../utils'
import { propsProcessor } from '../../variables/props-processor'
import { buildRunContext } from '../run-context'
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
            workflowId: runtime.workflowId,
            engineToken: runtime.engineToken,
        }),
        output: runtime.actionRunMode
            ? { update: async (): Promise<void> => Promise.resolve() }
            : executionProgressReporter.createOutputContext(runtime),
        workflows: createWorkflowsContext({
            engineToken: runtime.engineToken,
            internalApiUrl: runtime.internalApiUrl,
            workflowId: runtime.workflowId,
            workflowVersionId: runtime.workflowVersionId,
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
        run: buildRunContext({ runtime, stepName, hooks, pending }),
        project: createProjectContext(runtime),
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
            workflowId: runtime.workflowId,
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
        workflows: createWorkflowsContext({
            engineToken: runtime.engineToken,
            internalApiUrl: runtime.internalApiUrl,
            workflowId: runtime.workflowId,
            workflowVersionId: runtime.workflowVersionId,
        }),
        webhookUrl: request.webhookUrl,
        isRepublish: request.isRepublish,
        auth: propsValue[AUTHENTICATION_PROPERTY_NAME],
        propsValue,
        payload: request.payload ?? {},
        run: { id: runtime.executionId },
        project: createProjectContext(runtime),
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
        project: createProjectContext(runtime),
        workflows: createWorkflowsContext({
            engineToken: runtime.engineToken,
            internalApiUrl: runtime.internalApiUrl,
            workflowId: runtime.workflowId,
            workflowVersionId: runtime.workflowVersionId,
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
        projectId: runtime.projectId,
        engineToken: runtime.engineToken,
        target,
        hookResponse: hooks.hookResponse,
        contextVersion: runtime.contextVersion,
        connectorName: runtime.connectorName,
    })
}

function createProjectContext(runtime: ConnectorRuntime): { id: string, externalId: () => Promise<string | undefined> } {
    return {
        id: runtime.projectId,
        externalId: async () => {
            const response = await retryFetch(`${runtime.internalApiUrl}v1/worker/project`, {
                headers: { Authorization: `Bearer ${runtime.engineToken}` },
            })
            const project = await response.json()
            return isObject(project) && typeof project.externalId === 'string' ? project.externalId : undefined
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

export type BuiltContext = {
    args: unknown[]
    hooks: CollectedHooks
    pending: Promise<unknown>[]
}
