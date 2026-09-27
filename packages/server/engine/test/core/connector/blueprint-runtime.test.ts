import http from 'node:http'
import { AddressInfo } from 'node:net'
import { Store } from '@fema-ipaas/connector-sdk'
import {
    BlueprintAuthType,
    blueprintFactory,
    BlueprintHttpMethod,
    BlueprintInputControl,
    BlueprintPagination,
    BlueprintTriggerType,
    BlueprintValueType,
    ConnectorBlueprintDefinition,
} from '@fema-ipaas/core-utils'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { blueprintActions } from '../../../src/lib/core/connector/blueprint-runtime/blueprint-actions'
import { CONDITIONAL_GROUP_KEY } from '../../../src/lib/core/connector/blueprint-runtime/blueprint-props'
import { BLUEPRINT_RUNTIME_GLOBAL, blueprintRuntime } from '../../../src/lib/core/connector/blueprint-runtime/blueprint-runtime'
import { blueprintTriggers } from '../../../src/lib/core/connector/blueprint-runtime/blueprint-triggers'

const requests: RecordedRequest[] = []
const counters: Record<string, number> = {}
let server: http.Server
let baseUrl = ''

beforeAll(async () => {
    server = http.createServer((req, res) => {
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
            const url = new URL(req.url ?? '/', 'http://localhost')
            const body = Buffer.concat(chunks).toString('utf8')
            requests.push({ method: req.method ?? '', path: url.pathname, query: Object.fromEntries(url.searchParams.entries()), headers: req.headers, body })
            counters[url.pathname] = (counters[url.pathname] ?? 0) + 1
            respond({ path: url.pathname, query: url.searchParams, res })
        })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    baseUrl = `http://127.0.0.1:${isAddressInfo(address) ? address.port : 0}`
})

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
})

function respond({ path, query, res }: { path: string, query: URLSearchParams, res: http.ServerResponse }): void {
    const json = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
    }
    switch (path) {
        case '/tickets/T-1':
            return json(200, { code: 0, data: { id: 'T-1', title: 'VPN' } })
        case '/tickets':
            return json(201, { id: 'T-2' })
        case '/business-error':
            return json(200, { code: 1001, message: 'quota exceeded' })
        case '/flaky':
            return (counters['/flaky'] ?? 0) <= 2 ? json(429, { message: 'slow down' }) : json(200, { ok: true })
        case '/oauth/token':
            return json(200, { access_token: 'tok-123', expires_in: 7200 })
        case '/me':
            return json(200, { name: 'Robot' })
        case '/events': {
            const page = Number(query.get('page') ?? '1')
            const items = page === 1 ? [{ id: 'e1', updatedAt: '2026-01-01' }, { id: 'e2', updatedAt: '2026-01-03' }] : [{ id: 'e3', updatedAt: '2026-01-02' }]
            return json(200, { items, has_more: page === 1 })
        }
        case '/hooks':
            return json(200, { id: 'sub-9' })
        default:
            return json(404, { message: 'not found' })
    }
}

function definitionFor(overrides: Partial<ConnectorBlueprintDefinition>): ConnectorBlueprintDefinition {
    return {
        ...blueprintFactory.definition({ displayName: '工单系统', description: '内部工单', iconColor: '#2563EB', baseUrl }),
        ...overrides,
    }
}

function apiKeyAuth() {
    return { ...blueprintFactory.auth({ type: BlueprintAuthType.API_KEY, name: 'Key', description: '' }), credentialName: 'X-Api-Key' }
}

function memoryStore(): Store & { data: Map<string, unknown> } {
    const data = new Map<string, unknown>()
    return {
        data,
        async put<T>(key: string, value: T): Promise<T> {
            data.set(key, value)
            return value
        },
        async get<T>(key: string): Promise<T | null> {
            const value = data.get(key)
            return isStored<T>(value) ? value : null
        },
        async delete(key: string): Promise<void> {
            data.delete(key)
        },
    }
}

function isStored<T>(value: unknown): value is T {
    return value !== undefined
}

function isAddressInfo(value: unknown): value is AddressInfo {
    return typeof value === 'object' && value !== null && 'port' in value
}

