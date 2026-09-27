import { ConnectorAuthProperty, createTrigger, Store, Trigger, TriggerStrategy } from '@fema-ipaas/connector-sdk'
import {
    BlueprintEndpoint,
    blueprintOutput,
    BlueprintPagination,
    BlueprintPollingTrigger,
    blueprintTemplate,
    BlueprintTrigger,
    BlueprintTriggerType,
    ConnectorBlueprintDefinition,
    isNil,
} from '@fema-ipaas/core-utils'
import { blueprintAuth } from './blueprint-auth'
import { blueprintHttp, BlueprintRequestError } from './blueprint-http'
import { blueprintProps } from './blueprint-props'

export const blueprintTriggers = {
    build({ definition, trigger, auth }: BuildParams): Trigger {
        const props = blueprintProps.build({ inputs: trigger.inputs, auth, loadOptions: async () => ({ disabled: true, options: [] }) })
        const common = {
            name: trigger.key,
            displayName: trigger.name,
            description: trigger.description.length > 0 ? trigger.description : trigger.name,
            auth,
            requireAuth: !isNil(auth),
            props,
            sampleData: trigger.sample,
            outputSchema: { fields: blueprintOutput.fields(trigger.sample) },
        }
        if (trigger.type === BlueprintTriggerType.POLLING) {
            return createTrigger({
                ...common,
                type: TriggerStrategy.POLLING,
                onEnable: async (context) => {
                    context.setSchedule({ intervalMs: Math.max(1, trigger.polling.intervalMinutes) * 60_000 })
                    const values = blueprintProps.flatten(context.propsValue)
                    const items = await fetchItems({ definition, polling: trigger.polling, values, authValue: context.auth, checkpoint: null })
                    await context.store.put(POLLING_STATE_KEY, nextState({ polling: trigger.polling, previous: emptyState(), items }))
                },
                onDisable: async (context) => {
                    await context.store.delete(POLLING_STATE_KEY)
                },
                run: async (context) => blueprintTriggers.poll({ definition, polling: trigger.polling, values: blueprintProps.flatten(context.propsValue), authValue: context.auth, store: context.store }),
                test: async (context) => {
                    const items = await fetchItems({ definition, polling: trigger.polling, values: blueprintProps.flatten(context.propsValue), authValue: context.auth, checkpoint: null })
                    return items.slice(0, TEST_ITEM_COUNT)
                },
            })
        }
        return createTrigger({
            ...common,
            type: TriggerStrategy.WEBHOOK,
            onEnable: async (context) => {
                const values = blueprintProps.flatten(context.propsValue)
                if (!trigger.instant.subscribe.enabled) {
                    return
                }
                const response = await callEndpoint({ definition, endpoint: trigger.instant.subscribe, values, authValue: context.auth, extra: { webhookUrl: context.webhookUrl } })
                const subscriptionId = blueprintTemplate.stringify(blueprintTemplate.readPath({ source: response, path: trigger.instant.subscriptionIdPath }))
                await context.store.put(SUBSCRIPTION_KEY, { subscriptionId })
            },
            onDisable: async (context) => {
                const values = blueprintProps.flatten(context.propsValue)
                const stored = await context.store.get<{ subscriptionId?: string }>(SUBSCRIPTION_KEY)
                if (trigger.instant.unsubscribe.enabled) {
                    await callEndpoint({ definition, endpoint: trigger.instant.unsubscribe, values, authValue: context.auth, extra: { webhookUrl: context.webhookUrl, subscriptionId: stored?.subscriptionId ?? '' } })
                }
                await context.store.delete(SUBSCRIPTION_KEY)
            },
            run: async (context) => blueprintTriggers.handle({ trigger, event: context.payload.body, values: blueprintProps.flatten(context.propsValue) }),
        })
    },
    async poll({ definition, polling, values, authValue, store }: PollParams): Promise<unknown[]> {
        const previous = await store.get<PollingState>(POLLING_STATE_KEY) ?? emptyState()
        const items = await fetchItems({ definition, polling, values, authValue, checkpoint: previous.checkpoint })
        const fresh = items.filter((item) => {
            const key = dedupeKeyOf({ polling, item })
            return key.length === 0 || !previous.seen.includes(key)
        })
        await store.put(POLLING_STATE_KEY, nextState({ polling, previous, items }))
        return fresh
    },
    handle({ trigger, event, values }: { trigger: BlueprintTrigger, event: unknown, values: Record<string, unknown> }): unknown[] {
        const template = trigger.instant.handle.trim().length === 0 ? '{{event}}' : trigger.instant.handle
        const rendered: unknown = JSON.parse(blueprintTemplate.renderJson({ template, vars: { event, input: values, settings: values } }))
        return Array.isArray(rendered) ? rendered : [rendered]
    },
    nextState,
}

