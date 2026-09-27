import {
    BLUEPRINT_LIMITS,
    BlueprintBodyType,
    blueprintFactory,
    BlueprintHttpMethod,
    BlueprintInput,
    BlueprintInputControl,
    BlueprintOperation,
    BlueprintOptionsSource,
    BlueprintRequestConfig,
    blueprintRules,
    BlueprintValueType,
    isNil,
} from '@fema-ipaas/shared'
import { openApiParser } from './openapi-parser'

export const openApiBlueprintMapper = {
    map({ document, takenIdentifiers }: MapParams): OpenApiBlueprintMapping {
        if (!isRecord(document) || typeof document.openapi !== 'string' || !document.openapi.startsWith('3.') || !isRecord(document.paths)) {
            throw new OpenApiMappingError('The document is not an OpenAPI 3.x specification: the openapi version or paths are missing')
        }
        const parsed = openApiParser.parse(document)
        const paths = document.paths
        const supported = parsed.operations.filter((operation) => isBlueprintMethod(operation.method))
        if (supported.length === 0) {
            throw new OpenApiMappingError('The paths contain no operation that can be imported')
        }
        const keys = supported.reduce<string[]>((taken, operation) => [...taken, blueprintRules.uniqueKey({ base: blueprintRules.slug(operation.operationId), taken })], [])
        const title = parsed.title.trim().slice(0, BLUEPRINT_LIMITS.name) || 'Imported connector'
        const server = (parsed.servers[0] ?? '').replace(/\/+$/, '')
        const operations = supported.map((operation, index) => {
            const raw = rawOperation({ paths, path: operation.path, method: operation.method })
            return toOperation({ document, raw, key: keys[index], method: toMethod(operation.method), path: operation.path, summary: operation.summary, operationId: operation.operationId, description: operation.description })
        })
        return {
            title,
            description: parsed.description.slice(0, BLUEPRINT_LIMITS.description),
            baseUrl: blueprintRules.isHttpUrl(server) ? server : '',
            identifier: blueprintRules.uniqueKey({ base: blueprintRules.slug(`custom_${parsed.title}`), taken: takenIdentifiers }),
            operations,
        }
    },
}

function toOperation({ document, raw, key, method, path, summary, operationId, description }: ToOperationParams): BlueprintOperation {
    const parameterInputs = parametersOf(raw).map((parameter) => inputOf({ document, key: parameter.name, schema: resolveSchema({ document, schema: parameter.schema }), required: parameter.required, description: parameter.description, location: parameter.location }))
    const bodySchema = requestBodySchema({ document, raw })
    const requiredBody = Array.isArray(bodySchema.required) ? bodySchema.required.filter((entry): entry is string => typeof entry === 'string') : []
    const bodyInputs = isRecord(bodySchema.properties)
        ? Object.entries(bodySchema.properties).map(([name, schema]) => {
            const resolved = resolveSchema({ document, schema })
            return inputOf({ document, key: name, schema: resolved, required: requiredBody.includes(name), description: typeof resolved.description === 'string' ? resolved.description : '', location: 'body' })
        })
        : []
    const unique = [...parameterInputs, ...bodyInputs]
        .filter((entry) => blueprintRules.isValidFieldKey(entry.input.key))
        .filter((entry, index, all) => all.findIndex((candidate) => candidate.input.key === entry.input.key) === index)
    const displayName = (summary.trim().length > 0 ? summary : operationId).slice(0, BLUEPRINT_LIMITS.name)
    const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : []
    return {
        ...blueprintFactory.operation({ key, name: displayName, method, path, group: (tags[0] ?? '').slice(0, BLUEPRINT_LIMITS.group) }),
        description: description.slice(0, BLUEPRINT_LIMITS.operationDescription),
        inputs: unique.map((entry) => entry.input),
        request: requestOf({ method, entries: unique }),
        sample: sampleOf(raw),
    }
}

function requestOf({ method, entries }: { method: BlueprintHttpMethod, entries: MappedInput[] }): BlueprintRequestConfig {
    const query = entries.filter((entry) => entry.location === 'query')
    const body = entries.filter((entry) => entry.location === 'body')
    const hasBody = body.length > 0 && method !== BlueprintHttpMethod.GET && method !== BlueprintHttpMethod.DELETE
    const lines = body.map((entry) => `  "${entry.input.key}": ${entry.input.type === BlueprintValueType.STRING ? `"{{input.${entry.input.key}}}"` : `{{input.${entry.input.key}}}`}`)
    return {
        headers: hasBody ? [{ key: 'Content-Type', value: 'application/json' }] : [],
        query: query.map((entry) => ({ key: entry.input.key, value: `{{input.${entry.input.key}}}` })),
        bodyType: hasBody ? BlueprintBodyType.JSON : BlueprintBodyType.NONE,
        body: hasBody ? `{\n${lines.join(',\n')}\n}` : '',
        form: [],
        timeoutSeconds: 30,
        followRedirect: true,
    }
}