describe('blueprintRuntime.build', () => {
    it('produces a connector the engine recognises, with custom auth fields and output schema', () => {
        const operation = { ...blueprintFactory.operation({ key: 'get_ticket', name: '查询工单', method: BlueprintHttpMethod.GET, path: '/tickets/{id}', group: '' }), sample: { id: 'T-1', owner: { name: 'a' } } }
        const connector = blueprintRuntime.build({
            schemaVersion: 1,
            identifier: 'tickets',
            connectorName: '@fema-ipaas/connector-custom-tickets',
            packageVersion: '1.0.0',
            logoUrl: 'data:image/svg+xml;base64,AA==',
            draft: false,
            definition: definitionFor({ auth: apiKeyAuth(), operations: [operation] }),
        })
        expect(connector.constructor.name).toBe('Connector')
        const metadata = connector.metadata()
        expect(Object.keys(metadata.actions)).toEqual(['get_ticket'])
        expect(metadata.actions.get_ticket.outputSchema).toEqual({ fields: [{ key: 'id' }, { key: 'owner', children: [{ key: 'name' }] }] })
        expect(Object.keys(connector.auth?.type === 'CUSTOM_AUTH' ? connector.auth.props : {})).toEqual(['api_key'])
    })

    it('adds the devkit test actions only to draft builds and is reachable through the global hook', () => {
        blueprintRuntime.install()
        const hook: unknown = Reflect.get(globalThis, BLUEPRINT_RUNTIME_GLOBAL)
        expect(typeof hook).toBe('object')
        const manifest = {
            schemaVersion: 1,
            identifier: 'tickets',
            connectorName: '@fema-ipaas/connector-custom-tickets',
            packageVersion: '0.0.0-draft.abc',
            logoUrl: '',
            draft: true,
            definition: definitionFor({ operations: [blueprintFactory.operation({ key: 'list', name: '列表', method: BlueprintHttpMethod.GET, path: '/tickets', group: '' })] }),
        }
        expect(Object.keys(blueprintRuntime.build(manifest).actions())).toEqual(['list', '__devkit_auth_test', '__devkit_debug_list'])
    })

    it('groups inputs with a visibility expression behind a dynamic property', async () => {
        const operation = {
            ...blueprintFactory.operation({ key: 'search', name: '搜索', method: BlueprintHttpMethod.GET, path: '/tickets', group: '' }),
            inputs: [
                { ...blueprintFactory.input({ key: 'mode', label: '模式' }), control: BlueprintInputControl.DROPDOWN, options: ['simple', 'advanced'] },
                { ...blueprintFactory.input({ key: 'query', label: '查询语句' }), visibleIf: 'input.mode == \'advanced\'' },
            ],
        }
        const connector = blueprintRuntime.build({ schemaVersion: 1, identifier: 'x', connectorName: 'x', packageVersion: '1.0.0', logoUrl: '', draft: false, definition: definitionFor({ operations: [operation] }) })
        const props = connector.actions().search.props
        const group = props[CONDITIONAL_GROUP_KEY]
        expect(group.type).toBe('DYNAMIC')
        expect(group.type === 'DYNAMIC' ? group.refreshers : []).toEqual(['mode'])
        const shown = group.type === 'DYNAMIC' ? await group.props({ mode: 'advanced' }, { server: { apiUrl: '', publicUrl: '', token: '' }, project: { id: 'p', externalId: async () => undefined }, searchValue: undefined, flows: { list: async () => ({ data: [], next: null, previous: null }), current: { id: '', version: { id: '' } } }, step: { name: '' } }) : {}
        expect(Object.keys(shown)).toEqual(['query'])
    })
})

