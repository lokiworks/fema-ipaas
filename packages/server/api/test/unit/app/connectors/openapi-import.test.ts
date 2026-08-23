import { openApiConnectorGenerator } from '../../../../src/app/connectors/openapi/openapi-connector-generator'
import { openApiParser } from '../../../../src/app/connectors/openapi/openapi-parser'

const OPENAPI_3 = {
    openapi: '3.0.0',
    info: { title: 'Orders API', version: '2.1.0', description: 'Internal orders' },
    servers: [{ url: 'https://api.example.com/v1' }],
    components: {
        securitySchemes: {
            apiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
        },
    },
    paths: {
        '/orders': {
            parameters: [{ name: 'tenant', in: 'query', required: true, schema: { type: 'string' } }],
            get: {
                operationId: 'listOrders',
                summary: 'List orders',
                parameters: [
                    { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['open', 'closed'] } },
                    { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
                    { name: 'includeArchived', in: 'query', required: false, schema: { type: 'boolean' } },
                    { name: 'since', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
                    { name: 'tags', in: 'query', required: false, schema: { type: 'array' } },
                ],
            },
            post: {
                summary: 'Create an order',
                requestBody: { content: { 'application/json': {} } },
            },
        },
        '/orders/{id}': {
            get: {
                operationId: 'getOrder',
                summary: 'Get an order',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            },
        },
    },
}

const SWAGGER_2 = {
    swagger: '2.0',
    info: { title: 'Legacy API', version: '1.0.0' },
    host: 'legacy.example.com',
    basePath: '/api',
    schemes: ['https'],
    securityDefinitions: { basic: { type: 'basic' } },
    paths: { '/ping': { get: { operationId: 'ping', summary: 'Ping' } } },
}

describe('openApiParser', () => {
    it('reads title, version and server from an OpenAPI 3 document', () => {
        const parsed = openApiParser.parse(OPENAPI_3)
        expect(parsed.title).toBe('Orders API')
        expect(parsed.version).toBe('2.1.0')
        expect(parsed.servers).toEqual(['https://api.example.com/v1'])
    })

    it('derives a server from a Swagger 2 host, scheme and basePath', () => {
        expect(openApiParser.parse(SWAGGER_2).servers).toEqual(['https://legacy.example.com/api'])
    })

    it('reads security schemes from either OpenAPI 3 or Swagger 2', () => {
        expect(openApiParser.parse(OPENAPI_3).authSchemes[0]).toEqual(
            expect.objectContaining({ name: 'apiKey', type: 'apiKey', in: 'header', parameterName: 'X-Api-Key' }),
        )
        expect(openApiParser.parse(SWAGGER_2).authSchemes[0]).toEqual(
            expect.objectContaining({ name: 'basic', type: 'basic' }),
        )
    })

    it('merges path-level parameters into every operation on that path', () => {
        const listOrders = openApiParser.parse(OPENAPI_3).operations.find((operation) => operation.operationId === 'listOrders')
        const names = listOrders?.parameters.map((parameter) => parameter.name) ?? []
        expect(names).toContain('tenant')
        expect(names).toContain('status')
    })

    it('synthesises an operationId when the document omits one', () => {
        const created = openApiParser.parse(OPENAPI_3).operations.find((operation) => operation.method === 'POST')
        expect(created?.operationId).toBe('post_orders')
        expect(created?.hasRequestBody).toBe(true)
    })

    it('rejects a document that is not an object', () => {
        expect(() => openApiParser.parse('not-a-document')).toThrow()
    })
})

describe('openApiConnectorGenerator', () => {
    const parsed = openApiParser.parse(OPENAPI_3)

    function generate(operationIds: string[]) {
        return openApiConnectorGenerator.generate({
            parsed,
            operationIds,
            connectorName: '@fema-ipaas/connector-orders',
            displayName: 'Orders',
        })
    }

    it('emits a package.json, an index and one file per selected operation', () => {
        const generated = generate(['listOrders', 'getOrder'])
        expect(Object.keys(generated.files).sort()).toEqual([
            'package.json',
            'src/index.ts',
            'src/lib/actions/getorder.ts',
            'src/lib/actions/listorders.ts',
        ])
    })

    it('does not generate files for operations the user did not select', () => {
        const generated = generate(['listOrders'])
        expect(Object.keys(generated.files)).not.toContain('src/lib/actions/getorder.ts')
    })

    it('pins the connector sdk as a workspace dependency and uses an exact version', () => {
        const packageJson = JSON.parse(generate(['listOrders']).files['package.json'])
        expect(packageJson.name).toBe('@fema-ipaas/connector-orders')
        expect(packageJson.version).toBe('1.0.0')
        expect(packageJson.dependencies['@fema-ipaas/connector-sdk']).toBe('workspace:*')
    })

    it('turns path parameters into a runtime path substitution', () => {
        const action = generate(['getOrder']).files['src/lib/actions/getorder.ts']
        expect(action).toContain('"/orders/{id}"')
        expect(action).toContain('replace(')
        expect(action).toContain('HttpMethod.GET')
    })

    it('passes query parameters through as query params, not path segments', () => {
        const action = generate(['listOrders']).files['src/lib/actions/listorders.ts']
        expect(action).toContain('queryParams: {')
        expect(action).toContain('"status"')
        expect(action).toContain('"tenant"')
    })

    it('maps an apiKey scheme to a secret-text auth', () => {
        expect(generate(['listOrders']).files['src/index.ts']).toContain('ConnectorAuth.SecretText')
    })

    it('maps http basic to basic auth', () => {
        const generated = openApiConnectorGenerator.generate({
            parsed: openApiParser.parse({
                ...SWAGGER_2,
                components: { securitySchemes: { login: { type: 'http', scheme: 'basic' } } },
            }),
            operationIds: ['ping'],
            connectorName: '@fema-ipaas/connector-legacy',
            displayName: 'Legacy',
        })
        expect(generated.files['src/index.ts']).toContain('ConnectorAuth.BasicAuth')
    })

    it('refuses to generate a connector with no operations selected', () => {
        expect(() => generate([])).toThrow(/at least one operation/)
    })

    it('maps declared schema types onto matching property kinds', () => {
        const action = generate(['listOrders']).files['src/lib/actions/listorders.ts']
        expect(action).toContain('Property.Number')
        expect(action).toContain('Property.Checkbox')
        expect(action).toContain('Property.DateTime')
        expect(action).toContain('Property.Array')
    })

    it('turns an enum into a static dropdown carrying its values', () => {
        const action = generate(['listOrders']).files['src/lib/actions/listorders.ts']
        expect(action).toContain('Property.StaticDropdown')
        expect(action).toContain('"open"')
        expect(action).toContain('"closed"')
    })

    it('still falls back to short text for an untyped parameter', () => {
        const action = generate(['getOrder']).files['src/lib/actions/getorder.ts']
        expect(action).toContain('Property.ShortText')
    })
})
