import { isNil } from '../utils'
import { BlueprintBodyType, BlueprintHttpMethod, BlueprintInput, BlueprintRequestConfig, BlueprintValueType } from './blueprint-definition'

export const blueprintTemplate = {
    readPath,
    renderText,
    renderJson,
    placeholders,
    jsonError,
    unknownInputRefs,
    pathParams,
    defaultRequest,
    resolveRequest,
    buildRequest,
    stringify,
}

function readPath({ source, path }: ReadPathParams): unknown {
    const segments = splitPath(path)
    return segments.reduce<unknown>((current, segment) => {
        if (current === null || current === undefined) {
            return undefined
        }
        if (Array.isArray(current)) {
            const index = Number(segment)
            return Number.isInteger(index) ? current[index] : undefined
        }
        if (typeof current === 'object') {
            return Object.entries(current).find(([key]) => key === segment)?.[1]
        }
        return undefined
    }, source)
}

function renderText({ template, vars }: RenderParams): string {
    return template.replace(PLACEHOLDER_REGEX, (_match, expression: string) => stringify(readPath({ source: vars, path: expression })))
}

function renderJson({ template, vars }: RenderParams): string {
    const state = { out: '', index: 0, inString: false, stringStart: -1 }
    while (state.index < template.length) {
        if (template.startsWith('{{', state.index)) {
            const end = template.indexOf('}}', state.index + 2)
            if (end === -1) {
                state.out += template.slice(state.index)
                break
            }
            const value = readPath({ source: vars, path: template.slice(state.index + 2, end) })
            if (!state.inString) {
                state.out += JSON.stringify(value === undefined ? null : value)
                state.index = end + 2
                continue
            }
            const wholeString = state.stringStart === state.index - 1 && template[end + 2] === '"'
            if (wholeString) {
                state.out = `${state.out.slice(0, -1)}${JSON.stringify(stringify(value))}`
                state.index = end + 3
                state.inString = false
                continue
            }
            state.out += JSON.stringify(stringify(value)).slice(1, -1)
            state.index = end + 2
            continue
        }
        const char = template[state.index]
        if (state.inString && char === '\\') {
            state.out += template.slice(state.index, state.index + 2)
            state.index += 2
            continue
        }
        if (char === '"') {
            state.inString = !state.inString
            state.stringStart = state.inString ? state.index : -1
        }
        state.out += char
        state.index += 1
    }
    return state.out
}

function placeholders(template: string): string[] {
    return [...template.matchAll(PLACEHOLDER_REGEX)].map((match) => match[1].trim())
}

function jsonError(template: string): boolean {
    const raw = template.trim()
    if (raw.length === 0) {
        return false
    }
    try {
        JSON.parse(raw.replace(PLACEHOLDER_REGEX, 'null'))
        return false
    }
    catch {
        return true
    }
}

function unknownInputRefs({ texts, inputKeys }: UnknownInputRefsParams): string[] {
    const refs = texts.flatMap((text) => [
        ...placeholders(text)
            .map((expression) => INPUT_REF_REGEX.exec(expression)?.[2])
            .filter((key): key is string => !isNil(key)),
        ...pathParams(text),
    ])
    return [...new Set(refs)].filter((key) => !inputKeys.includes(key))
}

function pathParams(path: string): string[] {
    return [...path.matchAll(PATH_PARAM_REGEX)].map((match) => match[1])
}

function defaultRequest({ method, path, inputs }: DefaultRequestParams): BlueprintRequestConfig {
    const inPath = pathParams(path)
    const noBody = method === BlueprintHttpMethod.GET || method === BlueprintHttpMethod.DELETE
    const rest = inputs.filter((input) => !inPath.includes(input.key))
    return {
        headers: noBody ? [] : [{ key: 'Content-Type', value: 'application/json' }],
        query: noBody ? rest.map((input) => ({ key: input.key, value: `{{input.${input.key}}}` })) : [],
        bodyType: noBody ? BlueprintBodyType.NONE : BlueprintBodyType.JSON,
        body: noBody ? '' : bodyTemplate(rest),
        form: [],
        timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
        followRedirect: true,
    }
}

function resolveRequest({ method, path, inputs, request }: ResolveRequestParams): BlueprintRequestConfig {
    return request ?? defaultRequest({ method, path, inputs })
}

