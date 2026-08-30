import { BlueprintAction, BlueprintAuthType, BlueprintField, BlueprintFieldType, ConnectorBlueprintDefinition } from '@fema-ipaas/shared'

export const connectorBlueprintGenerator = {
    generate(definition: ConnectorBlueprintDefinition): Record<string, string> {
        if (definition.actions.length === 0) {
            throw new Error('Add at least one operation before generating a connector')
        }
        return {
            'package.json': packageJsonFor(definition),
            'src/index.ts': indexFileFor(definition),
            ...Object.fromEntries(definition.actions.map((action) => [
                `src/lib/actions/${fileNameOf(action)}.ts`,
                actionFileFor({ action, definition }),
            ])),
        }
    },
}

function packageJsonFor(definition: ConnectorBlueprintDefinition): string {
    return `${JSON.stringify({
        name: definition.connectorName,
        version: '1.0.0',
        description: definition.description || `${definition.displayName} connector`,
        main: './src/index.js',
        dependencies: {
            '@fema-ipaas/connector-sdk': 'project:*',
            '@fema-ipaas/connector-common': 'project:*',
        },
    }, null, 2)}\n`
}

function indexFileFor(definition: ConnectorBlueprintDefinition): string {
    const imports = definition.actions
        .map((action) => `import { ${camelCase(action.name)} } from './lib/actions/${fileNameOf(action)}'`)
        .join('\n')
    return `import { ConnectorAuth, createConnector } from '@fema-ipaas/connector-sdk'
${imports}

export const connectorAuth = ${authExpressionFor(definition)}

export const BASE_URL = ${JSON.stringify(definition.baseUrl)}
export const DEFAULT_HEADERS = ${JSON.stringify(definition.defaultHeaders, null, 4)}

export const ${camelCase(stripScope(definition.connectorName))} = createConnector({
    displayName: ${JSON.stringify(definition.displayName)},
    description: ${JSON.stringify(definition.description)},
    auth: connectorAuth,
    minimumSupportedRelease: '0.0.0',
    logoUrl: ${JSON.stringify(definition.logoUrl || '/assets/steps/code.svg')},
    categories: ${JSON.stringify(definition.categories)},
    authors: [],
    actions: [${definition.actions.map((action) => camelCase(action.name)).join(', ')}],
    triggers: [],
})
`
}

function authExpressionFor(definition: ConnectorBlueprintDefinition): string {
    const description = JSON.stringify(definition.auth.description || `Credential for ${definition.displayName}`)
    switch (definition.auth.type) {
        case BlueprintAuthType.NONE:
            return 'ConnectorAuth.None()'
        case BlueprintAuthType.BASIC_AUTH:
            return `ConnectorAuth.BasicAuth({
    description: ${description},
    required: true,
    username: { displayName: 'Username' },
    password: { displayName: 'Password' },
})`
        case BlueprintAuthType.CUSTOM_AUTH:
            return `ConnectorAuth.CustomAuth({
    description: ${description},
    required: true,
    props: {},
})`
        case BlueprintAuthType.API_KEY:
        case BlueprintAuthType.BEARER_TOKEN:
            return `ConnectorAuth.SecretText({
    displayName: ${JSON.stringify(definition.auth.parameterName || 'API Key')},
    description: ${description},
    required: true,
})`
    }
}

function actionFileFor({ action, definition }: { action: BlueprintAction, definition: ConnectorBlueprintDefinition }): string {
    const props = action.fields.map(propertyFor).join('\n')
    return `import { createAction, Property } from '@fema-ipaas/connector-sdk'
import { httpClient, HttpMethod } from '@fema-ipaas/connector-common'
import { BASE_URL, connectorAuth, DEFAULT_HEADERS } from '../../index'

export const ${camelCase(action.name)} = createAction({
    auth: connectorAuth,
    name: ${JSON.stringify(action.name)},
    displayName: ${JSON.stringify(action.displayName)},
    description: ${JSON.stringify(action.description || action.displayName)},
    props: {
${props}
    },
    async run(context) {
        const input = context.propsValue
        const path = ${JSON.stringify(action.path)}.replace(/\\{([^}]+)\\}/g, (_match, name) => String(input[name] ?? ''))
        const response = await httpClient.sendRequest({
            method: HttpMethod.${action.method},
            url: \`\${BASE_URL}\${path}\`,
            headers: { ...DEFAULT_HEADERS${authHeaderFor(definition)} },
            queryParams: ${paramsFor(action, 'query')},
            body: ${bodyFor(action)},
        })
        return response.body
    },
})
`
}

function propertyFor(field: BlueprintField): string {
    const common = `            displayName: ${JSON.stringify(field.displayName)},
            description: ${JSON.stringify(field.description)},
            required: ${field.required},`
    if (field.type === BlueprintFieldType.DROPDOWN) {
        const options = field.options
            .map((value) => `                    { label: ${JSON.stringify(value)}, value: ${JSON.stringify(value)} },`)
            .join('\n')
        return `        ${JSON.stringify(field.name)}: Property.StaticDropdown({
${common}
            options: {
                options: [
${options}
                ],
            },
        }),`
    }
    return `        ${JSON.stringify(field.name)}: Property.${PROPERTY_KIND[field.type]}({
${common}
        }),`
}

const PROPERTY_KIND: Record<BlueprintFieldType, string> = {
    [BlueprintFieldType.TEXT]: 'ShortText',
    [BlueprintFieldType.LONG_TEXT]: 'LongText',
    [BlueprintFieldType.NUMBER]: 'Number',
    [BlueprintFieldType.CHECKBOX]: 'Checkbox',
    [BlueprintFieldType.DROPDOWN]: 'StaticDropdown',
    [BlueprintFieldType.DATE_TIME]: 'DateTime',
    [BlueprintFieldType.JSON]: 'Json',
    [BlueprintFieldType.ARRAY]: 'Array',
    [BlueprintFieldType.OBJECT]: 'Object',
    [BlueprintFieldType.SECRET]: 'SecretText',
}

function authHeaderFor(definition: ConnectorBlueprintDefinition): string {
    switch (definition.auth.type) {
        case BlueprintAuthType.BEARER_TOKEN:
            return ', Authorization: `Bearer ${context.auth}`'
        case BlueprintAuthType.API_KEY:
            return `, ${JSON.stringify(definition.auth.parameterName || 'X-Api-Key')}: String(context.auth)`
        default:
            return ''
    }
}

function paramsFor(action: BlueprintAction, location: BlueprintField['in']): string {
    const fields = action.fields.filter((field) => field.in === location)
    if (fields.length === 0) {
        return '{}'
    }
    const entries = fields
        .map((field) => `                ${JSON.stringify(field.name)}: input[${JSON.stringify(field.name)}] === undefined ? undefined : String(input[${JSON.stringify(field.name)}]),`)
        .join('\n')
    return `{\n${entries}\n            }`
}

function bodyFor(action: BlueprintAction): string {
    const bodyFields = action.fields.filter((field) => field.in === 'body')
    if (bodyFields.length === 0) {
        return 'undefined'
    }
    const entries = bodyFields
        .map((field) => `                ${JSON.stringify(field.name)}: input[${JSON.stringify(field.name)}],`)
        .join('\n')
    return `{\n${entries}\n            }`
}

function fileNameOf(action: BlueprintAction): string {
    return action.name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
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
