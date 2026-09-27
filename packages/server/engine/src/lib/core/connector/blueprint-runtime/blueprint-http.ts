import { createHash, createHmac, randomUUID } from 'node:crypto'
import { BlueprintBodyType, BlueprintCredentialLocation, BlueprintSigningPlugin, blueprintStatus, BlueprintStatusConfig, BuiltRequest, isNil, StatusOutcome } from '@fema-ipaas/core-utils'

export const blueprintHttp = {
    async execute({ request, credential, plugin, status, timeoutSeconds, followRedirect }: ExecuteParams): Promise<BlueprintHttpResult> {
        const attempts = Array.from({ length: MAX_ATTEMPTS }, (_value, index) => index)
        const started = Date.now()
        const log: string[] = []
        let last: AttemptResult | null = null
        for (const attempt of attempts) {
            if (attempt > 0) {
                await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
            }
            last = await attemptOnce({ request, credential, plugin, status, timeoutSeconds, followRedirect, log })
            if (!last.outcome.retry) {
                break
            }
            log.push(`retrying after ${last.outcome.code}`)
        }
        const result = last ?? await attemptOnce({ request, credential, plugin, status, timeoutSeconds, followRedirect, log })
        return { ...result, durationMs: Date.now() - started, log }
    },
    async send({ request, credential, plugin, timeoutSeconds, followRedirect }: SendParams): Promise<BlueprintRawResponse> {
        const log: string[] = []
        const prepared = await prepare({ request, credential, plugin })
        return perform({ prepared, timeoutSeconds, followRedirect, log })
    },
    describe(request: PreparedRequest): string {
        const headers = Object.entries(request.headers).map(([key, value]) => `${key}: ${maskHeader({ key, value })}`)
        const body = isNil(request.body) ? [] : ['', typeof request.body === 'string' ? request.body : new URLSearchParams(request.body).toString()]
        return [`${request.method} ${urlWithQuery(request)}`, ...headers, ...body].join('\n')
    },
}

async function attemptOnce({ request, credential, plugin, status, timeoutSeconds, followRedirect, log }: AttemptParams): Promise<AttemptResult> {
    const prepared = await prepare({ request, credential, plugin })
    const response = await perform({ prepared, timeoutSeconds, followRedirect, log })
    const outcome = blueprintStatus.evaluate({ config: status, httpStatus: response.status, headers: response.headers, body: response.body })
    return { ...response, outcome, prepared }
}

async function prepare({ request, credential, plugin }: PrepareParams): Promise<PreparedRequest> {
    const withCredential = applyCredential({ request, credential })
    if (isNil(plugin) || !plugin.enabled) {
        return withCredential
    }
    const signer = compilePlugin(plugin.code)
    const signed: unknown = await signer(withCredential, { input: credential.authInput, data: credential.authData })
    return normalizeSigned({ signed, fallback: withCredential })
}

async function perform({ prepared, timeoutSeconds, followRedirect, log }: PerformParams): Promise<BlueprintRawResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutSeconds) * 1000)
    const url = urlWithQuery(prepared)
    const started = Date.now()
    log.push(`→ ${prepared.method} ${url}`)
    try {
        const response = await fetch(url, {
            method: prepared.method,
            headers: prepared.headers,
            body: bodyOf(prepared),
            redirect: followRedirect ? 'follow' : 'manual',
            signal: controller.signal,
        })
        const text = await response.text()
        const headers = headersOf(response.headers)
        log.push(`← ${response.status} (${Date.now() - started} ms)`)
        return { status: response.status, headers, body: parseBody(text), requestText: blueprintHttp.describe(prepared) }
    }
    catch (error) {
        const aborted = controller.signal.aborted
        log.push(aborted ? `request timed out after ${timeoutSeconds} s` : `request failed: ${error instanceof Error ? error.message : String(error)}`)
        throw new BlueprintRequestError(aborted ? `The request timed out after ${timeoutSeconds} seconds` : `The request could not be sent: ${error instanceof Error ? error.message : String(error)}`)
    }
    finally {
        clearTimeout(timer)
    }
}

function applyCredential({ request, credential }: { request: BuiltRequest, credential: BlueprintCredential }): PreparedRequest {
    const base: PreparedRequest = {
        method: request.method,
        url: request.url,
        headers: { ...defaultHeaders(request), ...request.headers },
        query: { ...request.query },
        body: request.bodyType === BlueprintBodyType.JSON ? request.body : request.bodyType === BlueprintBodyType.NONE ? null : request.form,
    }
    if (isNil(credential.apply)) {
        return base
    }
    const { location, name, value } = credential.apply
    if (location === BlueprintCredentialLocation.QUERY) {
        return { ...base, query: { ...base.query, [name]: value } }
    }
    return { ...base, headers: { ...base.headers, [name]: value } }
}

function headersOf(headers: Headers): Record<string, string> {
    const collected: Record<string, string> = {}
    headers.forEach((value, key) => {
        collected[key] = value
    })
    return collected
}

