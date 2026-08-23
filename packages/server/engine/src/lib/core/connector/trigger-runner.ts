import { ConnectorPropertyMap, StaticPropsValue, TriggerStrategy } from '@fema/connector-sdk'
import { assertEqual, isNil, isObject } from '@fema/core-utils'
import { ConnectorTrigger, EngineGenericError, EngineHttpResponse, ExecuteTriggerResponse, FlowTrigger, PropertySettings, TriggerHookType } from '@fema/shared'
import { buildRuntime } from '../../handler/connector-executor'
import { EngineConstants, ResolvedExecuteTriggerOperation } from '../../handler/context/engine-constants'
import { FlowExecutorContext } from '../../handler/context/flow-execution-context'
import { createPropsResolver } from '../../variables/props-resolver'
import { CollectedHooks, TriggerContextRequest } from './connector-protocol'
import { ConnectorRef, connectorRunner } from './connector-runner'

export const triggerRunner = {
    async executeOnStart({ trigger, constants, payload }: ExecuteOnStartParams): Promise<void> {
        const { connectorName, connectorVersion, triggerName, input, propertySettings } = (trigger as ConnectorTrigger).settings
        assertTriggerName(triggerName)

        const connector: ConnectorRef = { connectorName, connectorVersion, devConnectors: constants.devConnectors }
        const description = await connectorRunner.describe(connector)
        if (!description.hasPath(['triggers', triggerName, 'onStart'])) {
            return
        }
        await connectorRunner.call({
            connector,
            path: ['triggers', triggerName, 'onStart'],
            context: await buildTriggerContext({
                connector,
                constants,
                triggerName,
                input,
                propertySettings,
                contextVersion: description.metadata.contextInfo?.version,
                payload,
                storePrefix: '',
                includeFiles: false,
            }),
        })
    },

    async executeTrigger({ params, constants }: ExecuteTriggerParams): Promise<ExecuteTriggerResponse<TriggerHookType>> {
        const { connectorName, connectorVersion, triggerName, input, propertySettings } = (params.flowVersion.trigger as ConnectorTrigger).settings
        assertTriggerName(triggerName)

        const connector: ConnectorRef = { connectorName, connectorVersion, devConnectors: constants.devConnectors }
        const description = await connectorRunner.describe(connector)
        const connectorTrigger = description.metadata.triggers[triggerName]
        if (isNil(connectorTrigger)) {
            throw new EngineGenericError('TriggerNotFoundError', `Trigger not found, connectorName=${connectorName}, triggerName=${triggerName}`)
        }

        const context = await buildTriggerContext({
            connector,
            constants,
            triggerName,
            input,
            propertySettings,
            contextVersion: description.metadata.contextInfo?.version,
            payload: params.triggerPayload,
            storePrefix: params.test ? 'test' : '',
            includeFiles: params.hookType === TriggerHookType.TEST || params.hookType === TriggerHookType.RUN,
            webhookUrl: params.webhookUrl,
            isRepublish: params.isRepublish,
        })
        const runHook = async (methodName: string): Promise<{ result: unknown, hooks?: CollectedHooks }> =>
            connectorRunner.call({ connector, path: ['triggers', triggerName, methodName], context })

        switch (params.hookType) {
            case TriggerHookType.ON_DISABLE: {
                await runHook('onDisable')
                return {}
            }
            case TriggerHookType.ON_ENABLE: {
                const { hooks } = await runHook('onEnable')
                return {
                    listeners: hooks?.listeners ?? [],
                    scheduleOptions: connectorTrigger.type === TriggerStrategy.POLLING ? hooks?.scheduleOptions : undefined,
                }
            }
            case TriggerHookType.RENEW: {
                assertEqual(connectorTrigger.type, TriggerStrategy.WEBHOOK, 'triggerType', 'WEBHOOK')
                await runHook('onRenew')
                return {}
            }
            case TriggerHookType.HANDSHAKE: {
                const { result } = await runHook('onHandshake')
                return { response: toWebhookResponse(result) }
            }
            case TriggerHookType.TEST: {
                const { result } = await runHook('test')
                return { output: toItems(result) }
            }
            case TriggerHookType.RUN: {
                if (connectorTrigger.type === TriggerStrategy.APP_WEBHOOK) {
                    await verifyAppWebhook({ connector, description, params, connectorName })
                }
                const { result } = await runHook('run')
                return { output: toItems(result) }
            }
        }
    },
}

