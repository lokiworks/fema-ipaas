import { BlueprintAuthType, BlueprintFieldType, BlueprintHttpMethod, ConnectorBlueprintDefinition } from '@fema-ipaas/shared'
import { connectorBlueprintGenerator } from '../../../../src/app/connectors/blueprint/connector-blueprint-generator'

const BASE: ConnectorBlueprintDefinition = {
    connectorName: '@fema-ipaas/connector-orders',
    displayName: 'Orders',
    description: 'Internal orders API',
    logoUrl: '',
    categories: [],
    documentationUrl: '',
    baseUrl: 'https://api.example.com/v1',
    defaultHeaders: { Accept: 'application/json' },
    auth: { type: BlueprintAuthType.NONE, description: '' },
    actions: [{
        name: 'get_order',
        displayName: 'Get order',
        description: '',
        method: BlueprintHttpMethod.GET,
        path: '/orders/{id}',
        fields: [
            { name: 'id', displayName: 'Order id', description: '', required: true, in: 'path', type: BlueprintFieldType.TEXT, options: [] },
            { name: 'expand', displayName: 'Expand', description: '', required: false, in: 'query', type: BlueprintFieldType.TEXT, options: [] },
        ],
    }],
    networkAgentId: null,
}

function generate(overrides: Partial<ConnectorBlueprintDefinition> = {}) {
    return connectorBlueprintGenerator.generate({ ...BASE, ...overrides })
}

describe('connectorBlueprintGenerator', () => {
    it('emits a package, an index and one file per operation', () => {
        expect(Object.keys(generate()).sort()).toEqual([
            'package.json',
            'src/index.ts',
            'src/lib/actions/get-order.ts',
        ])
    })

    it('refuses to generate with no operations', () => {
        expect(() => generate({ actions: [] })).toThrow(/at least one operation/)
    })

    it('carries the base url and default headers into the index', () => {
        const index = generate()['src/index.ts']
        expect(index).toContain('"https://api.example.com/v1"')
        expect(index).toContain('"Accept": "application/json"')
    })

    it('maps each auth type to the matching SDK auth', () => {
        expect(generate()['src/index.ts']).toContain('ConnectorAuth.None()')
        expect(generate({ auth: { type: BlueprintAuthType.BASIC_AUTH, description: '' } })['src/index.ts'])
            .toContain('ConnectorAuth.BasicAuth')
        expect(generate({ auth: { type: BlueprintAuthType.API_KEY, description: '', parameterName: 'X-Key' } })['src/index.ts'])
            .toContain('ConnectorAuth.SecretText')
        expect(generate({ auth: { type: BlueprintAuthType.CUSTOM_AUTH, description: '' } })['src/index.ts'])
            .toContain('ConnectorAuth.CustomAuth')
    })

    it('sends a bearer token as an Authorization header', () => {
        const action = generate({ auth: { type: BlueprintAuthType.BEARER_TOKEN, description: '' } })['src/lib/actions/get-order.ts']
        expect(action).toContain('Authorization: `Bearer ${context.auth}`')
    })

    it('sends an api key under the configured header name', () => {
        const action = generate({ auth: { type: BlueprintAuthType.API_KEY, description: '', parameterName: 'X-Key' } })['src/lib/actions/get-order.ts']
        expect(action).toContain('"X-Key": String(context.auth)')
    })

    it('routes path fields into the path and query fields into query params', () => {
        const action = generate()['src/lib/actions/get-order.ts']
        expect(action).toContain('"/orders/{id}"')
        expect(action).toContain('queryParams: {')
        expect(action).toContain('"expand"')
        expect(action).not.toContain('queryParams: {\n                "id"')
    })

    it('omits a body when no field targets it, and builds one when a field does', () => {
        expect(generate()['src/lib/actions/get-order.ts']).toContain('body: undefined')
        const withBody = generate({
            actions: [{
                ...BASE.actions[0],
                method: BlueprintHttpMethod.POST,
                fields: [{ name: 'note', displayName: 'Note', description: '', required: false, in: 'body', type: BlueprintFieldType.TEXT, options: [] }],
            }],
        })['src/lib/actions/get-order.ts']
        expect(withBody).toContain('"note": input["note"]')
        expect(withBody).toContain('HttpMethod.POST')
    })

    it('pins the sdk as a workspace dependency and uses an exact version', () => {
        const packageJson = JSON.parse(generate()['package.json'])
        expect(packageJson.name).toBe('@fema-ipaas/connector-orders')
        expect(packageJson.version).toBe('1.0.0')
        expect(packageJson.dependencies['@fema-ipaas/connector-sdk']).toBe('workspace:*')
    })

    it('renders each field type as its matching property kind', () => {
        const files = generate({
            actions: [{
                ...BASE.actions[0],
                fields: [
                    { name: 'count', displayName: 'Count', description: '', required: false, in: 'query', type: BlueprintFieldType.NUMBER, options: [] },
                    { name: 'active', displayName: 'Active', description: '', required: false, in: 'query', type: BlueprintFieldType.CHECKBOX, options: [] },
                    { name: 'secret', displayName: 'Secret', description: '', required: false, in: 'header', type: BlueprintFieldType.SECRET, options: [] },
                    { name: 'payload', displayName: 'Payload', description: '', required: false, in: 'body', type: BlueprintFieldType.JSON, options: [] },
                ],
            }],
        })['src/lib/actions/get-order.ts']
        expect(files).toContain('Property.Number')
        expect(files).toContain('Property.Checkbox')
        expect(files).toContain('Property.SecretText')
        expect(files).toContain('Property.Json')
    })

    it('renders a dropdown field with its configured options', () => {
        const file = generate({
            actions: [{
                ...BASE.actions[0],
                fields: [{
                    name: 'status',
                    displayName: 'Status',
                    description: '',
                    required: true,
                    in: 'query',
                    type: BlueprintFieldType.DROPDOWN,
                    options: ['open', 'closed'],
                }],
            }],
        })['src/lib/actions/get-order.ts']
        expect(file).toContain('Property.StaticDropdown')
        expect(file).toContain('"open"')
        expect(file).toContain('"closed"')
    })
})
