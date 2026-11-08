import { isNil } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'

async function call({ apiUrl, path, method, accessToken, body, query }: CallParams): Promise<FemaApiResult> {
    try {
        const response = await safeHttp.axios.request<unknown>({
            method,
            url: `${apiUrl.replace(/\/+$/, '')}${path}`,
            data: body,
            params: query,
            headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
            timeout: HTTP_TIMEOUT_MS,
            maxRedirects: 0,
            validateStatus: () => true,
        })
        const envelope = Envelope.read(response.data)
        return { kind: 'response', status: response.status, code: envelope.code, data: envelope.data, message: envelope.message }
    }
    catch (error) {
        return { kind: 'unreachable', detail: error instanceof Error ? error.message : 'unknown error' }
    }
}

function isNotFound(result: FemaApiResult): boolean {
    return result.kind === 'response' && (result.status === NOT_FOUND_STATUS || result.code === 'NOT_FOUND')
}

function isSuccess(result: FemaApiResult): boolean {
    return result.kind === 'response' && result.status >= 200 && result.status < 300 && result.code === 'SUCCESS'
}

function isUncertain(result: FemaApiResult): boolean {
    return result.kind === 'unreachable' || result.status >= SERVER_ERROR_STATUS || result.status === REQUEST_TIMEOUT_STATUS
}

function describe(result: FemaApiResult): string {
    if (result.kind === 'unreachable') {
        return result.detail
    }
    return `HTTP ${result.status}${isNil(result.code) ? '' : ` ${result.code}`}${isNil(result.message) ? '' : ` (${result.message})`}`
}

function enumCode(value: unknown): string | null {
    if (typeof value === 'string') {
        return value.toUpperCase()
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null
    }
    const record: Record<string, unknown> = { ...value }
    const code = record['code'] ?? record['value'] ?? record['name']
    return typeof code === 'string' ? code.toUpperCase() : null
}

const Envelope = {
    read(value: unknown): { code: string | null, data: unknown, message: string | null } {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return { code: null, data: null, message: null }
        }
        const record: Record<string, unknown> = { ...value }
        return {
            code: typeof record['code'] === 'string' ? record['code'] : null,
            data: record['data'] ?? null,
            message: typeof record['message'] === 'string' ? record['message'] : null,
        }
    },
}

const HTTP_TIMEOUT_MS = 10_000
const NOT_FOUND_STATUS = 404
const REQUEST_TIMEOUT_STATUS = 408
const SERVER_ERROR_STATUS = 500

export const femaApiClient = {
    call,
    isNotFound,
    isSuccess,
    isUncertain,
    describe,
    enumCode,
}

export type FemaApiResult =
    | { kind: 'response', status: number, code: string | null, data: unknown, message: string | null }
    | { kind: 'unreachable', detail: string }

type CallParams = {
    apiUrl: string
    path: string
    method: 'GET' | 'POST'
    accessToken: string
    body?: unknown
    query?: Record<string, string>
}
