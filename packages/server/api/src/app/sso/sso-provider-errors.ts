import { isNil } from '@fema-ipaas/core-utils'
import { SsoLoginErrorCode } from '@fema-ipaas/shared'
import { isAxiosError } from 'axios'
import { SsoLoginError } from './sso-errors'

function map({ error, provider, step }: MapParams): SsoLoginError {
    if (error instanceof SsoLoginError) {
        return error
    }
    if (!isAxiosError(error) || isNil(error.response)) {
        const reason = isAxiosError(error) ? error.message : 'unknown error'
        return new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_UNREACHABLE, detail: `${provider} ${step} request failed: ${reason}` })
    }
    const body: unknown = error.response.data
    const description = describe(body)
    const clientProblem = error.response.status === 401 || (isRecord(body) && CLIENT_PROBLEM_MARKERS.some((marker) => String(body['code'] ?? body['error'] ?? '').toLowerCase().includes(marker)))
    return new SsoLoginError({
        code: clientProblem ? SsoLoginErrorCode.CLIENT_REJECTED : SsoLoginErrorCode.CODE_REJECTED,
        detail: `${provider} rejected the ${step} request (HTTP ${error.response.status}${description.length > 0 ? `, ${description}` : ''})`,
    })
}

function rejectBody({ provider, step, errcode, message, clientCodes }: RejectBodyParams): SsoLoginError {
    return new SsoLoginError({
        code: clientCodes.includes(errcode) ? SsoLoginErrorCode.CLIENT_REJECTED : SsoLoginErrorCode.CODE_REJECTED,
        detail: `${provider} rejected the ${step} request (${errcode}${isNil(message) || message.length === 0 ? '' : `, ${message}`})`,
    })
}

function describe(body: unknown): string {
    if (!isRecord(body)) {
        return ''
    }
    const candidates = [body['error_description'], body['message'], body['errmsg'], body['msg'], body['error']]
    const first = candidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0)
    return typeof first === 'string' ? first : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const CLIENT_PROBLEM_MARKERS = ['invalid_client', 'invalidclient', 'unauthorized']

export const ssoProviderErrors = {
    map,
    rejectBody,
}

type MapParams = {
    error: unknown
    provider: string
    step: string
}

type RejectBodyParams = {
    provider: string
    step: string
    errcode: number
    message: string | undefined
    clientCodes: number[]
}