async function fetchItems({ definition, polling, values, authValue, checkpoint }: FetchParams): Promise<unknown[]> {
    const credential = await blueprintAuth.resolve({ definition, value: authValue })
    const request = blueprintTemplate.resolveRequest({ method: polling.method, path: polling.path, inputs: [], request: polling.request })
    const auth = blueprintAuth.active(definition)
    const checkpointVars = polling.checkpointName.trim().length > 0 ? { [polling.checkpointName.trim()]: checkpoint ?? '' } : {}
    const pages = polling.pagination === BlueprintPagination.NONE ? 1 : Math.max(1, polling.maxPages)
    const collected: unknown[] = []
    let page = polling.startPage
    let cursor = ''
    for (let index = 0; index < pages; index++) {
        const extraQuery = paginationQuery({ polling, page, cursor })
        const built = blueprintTemplate.buildRequest({
            baseUrl: definition.baseUrl,
            method: polling.method,
            path: polling.path,
            request,
            vars: { input: values, settings: values, authInput: credential.authInput, authData: credential.authData, checkpoint: checkpointVars, page, cursor },
            extraQuery,
        })
        const result = await blueprintHttp.execute({ request: built, credential, plugin: auth?.plugin ?? null, status: definition.status, timeoutSeconds: request.timeoutSeconds, followRedirect: request.followRedirect })
        if (!result.outcome.success) {
            throw new BlueprintRequestError(`Polling failed with code ${result.outcome.code}: ${result.outcome.message ?? ''}`)
        }
        const context = { body: result.body, headers: result.headers, status: result.status }
        const list = blueprintTemplate.readPath({ source: context, path: responsePath(polling.listPath) })
        collected.push(...(Array.isArray(list) ? list : []))
        if (polling.pagination === BlueprintPagination.NONE) {
            break
        }
        const hasMore = truthy(blueprintTemplate.readPath({ source: context, path: responsePath(polling.hasMorePath) }))
        cursor = blueprintTemplate.stringify(blueprintTemplate.readPath({ source: context, path: responsePath(polling.cursorPath) }))
        if (!hasMore || (polling.pagination === BlueprintPagination.CURSOR && cursor.length === 0)) {
            break
        }
        page += 1
    }
    return collected
}

async function callEndpoint({ definition, endpoint, values, authValue, extra }: CallEndpointParams): Promise<unknown> {
    const credential = await blueprintAuth.resolve({ definition, value: authValue })
    const request = blueprintTemplate.resolveRequest({ method: endpoint.method, path: endpoint.path, inputs: [], request: endpoint.request })
    const auth = blueprintAuth.active(definition)
    const built = blueprintTemplate.buildRequest({
        baseUrl: definition.baseUrl,
        method: endpoint.method,
        path: endpoint.path,
        request,
        vars: { input: values, settings: values, authInput: credential.authInput, authData: credential.authData, ...extra },
    })
    const result = await blueprintHttp.execute({ request: built, credential, plugin: auth?.plugin ?? null, status: definition.status, timeoutSeconds: request.timeoutSeconds, followRedirect: request.followRedirect })
    if (!result.outcome.success) {
        throw new BlueprintRequestError(`${endpoint.method} ${endpoint.path} failed with code ${result.outcome.code}: ${result.outcome.message ?? ''}`)
    }
    return { body: result.body, headers: result.headers, status: result.status }
}