function buildRequest({ baseUrl, method, path, request, vars, extraQuery }: BuildRequestParams): BuiltRequest {
    const renderedPath = renderPath({ path, vars })
    const query = {
        ...renderPairs({ pairs: request.query, vars }),
        ...(extraQuery ?? {}),
    }
    const headers = renderPairs({ pairs: request.headers, vars })
    const url = joinUrl({ baseUrl, path: renderedPath })
    switch (request.bodyType) {
        case BlueprintBodyType.JSON:
            return { method, url, headers, query, bodyType: request.bodyType, body: renderJson({ template: request.body.trim().length === 0 ? '{}' : request.body, vars }), form: {} }
        case BlueprintBodyType.FORM_DATA:
        case BlueprintBodyType.FORM_URLENCODED:
            return { method, url, headers, query, bodyType: request.bodyType, body: null, form: renderPairs({ pairs: request.form, vars }) }
        case BlueprintBodyType.NONE:
            return { method, url, headers, query, bodyType: request.bodyType, body: null, form: {} }
    }
}

function stringify(value: unknown): string {
    if (isNil(value)) {
        return ''
    }
    if (typeof value === 'string') {
        return value
    }
    if (typeof value === 'object') {
        return JSON.stringify(value)
    }
    return String(value)
}

function splitPath(path: string): string[] {
    const trimmed = path.trim().replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim()
    if (trimmed.length === 0) {
        return []
    }
    return trimmed
        .replace(/\[(\d+)\]/g, '.$1')
        .replace(/\[["']([^"'\]]+)["']\]/g, '.$1')
        .split('.')
        .filter((segment) => segment.length > 0)
}

function bodyTemplate(inputs: BlueprintInput[]): string {
    if (inputs.length === 0) {
        return '{}'
    }
    const lines = inputs.map((input) => {
        const bare = input.type !== BlueprintValueType.STRING
        return `  "${input.key}": ${bare ? `{{input.${input.key}}}` : `"{{input.${input.key}}}"`}`
    })
    return `{\n${lines.join(',\n')}\n}`
}

function renderPath({ path, vars }: { path: string, vars: Record<string, unknown> }): string {
    const withTemplates = path.replace(PLACEHOLDER_REGEX, (_match, expression: string) => encodeURIComponent(stringify(readPath({ source: vars, path: expression }))))
    return withTemplates.replace(PATH_PARAM_REGEX, (_match, key: string) => encodeURIComponent(stringify(readPath({ source: vars, path: `input.${key}` }))))
}

function renderPairs({ pairs, vars }: { pairs: BlueprintKeyValuePair[], vars: Record<string, unknown> }): Record<string, string> {
    return Object.fromEntries(pairs
        .filter((pair) => pair.key.trim().length > 0)
        .map((pair) => {
            const value = renderText({ template: pair.value, vars })
            const onlyPlaceholder = SINGLE_PLACEHOLDER_REGEX.test(pair.value.trim())
            return { key: pair.key.trim(), value, drop: onlyPlaceholder && value.length === 0 }
        })
        .filter((pair) => !pair.drop)
        .map((pair) => [pair.key, pair.value]))
}

function joinUrl({ baseUrl, path }: { baseUrl: string, path: string }): string {
    if (/^https?:\/\//i.test(path)) {
        return path
    }
    return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

const PLACEHOLDER_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g
const SINGLE_PLACEHOLDER_REGEX = /^\{\{\s*[^{}]+?\s*\}\}$/
const PATH_PARAM_REGEX = /(?<!\{)\{([A-Za-z_][A-Za-z0-9_]*)\}(?!\})/g
const INPUT_REF_REGEX = /^(input|settings)\.([A-Za-z_][A-Za-z0-9_]*)/
const DEFAULT_TIMEOUT_SECONDS = 30

type BlueprintKeyValuePair = {
    key: string
    value: string
}

type ReadPathParams = {
    source: unknown
    path: string
}

type RenderParams = {
    template: string
    vars: Record<string, unknown>
}

type UnknownInputRefsParams = {
    texts: string[]
    inputKeys: string[]
}

type DefaultRequestParams = {
    method: BlueprintHttpMethod
    path: string
    inputs: BlueprintInput[]
}

type ResolveRequestParams = DefaultRequestParams & {
    request: BlueprintRequestConfig | null
}

type BuildRequestParams = {
    baseUrl: string
    method: BlueprintHttpMethod
    path: string
    request: BlueprintRequestConfig
    vars: Record<string, unknown>
    extraQuery?: Record<string, string>
}

export type BuiltRequest = {
    method: BlueprintHttpMethod
    url: string
    headers: Record<string, string>
    query: Record<string, string>
    bodyType: BlueprintBodyType
    body: string | null
    form: Record<string, string>
}
