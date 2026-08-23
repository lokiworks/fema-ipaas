
const SUPPORTED_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const

export const openApiParser = {
    parse(document: unknown): ParsedOpenApi {
        if (!isRecord(document)) {
            throw new Error('The OpenAPI document must be a JSON object')
        }
        const info = isRecord(document.info) ? document.info : {}
        const paths = isRecord(document.paths) ? document.paths : {}
        return {
            title: typeof info.title === 'string' ? info.title : 'Imported API',
            version: typeof info.version === 'string' ? info.version : '1.0.0',
            description: typeof info.description === 'string' ? info.description : '',
            servers: parseServers(document),
            authSchemes: parseAuthSchemes(document),
            operations: parseOperations(paths),
        }
    },
}

function parseServers(document: Record<string, unknown>): string[] {
    if (Array.isArray(document.servers)) {
        return document.servers
            .filter(isRecord)
            .map((server) => server.url)
            .filter((url): url is string => typeof url === 'string')
    }
    const host = document.host
    if (typeof host === 'string') {
        const schemes = Array.isArray(document.schemes) ? document.schemes : ['https']
        const basePath = typeof document.basePath === 'string' ? document.basePath : ''
        return schemes
            .filter((scheme): scheme is string => typeof scheme === 'string')
            .map((scheme) => `${scheme}://${host}${basePath}`)
    }
    return []
}

function parseAuthSchemes(document: Record<string, unknown>): ParsedAuthScheme[] {
    const components = isRecord(document.components) ? document.components : {}
    const securitySchemes = isRecord(components.securitySchemes)
        ? components.securitySchemes
        : isRecord(document.securityDefinitions) ? document.securityDefinitions : {}
    return Object.entries(securitySchemes)
        .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
        .map(([name, scheme]) => ({
            name,
            type: typeof scheme.type === 'string' ? scheme.type : 'unknown',
            scheme: typeof scheme.scheme === 'string' ? scheme.scheme : undefined,
            in: typeof scheme.in === 'string' ? scheme.in : undefined,
            parameterName: typeof scheme.name === 'string' ? scheme.name : undefined,
        }))
}

function parseOperations(paths: Record<string, unknown>): ParsedOperation[] {
    const operations: ParsedOperation[] = []
    for (const [path, pathItem] of Object.entries(paths)) {
        if (!isRecord(pathItem)) {
            continue
        }
        const sharedParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : []
        for (const method of SUPPORTED_METHODS) {
            const operation = pathItem[method]
            if (!isRecord(operation)) {
                continue
            }
            const parameters = [...sharedParameters, ...(Array.isArray(operation.parameters) ? operation.parameters : [])]
            operations.push({
                operationId: typeof operation.operationId === 'string' ? operation.operationId : deriveOperationId(method, path),
                method: method.toUpperCase(),
                path,
                summary: typeof operation.summary === 'string' ? operation.summary : `${method.toUpperCase()} ${path}`,
                description: typeof operation.description === 'string' ? operation.description : '',
                parameters: parameters.filter(isRecord).map(toParameter),
                hasRequestBody: isRecord(operation.requestBody),
            })
        }
    }
    return operations
}

function toParameter(parameter: Record<string, unknown>): ParsedParameter {
    const schema = isRecord(parameter.schema) ? parameter.schema : {}
    return {
        name: typeof parameter.name === 'string' ? parameter.name : '',
        in: typeof parameter.in === 'string' ? parameter.in : 'query',
        required: parameter.required === true,
        description: typeof parameter.description === 'string' ? parameter.description : '',
        type: typeof schema.type === 'string' ? schema.type : typeof parameter.type === 'string' ? parameter.type : 'string',
    }
}

function deriveOperationId(method: string, path: string): string {
    const segments = path.split('/').filter((segment) => segment.length > 0 && !segment.startsWith('{'))
    return [method, ...segments].join('_').replace(/[^a-zA-Z0-9_]/g, '_')
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type ParsedParameter = {
    name: string
    in: string
    required: boolean
    description: string
    type: string
}

export type ParsedOperation = {
    operationId: string
    method: string
    path: string
    summary: string
    description: string
    parameters: ParsedParameter[]
    hasRequestBody: boolean
}

export type ParsedAuthScheme = {
    name: string
    type: string
    scheme?: string
    in?: string
    parameterName?: string
}

export type ParsedOpenApi = {
    title: string
    version: string
    description: string
    servers: string[]
    authSchemes: ParsedAuthScheme[]
    operations: ParsedOperation[]
}