function paginationQuery({ polling, page, cursor }: { polling: BlueprintPollingTrigger, page: number, cursor: string }): Record<string, string> {
    switch (polling.pagination) {
        case BlueprintPagination.NONE:
            return {}
        case BlueprintPagination.PAGE:
            return { [polling.pageParam]: String(page) }
        case BlueprintPagination.CURSOR:
            return cursor.length > 0 ? { [polling.cursorParam]: cursor } : {}
    }
}

function nextState({ polling, previous, items }: { polling: BlueprintPollingTrigger, previous: PollingState, items: unknown[] }): PollingState {
    const keys = items.map((item) => dedupeKeyOf({ polling, item })).filter((key) => key.length > 0)
    const seen = [...new Set([...keys, ...previous.seen])].slice(0, MAX_SEEN_KEYS)
    const itemPath = polling.checkpointItemPath.trim()
    if (polling.checkpointName.trim().length === 0 || itemPath.length === 0) {
        return { seen, checkpoint: previous.checkpoint }
    }
    const candidates = items
        .map((item) => itemValue({ item, path: itemPath }))
        .filter((value) => !isNil(value) && blueprintTemplate.stringify(value).length > 0)
    const checkpoint = [previous.checkpoint, ...candidates.map((value) => blueprintTemplate.stringify(value))]
        .filter((value): value is string => !isNil(value))
        .reduce<string | null>((best, value) => (isNil(best) || compareCheckpoint({ left: value, right: best }) > 0 ? value : best), null)
    return { seen, checkpoint }
}

function compareCheckpoint({ left, right }: { left: string, right: string }): number {
    const a = Number(left)
    const b = Number(right)
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
        return a - b
    }
    return left.localeCompare(right)
}

function dedupeKeyOf({ polling, item }: { polling: BlueprintPollingTrigger, item: unknown }): string {
    return blueprintTemplate.stringify(itemValue({ item, path: polling.dedupeKey }))
}

function itemValue({ item, path }: { item: unknown, path: string }): unknown {
    const trimmed = path.trim().replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '')
    return trimmed.startsWith('item.') ? blueprintTemplate.readPath({ source: { item }, path: trimmed }) : blueprintTemplate.readPath({ source: item, path: trimmed })
}

function responsePath(path: string): string {
    const trimmed = path.trim().replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '')
    return /^(body|headers|status)(\.|\[|$)/.test(trimmed) ? trimmed : `body.${trimmed}`
}

function truthy(value: unknown): boolean {
    if (typeof value === 'string') {
        return value.length > 0 && value !== 'false' && value !== '0'
    }
    return Boolean(value)
}

function emptyState(): PollingState {
    return { seen: [], checkpoint: null }
}

const POLLING_STATE_KEY = 'devkit_polling_state'
const SUBSCRIPTION_KEY = 'devkit_webhook_subscription'
const MAX_SEEN_KEYS = 1000
const TEST_ITEM_COUNT = 5

type BuildParams = {
    definition: ConnectorBlueprintDefinition
    trigger: BlueprintTrigger
    auth: ConnectorAuthProperty | undefined
}

type FetchParams = {
    definition: ConnectorBlueprintDefinition
    polling: BlueprintPollingTrigger
    values: Record<string, unknown>
    authValue: unknown
    checkpoint: string | null
}

type PollParams = {
    definition: ConnectorBlueprintDefinition
    polling: BlueprintPollingTrigger
    values: Record<string, unknown>
    authValue: unknown
    store: Store
}

type CallEndpointParams = {
    definition: ConnectorBlueprintDefinition
    endpoint: BlueprintEndpoint
    values: Record<string, unknown>
    authValue: unknown
    extra: Record<string, unknown>
}

export type PollingState = {
    seen: string[]
    checkpoint: string | null
}
