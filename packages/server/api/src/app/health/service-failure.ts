import { isNil } from '@fema-ipaas/core-utils'
import { ServiceCheckFailure } from '@fema-ipaas/shared'

const MAX_REASON_LENGTH = 300

const UNREACHABLE_CODES = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET']
const TIMEOUT_CODES = ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNABORTED']
const AUTHENTICATION_CODES = ['EAUTH']
const AUTHENTICATION_NAMES = ['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'AccessDenied', 'InvalidToken', 'ExpiredToken', 'Forbidden']
const REJECTED_CODES = ['EENVELOPE']
const REJECTED_NAMES = ['NoSuchBucket', 'NotFound', 'NoSuchKey']
const TLS_PATTERN = /wrong version number|certificate|self[- ]signed|ssl|tls|handshake/i
const TIMEOUT_PATTERN = /time(d)?[- ]?out/i

function classify({ error, secrets = [] }: ClassifyParams): ClassifiedFailure {
    const details = readDetails({ error })
    return {
        failure: failureOf({ details }),
        reason: reasonOf({ details, secrets }),
    }
}

function failureOf({ details }: { details: ErrorDetails }): ServiceCheckFailure {
    if (TLS_PATTERN.test(details.message) && !UNREACHABLE_CODES.includes(details.code)) {
        return ServiceCheckFailure.TLS
    }
    if (UNREACHABLE_CODES.includes(details.code)) {
        return ServiceCheckFailure.UNREACHABLE
    }
    if (TIMEOUT_CODES.includes(details.code) || TIMEOUT_PATTERN.test(details.message)) {
        return ServiceCheckFailure.TIMEOUT
    }
    if (AUTHENTICATION_CODES.includes(details.code) || AUTHENTICATION_NAMES.includes(details.name) || details.status === 401 || details.status === 403) {
        return ServiceCheckFailure.AUTHENTICATION
    }
    if (REJECTED_CODES.includes(details.code) || REJECTED_NAMES.includes(details.name) || details.status === 404) {
        return ServiceCheckFailure.REJECTED
    }
    return ServiceCheckFailure.OTHER
}

function reasonOf({ details, secrets }: { details: ErrorDetails, secrets: string[] }): string {
    const masked = secrets
        .filter((secret) => secret.length > 0)
        .reduce((text, secret) => text.split(secret).join('***'), details.message)
    return masked.slice(0, MAX_REASON_LENGTH)
}

function readDetails({ error }: { error: unknown }): ErrorDetails {
    if (typeof error !== 'object' || isNil(error)) {
        return { code: '', name: '', message: String(error), status: null }
    }
    const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
    const name = 'name' in error && typeof error.name === 'string' ? error.name : ''
    const message = 'message' in error && typeof error.message === 'string' ? error.message : String(error)
    return { code, name, message, status: statusOf({ error }) }
}

function statusOf({ error }: { error: object }): number | null {
    if ('response' in error && typeof error.response === 'object' && !isNil(error.response) && 'status' in error.response && typeof error.response.status === 'number') {
        return error.response.status
    }
    if ('$metadata' in error && typeof error.$metadata === 'object' && !isNil(error.$metadata) && 'httpStatusCode' in error.$metadata && typeof error.$metadata.httpStatusCode === 'number') {
        return error.$metadata.httpStatusCode
    }
    return null
}

export const serviceFailure = { classify }

type ClassifyParams = {
    error: unknown
    secrets?: string[]
}

type ClassifiedFailure = {
    failure: ServiceCheckFailure
    reason: string
}

type ErrorDetails = {
    code: string
    name: string
    message: string
    status: number | null
}