function inputOf({ key, schema, required, description, location }: InputOfParams): MappedInput {
    const rawType = typeof schema.type === 'string' ? schema.type : 'string'
    const enumValues = Array.isArray(schema.enum) ? schema.enum.map((value) => String(value)) : []
    const type = valueTypeOf(rawType)
    const control = enumValues.length > 0
        ? BlueprintInputControl.DROPDOWN
        : type === BlueprintValueType.BOOLEAN ? BlueprintInputControl.SWITCH : type === BlueprintValueType.OBJECT || type === BlueprintValueType.ARRAY ? BlueprintInputControl.CODE : BlueprintInputControl.TEXT
    const label = (description.trim().length > 0 ? description : key).slice(0, BLUEPRINT_LIMITS.inputLabel)
    const input: BlueprintInput = {
        ...blueprintFactory.input({ key, label }),
        type: enumValues.length > 0 ? BlueprintValueType.STRING : type,
        control,
        required: required && control !== BlueprintInputControl.SWITCH,
        options: enumValues,
        optionsSource: BlueprintOptionsSource.STATIC,
    }
    return { input, location }
}

function valueTypeOf(type: string): BlueprintValueType {
    switch (type) {
        case 'integer':
        case 'number':
            return BlueprintValueType.NUMBER
        case 'boolean':
            return BlueprintValueType.BOOLEAN
        case 'object':
            return BlueprintValueType.OBJECT
        case 'array':
            return BlueprintValueType.ARRAY
        default:
            return BlueprintValueType.STRING
    }
}

function parametersOf(raw: Record<string, unknown>): RawParameter[] {
    const list = Array.isArray(raw.parameters) ? raw.parameters : []
    return list.filter(isRecord).flatMap((parameter) => {
        const location = parameter.in
        if (typeof parameter.name !== 'string' || (location !== 'query' && location !== 'path')) {
            return []
        }
        return [{
            name: parameter.name,
            location,
            required: parameter.required === true || location === 'path',
            description: typeof parameter.description === 'string' ? parameter.description : '',
            schema: isRecord(parameter.schema) ? parameter.schema : {},
        }]
    })
}

function requestBodySchema({ document, raw }: { document: Record<string, unknown>, raw: Record<string, unknown> }): Record<string, unknown> {
    const requestBody = resolveSchema({ document, schema: raw.requestBody })
    const content = isRecord(requestBody.content) ? requestBody.content : {}
    const json = isRecord(content['application/json']) ? content['application/json'] : {}
    return resolveSchema({ document, schema: json.schema })
}

function sampleOf(raw: Record<string, unknown>): unknown {
    const responses = isRecord(raw.responses) ? raw.responses : {}
    const response = isRecord(responses['200']) ? responses['200'] : isRecord(responses['201']) ? responses['201'] : {}
    const content = isRecord(response.content) ? response.content : {}
    const json = isRecord(content['application/json']) ? content['application/json'] : {}
    if (!isNil(json.example) && typeof json.example === 'object') {
        return json.example
    }
    const examples = isRecord(json.examples) ? Object.values(json.examples).filter(isRecord) : []
    const first = examples[0]?.value
    return !isNil(first) && typeof first === 'object' ? first : {}
}

function rawOperation({ paths, path, method }: { paths: Record<string, unknown>, path: string, method: string }): Record<string, unknown> {
    const item = paths[path]
    if (!isRecord(item)) {
        return {}
    }
    const operation = item[method.toLowerCase()]
    const shared = Array.isArray(item.parameters) ? item.parameters : []
    if (!isRecord(operation)) {
        return {}
    }
    const own = Array.isArray(operation.parameters) ? operation.parameters : []
    return { ...operation, parameters: [...shared, ...own] }
}

function resolveSchema({ document, schema }: { document: Record<string, unknown>, schema: unknown }): Record<string, unknown> {
    if (!isRecord(schema)) {
        return {}
    }
    const ref = schema.$ref
    if (typeof ref !== 'string' || !ref.startsWith('#/')) {
        return schema
    }
    const target = ref.slice(2).split('/').reduce<unknown>((current, segment) => (isRecord(current) ? current[segment] : undefined), document)
    return isRecord(target) ? target : {}
}

function isBlueprintMethod(method: string): boolean {
    return Object.values(BlueprintHttpMethod).some((candidate) => candidate === method.toUpperCase())
}

function toMethod(method: string): BlueprintHttpMethod {
    return Object.values(BlueprintHttpMethod).find((candidate) => candidate === method.toUpperCase()) ?? BlueprintHttpMethod.GET
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class OpenApiMappingError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'OpenApiMappingError'
    }
}

type MapParams = {
    document: unknown
    takenIdentifiers: string[]
}

type RawParameter = {
    name: string
    location: 'query' | 'path'
    required: boolean
    description: string
    schema: Record<string, unknown>
}

type MappedInput = {
    input: BlueprintInput
    location: 'query' | 'path' | 'body'
}

type InputOfParams = {
    document: Record<string, unknown>
    key: string
    schema: Record<string, unknown>
    required: boolean
    description: string
    location: 'query' | 'path' | 'body'
}

type ToOperationParams = {
    document: Record<string, unknown>
    raw: Record<string, unknown>
    key: string
    method: BlueprintHttpMethod
    path: string
    summary: string
    operationId: string
    description: string
}

export type OpenApiBlueprintMapping = {
    title: string
    description: string
    baseUrl: string
    identifier: string
    operations: BlueprintOperation[]
}