async function buildTriggerContext({ connector, constants, triggerName, input, propertySettings, contextVersion, payload, storePrefix, includeFiles, webhookUrl, isRepublish }: BuildTriggerContextParams): Promise<TriggerContextRequest> {
    const { resolvedInput } = await createPropsResolver({
        apiUrl: constants.internalApiUrl,
        projectId: constants.projectId,
        engineToken: constants.engineToken,
        contextVersion,
        stepNames: constants.stepNames,
        connectorName: connector.connectorName,
    }).resolve<StaticPropsValue<ConnectorPropertyMap>>({
        unresolvedInput: input,
        executionState: FlowExecutorContext.empty(),
    })

    return {
        kind: 'trigger',
        runtime: buildRuntime({ constants, connectorName: connector.connectorName, contextVersion }),
        stepName: triggerName,
        resolvedInput,
        propertySettings,
        payload,
        storePrefix,
        includeFiles,
        webhookUrl,
        isRepublish,
    }
}

async function verifyAppWebhook({ connector, description, params, connectorName }: VerifyAppWebhookParams): Promise<void> {
    if (!params.appWebhookUrl) {
        throw new EngineGenericError('AppWebhookUrlNotAvailableError', `App webhook url is not available for connector name ${connectorName}`)
    }
    if (!params.webhookSecret) {
        throw new EngineGenericError('WebhookSecretNotAvailableError', `Webhook secret is not available for connector name ${connectorName}`)
    }
    if (!description.hasPath(['events', 'verify'])) {
        throw new Error('Webhook is not verified')
    }
    const { result } = await connectorRunner.call({
        connector,
        path: ['events', 'verify'],
        args: [{
            appWebhookUrl: params.appWebhookUrl,
            payload: params.triggerPayload,
            webhookSecret: params.webhookSecret,
        }],
    })
    if (result !== true) {
        throw new Error('Webhook is not verified')
    }
}

function assertTriggerName(triggerName: string | undefined): asserts triggerName is string {
    if (isNil(triggerName)) {
        throw new EngineGenericError('TriggerNameNotSetError', 'Trigger name is not set')
    }
}

function toItems(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
        throw new EngineGenericError('TriggerOutputNotArrayError', `Trigger returned ${typeof value} instead of an array of items`)
    }
    return value
}

function toWebhookResponse(value: unknown): { status: number, body?: unknown, headers?: Record<string, string> } | undefined {
    if (!isObject(value)) {
        return undefined
    }
    return {
        status: typeof value.status === 'number' ? value.status : 200,
        body: value.body,
        headers: EngineHttpResponse.shape.headers.safeParse(value.headers).data ?? {},
    }
}

type ExecuteOnStartParams = {
    trigger: FlowTrigger
    constants: EngineConstants
    payload: unknown
}

type ExecuteTriggerParams = {
    params: ResolvedExecuteTriggerOperation<TriggerHookType>
    constants: EngineConstants
}

type BuildTriggerContextParams = {
    connector: ConnectorRef
    constants: EngineConstants
    triggerName: string
    input: unknown
    propertySettings: Record<string, PropertySettings>
    contextVersion: TriggerContextRequest['runtime']['contextVersion']
    payload: unknown
    storePrefix: string
    includeFiles: boolean
    webhookUrl?: string
    isRepublish?: boolean
}

type VerifyAppWebhookParams = {
    connector: ConnectorRef
    description: Awaited<ReturnType<typeof connectorRunner.describe>>
    params: ResolvedExecuteTriggerOperation<TriggerHookType>
    connectorName: string
}