describe('blueprintActions.invoke', () => {
    it('applies the API key, path parameters and business code rules', async () => {
        const operation = {
            ...blueprintFactory.operation({ key: 'get_ticket', name: '查询工单', method: BlueprintHttpMethod.GET, path: '/tickets/{id}', group: '' }),
            inputs: [{ ...blueprintFactory.input({ key: 'id', label: 'ID' }), required: true, pattern: '^T-\\d+$', patternMessage: '格式为 T-数字' }],
        }
        const definition = definitionFor({ auth: apiKeyAuth(), operations: [operation] })
        const result = await blueprintActions.invoke({ definition, operation, values: { id: 'T-1' }, authValue: { type: 'CUSTOM_AUTH', props: { api_key: 'secret-key' } } })
        expect(result.body).toEqual({ code: 0, data: { id: 'T-1', title: 'VPN' } })
        expect(requests.at(-1)?.headers['x-api-key']).toBe('secret-key')
        await expect(blueprintActions.invoke({ definition, operation, values: { id: 'bad' }, authValue: { type: 'CUSTOM_AUTH', props: { api_key: 'k' } } })).rejects.toThrow('格式为 T-数字')
    })

    it('fails with the business message when the application code does not match a success rule', async () => {
        const operation = blueprintFactory.operation({ key: 'quota', name: '配额', method: BlueprintHttpMethod.GET, path: '/business-error', group: '' })
        await expect(blueprintActions.invoke({ definition: definitionFor({ operations: [operation] }), operation, values: {}, authValue: undefined })).rejects.toThrow('quota exceeded')
    })

    it('retries retryable status codes before succeeding', async () => {
        const operation = blueprintFactory.operation({ key: 'flaky', name: '不稳定', method: BlueprintHttpMethod.GET, path: '/flaky', group: '' })
        const result = await blueprintActions.invoke({ definition: definitionFor({ operations: [operation] }), operation, values: {}, authValue: undefined })
        expect(result.body).toEqual({ ok: true })
        expect(counters['/flaky']).toBe(3)
    })

    it('sends typed JSON bodies built from inputs', async () => {
        const operation = {
            ...blueprintFactory.operation({ key: 'create', name: '创建', method: BlueprintHttpMethod.POST, path: '/tickets', group: '' }),
            inputs: [blueprintFactory.input({ key: 'title', label: '标题' }), { ...blueprintFactory.input({ key: 'urgent', label: '紧急' }), type: BlueprintValueType.BOOLEAN, control: BlueprintInputControl.SWITCH }],
        }
        await blueprintActions.invoke({ definition: definitionFor({ operations: [operation] }), operation, values: { title: '打印机', urgent: true }, authValue: undefined })
        const last = requests.at(-1)
        expect(last?.method).toBe('POST')
        expect(JSON.parse(last?.body ?? '')).toEqual({ title: '打印机', urgent: true })
    })

    it('exchanges client credentials for a bearer token and runs the signing plugin', async () => {
        const auth = {
            ...blueprintFactory.auth({ type: BlueprintAuthType.CLIENT_CREDENTIALS, name: 'App', description: '' }),
            plugin: { enabled: true, code: 'function beforeRequest(request, auth) {\n  request.headers["X-Sign"] = helpers.sha256(auth.input.client_id);\n  return request;\n}' },
        }
        const operation = blueprintFactory.operation({ key: 'me', name: '我', method: BlueprintHttpMethod.GET, path: '/me', group: '' })
        await blueprintActions.invoke({ definition: definitionFor({ auth, operations: [operation] }), operation, values: {}, authValue: { type: 'CUSTOM_AUTH', props: { client_id: 'cid', client_secret: 'sec' } } })
        const tokenCall = requests.find((request) => request.path === '/oauth/token')
        expect(tokenCall?.body).toContain('grant_type=client_credentials')
        expect(tokenCall?.body).toContain('client_id=cid')
        const last = requests.at(-1)
        expect(last?.headers.authorization).toBe('Bearer tok-123')
        expect(String(last?.headers['x-sign']).length).toBe(64)
    })
})

describe('blueprintTriggers', () => {
    it('polls page by page, only emits unseen items and advances the checkpoint', async () => {
        const trigger = blueprintFactory.trigger({ key: 'events', name: '事件', type: BlueprintTriggerType.POLLING })
        const polling = { ...trigger.polling, path: '/events', pagination: BlueprintPagination.PAGE, hasMorePath: 'has_more', listPath: 'items', checkpointName: 'since', checkpointItemPath: 'updatedAt' }
        const definition = definitionFor({ triggers: [{ ...trigger, polling }] })
        const store = memoryStore()
        await store.put('devkit_polling_state', blueprintTriggers.nextState({ polling, previous: { seen: [], checkpoint: null }, items: [{ id: 'e1', updatedAt: '2026-01-01' }] }))
        const fresh = await blueprintTriggers.poll({ definition, polling, values: {}, authValue: undefined, store })
        expect(fresh).toEqual([{ id: 'e2', updatedAt: '2026-01-03' }, { id: 'e3', updatedAt: '2026-01-02' }])
        expect(store.data.get('devkit_polling_state')).toEqual({ seen: ['e1', 'e2', 'e3'], checkpoint: '2026-01-03' })
        expect(await blueprintTriggers.poll({ definition, polling, values: {}, authValue: undefined, store })).toEqual([])
        expect(requests.filter((request) => request.path === '/events').map((request) => request.query.page)).toContain('2')
    })

    it('maps an instant event through the execution endpoint template', () => {
        const trigger = blueprintFactory.trigger({ key: 'updated', name: '更新', type: BlueprintTriggerType.INSTANT })
        const handled = blueprintTriggers.handle({ trigger: { ...trigger, instant: { ...trigger.instant, handle: '{ "id": "{{event.id}}", "data": {{event.data}} }' } }, event: { id: 'x1', data: { a: 1 } }, values: {} })
        expect(handled).toEqual([{ id: 'x1', data: { a: 1 } }])
        expect(blueprintTriggers.handle({ trigger, event: [{ id: 1 }, { id: 2 }], values: {} })).toEqual([{ id: 1 }, { id: 2 }])
    })
})

type RecordedRequest = {
    method: string
    path: string
    query: Record<string, string>
    headers: http.IncomingHttpHeaders
    body: string
}
