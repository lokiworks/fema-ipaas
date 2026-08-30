import { ParsedAuthScheme, ParsedOpenApi, ParsedOperation, ParsedParameter } from './openapi-parser'
import { propertyForSchema } from './property-for-schema'

export const openApiConnectorGenerator = {
    generate({ parsed, operationIds, connectorName, displayName }: GenerateParams): GeneratedConnector {
        const selected = parsed.operations.filter((operation) => operationIds.includes(operation.operationId))
        if (selected.length === 0) {
            throw new Error('Select at least one operation to generate a connector')
        }
        const baseUrl = parsed.servers[0] ?? ''
        return {
            connectorName,
            displayName,
            baseUrl,
            authScheme: parsed.authSchemes[0],
            files: {
                'package.json': packageJsonFor({ connectorName, displayName, version: '1.0.0' }),
                'src/index.ts': indexFileFor({ connectorName, displayName, description: parsed.description, baseUrl, operations: selected, authScheme: parsed.authSchemes[0] }),
                ...Object.fromEntries(selected.map((operation) => [
                    `src/lib/actions/${fileNameOf(operation)}.ts`,
                    actionFileFor({ operation, baseUrl }),
                ])),
            },
        }
    },
}

function packageJsonFor({ connectorName, displayName, version }: { connectorName: string, displayName: string, version: string }): string {
    return `${JSON.stringify({
        name: connectorName,
        version,
        description: `${displayName} connector generated from an OpenAPI document`,
        main: './src/index.js',
        dependencies: {
            '@fema-ipaas/connector-sdk': 'project:*',
            '@fema-ipaas/connector-common': 'project:*',
        },
    }, null, 2)}\n`
}

function indexFileFor({ connectorName, displayName, description, baseUrl, operations, authScheme }: IndexFileParams): string {
    const imports = operations
        .map((operation) => `import { ${camelCase(operation.operationId)} } from './lib/actions/${fileNameOf(operation)}'`)
        .join('\n')
    return `import { createConnector } from '@fema-ipaas/connector-sdk'
${imports}

${authBlockFor(authScheme)}

export const ${camelCase(stripScope(connectorName))} = createConnector({
    displayName: '${escapeSingleQuotes(displayName)}',
    description: '${escapeSingleQuotes(description)}',
    auth: connectorAuth,
    minimumSupportedRelease: '0.0.0',
    logoUrl: '/assets/steps/code.svg',
    authors: [],
    actions: [${operations.map((operation) => camelCase(operation.operationId)).join(', ')}],
    triggers: [],
})

export const BASE_URL = '${escapeSingleQuotes(baseUrl)}'
`
}

function authBlockFor(authScheme: ParsedAuthScheme | undefined): string {
    if (authScheme === undefined) {
        return 'const connectorAuth = ConnectorAuth.None()\n\nimport { ConnectorAuth } from \'@fema-ipaas/connector-sdk\''
    }
    if (authScheme.type === 'http' && authScheme.scheme === 'basic') {
        return `import { ConnectorAuth } from '@fema-ipaas/connector-sdk'

const connectorAuth = ConnectorAuth.BasicAuth({
    description: 'Basic authentication for this API',
    required: true,
    username: { displayName: 'Username' },
    password: { displayName: 'Password' },
})`
    }
    return `import { ConnectorAuth } from '@fema-ipaas/connector-sdk'

const connectorAuth = ConnectorAuth.SecretText({
    displayName: '${escapeSingleQuotes(authScheme.parameterName ?? authScheme.name)}',
    description: 'Credential for this API (${escapeSingleQuotes(authScheme.type)})',
    required: true,
})`
}

function actionFileFor({ operation, baseUrl }: { operation: ParsedOperation, baseUrl: string }): string {
    const props = operation.parameters
        .filter((parameter) => parameter.name.length > 0)
        .map((parameter) => propertyForSchema.render({
            name: parameter.name,
            displayName: parameter.name,
            description: parameter.description,
            required: parameter.required,
            type: parameter.type,
            format: parameter.format,
            enumValues: parameter.enumValues,
        }))
        .join('\n')
    const bodyProp = operation.hasRequestBody
        ? `        body: Property.Json({
            displayName: 'Body',
            description: 'Request body',
            required: false,
        }),`
        : ''
    return `import { createAction, Property } from '@fema-ipaas/connector-sdk'
import { httpClient, HttpMethod } from '@fema-ipaas/connector-common'

export const ${camelCase(operation.operationId)} = createAction({
    name: ${JSON.stringify(operation.operationId)},
    displayName: ${JSON.stringify(operation.summary)},
    description: ${JSON.stringify(operation.description || operation.summary)},
    props: {
${[props, bodyProp].filter((entry) => entry.length > 0).join('\n')}
    },
    async run(context) {
        const input = context.propsValue
        const path = ${JSON.stringify(operation.path)}.replace(/\\{([^}]+)\\}/g, (_match, name) => String(input[name] ?? ''))
        const response = await httpClient.sendRequest({
            method: HttpMethod.${operation.method},
            url: \`${escapeBackticks(baseUrl)}\${path}\`,
            queryParams: ${queryParamsFor(operation)},
            body: ${operation.hasRequestBody ? 'input.body' : 'undefined'},
        })
        return response.body
    },
})
`
}

function queryParamsFor(operation: ParsedOperation): string {
    const queryParameters = operation.parameters.filter((parameter) => parameter.in === 'query')
    if (queryParameters.length === 0) {
        return '{}'
    }
    const entries = queryParameters
        .map((parameter) => `            ${JSON.stringify(parameter.name)}: input[${JSON.stringify(parameter.name)}] === undefined ? undefined : String(input[${JSON.stringify(parameter.name)}]),`)
        .join('\n')
    return `{\n${entries}\n        }`
}

function fileNameOf(operation: ParsedOperation): string {
    return operation.operationId.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
}

function camelCase(value: string): string {
    const parts = value.split(/[^a-zA-Z0-9]+/).filter((part) => part.length > 0)
    if (parts.length === 0) {
        return 'action'
    }
    return parts[0].toLowerCase() + parts.slice(1).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

function stripScope(connectorName: string): string {
    return connectorName.replace('@fema-ipaas/connector-', '')
}

function escapeSingleQuotes(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')
}

function escapeBackticks(value: string): string {
    return value.replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

type IndexFileParams = {
    connectorName: string
    displayName: string
    description: string
    baseUrl: string
    operations: ParsedOperation[]
    authScheme: ParsedAuthScheme | undefined
}

type GenerateParams = {
    parsed: ParsedOpenApi
    operationIds: string[]
    connectorName: string
    displayName: string
}

export type GeneratedConnector = {
    connectorName: string
    displayName: string
    baseUrl: string
    authScheme: ParsedAuthScheme | undefined
    files: Record<string, string>
}

export type { ParsedParameter }