function defaultHeaders(request: BuiltRequest): Record<string, string> {
    const hasContentType = Object.keys(request.headers).some((key) => key.toLowerCase() === 'content-type')
    if (hasContentType) {
        return {}
    }
    switch (request.bodyType) {
        case BlueprintBodyType.JSON:
            return { 'Content-Type': 'application/json' }
        case BlueprintBodyType.FORM_URLENCODED:
            return { 'Content-Type': 'application/x-www-form-urlencoded' }
        case BlueprintBodyType.FORM_DATA:
        case BlueprintBodyType.NONE:
            return {}
    }
}

function bodyOf(prepared: PreparedRequest): string | FormData | undefined {
    if (isNil(prepared.body) || prepared.method === 'GET') {
        return undefined
    }
    if (typeof prepared.body === 'string') {
        return prepared.body
    }
    const contentType = Object.entries(prepared.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1] ?? ''
    if (contentType.includes('x-www-form-urlencoded')) {
        return new URLSearchParams(prepared.body).toString()
    }
    const form = new FormData()
    Object.entries(prepared.body).forEach(([key, value]) => form.append(key, value))
    return form
}

function urlWithQuery(request: PreparedRequest): string {
    const entries = Object.entries(request.query)
    if (entries.length === 0) {
        return request.url
    }
    const url = new URL(request.url)
    entries.forEach(([key, value]) => url.searchParams.set(key, value))
    return url.toString()
}

function parseBody(text: string): unknown {
    if (text.length === 0) {
        return null
    }
    try {
        return JSON.parse(text)
    }
    catch {
        return text
    }
}

function compilePlugin(code: string): SigningFunction {
    const factory: unknown = new Function('crypto', 'Buffer', 'helpers', `${code}\nreturn typeof beforeRequest === 'function' ? beforeRequest : null;`)
    if (typeof factory !== 'function') {
        throw new BlueprintRequestError('The signing plugin could not be compiled')
    }
    const compiled: unknown = factory({ createHash, createHmac, randomUUID }, Buffer, { md5: (value: string) => createHash('md5').update(value).digest('hex'), sha256: (value: string) => createHash('sha256').update(value).digest('hex'), hmacSha256: ({ key, value }: { key: string, value: string }) => createHmac('sha256', key).update(value).digest('hex') })
    if (typeof compiled !== 'function') {
        throw new BlueprintRequestError('The signing plugin must define function beforeRequest(request, auth)')
    }
    return async (request, auth) => compiled(request, auth)
}

function normalizeSigned({ signed, fallback }: { signed: unknown, fallback: PreparedRequest }): PreparedRequest {
    if (!isRecord(signed)) {
        return fallback
    }
    return {
        method: typeof signed.method === 'string' ? signed.method : fallback.method,
        url: typeof signed.url === 'string' ? signed.url : fallback.url,
        headers: isRecord(signed.headers) ? stringRecord(signed.headers) : fallback.headers,
        query: isRecord(signed.query) ? stringRecord(signed.query) : fallback.query,
        body: typeof signed.body === 'string' || isNil(signed.body) ? signed.body ?? null : isRecord(signed.body) ? stringRecord(signed.body) : fallback.body,
    }
}

function stringRecord(value: Record<string, unknown>): Record<string, string> {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => !isNil(entry)).map(([key, entry]) => [key, typeof entry === 'string' ? entry : JSON.stringify(entry)]))
}

function maskHeader({ key, value }: { key: string, value: string }): string {
    const sensitive = /authorization|token|key|secret|signature|cookie/i.test(key)
    return sensitive && value.length > 0 ? '••••••' : value
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 500

export class BlueprintRequestError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'BlueprintRequestError'
    }
}

type SigningFunction = (request: PreparedRequest, auth: { input: Record<string, unknown>, data: Record<string, unknown> }) => Promise<unknown>

type PrepareParams = {
    request: BuiltRequest
    credential: BlueprintCredential
    plugin: BlueprintSigningPlugin | null
}

type PerformParams = {
    prepared: PreparedRequest
    timeoutSeconds: number
    followRedirect: boolean
    log: string[]
}

type SendParams = PrepareParams & {
    timeoutSeconds: number
    followRedirect: boolean
}

type ExecuteParams = SendParams & {
    status: BlueprintStatusConfig
}

type AttemptParams = ExecuteParams & {
    log: string[]
}

type AttemptResult = BlueprintRawResponse & {
    outcome: StatusOutcome
    prepared: PreparedRequest
}

export type BlueprintCredential = {
    authInput: Record<string, unknown>
    authData: Record<string, unknown>
    apply: { location: BlueprintCredentialLocation, name: string, value: string } | null
}

export type PreparedRequest = {
    method: string
    url: string
    headers: Record<string, string>
    query: Record<string, string>
    body: string | Record<string, string> | null
}

export type BlueprintRawResponse = {
    status: number
    headers: Record<string, string>
    body: unknown
    requestText: string
}

export type BlueprintHttpResult = AttemptResult & {
    durationMs: number
    log: string[]
}
