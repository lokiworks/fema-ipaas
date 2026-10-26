import { blockedUntilMarker, isNil } from '@fema-ipaas/core-utils'

function decide({ classification, writeSafety, errorCode, message, firstAttemptAt, now, dedupeWindowSeconds }: DecideParams): RetryDecision {
    if (classification === 'READ' || classification === 'SEARCH') {
        return { allowed: true, reason: 'READ_ONLY' }
    }
    if (writeSafety === 'IDEMPOTENT') {
        if (!isNil(dedupeWindowSeconds) && (!Number.isFinite(firstAttemptAt) || now - firstAttemptAt >= dedupeWindowSeconds * 1000)) {
            return { allowed: false, reason: 'DEDUPE_WINDOW_PASSED' }
        }
        return { allowed: true, reason: 'IDEMPOTENT' }
    }
    if (writeSafety === 'LOOKUP_BEFORE_WRITE') {
        return { allowed: true, reason: 'LOOKUP_BEFORE_WRITE' }
    }
    const status = httpStatusOf(errorCode)
    if (!isNil(blockedUntilMarker.parse(message)) || !isNil(status) && NOT_APPLIED_STATUSES.includes(status)) {
        return { allowed: true, reason: 'NOT_APPLIED' }
    }
    return { allowed: false, reason: 'UNSAFE_OUTCOME_UNKNOWN' }
}

function httpStatusOf(errorCode: string | null | undefined): number | null {
    if (!errorCode?.startsWith('HTTP_')) {
        return null
    }
    const status = Number(errorCode.slice('HTTP_'.length))
    return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null
}

function isAuthorizationHttpStatus(errorCode: string | null | undefined): boolean {
    const status = httpStatusOf(errorCode)
    return !isNil(status) && AUTHORIZATION_STATUSES.includes(status)
}

function isRejectedByTargetHttpStatus(errorCode: string | null | undefined): boolean {
    const status = httpStatusOf(errorCode)
    return !isNil(status) && status >= 400 && status < 500 && !TRANSIENT_STATUSES.includes(status) && !AUTHORIZATION_STATUSES.includes(status)
}

function isTransientHttpStatus(errorCode: string | null | undefined): boolean {
    const status = httpStatusOf(errorCode)
    return !isNil(status) && TRANSIENT_STATUSES.includes(status)
}

const AUTHORIZATION_STATUSES = [401, 403]
const TRANSIENT_STATUSES = [429, 502, 503, 504, 529]
const NOT_APPLIED_STATUSES = [400, 401, 403, 404, 409, 422, 429]

export const retrySafety = { decide, httpStatusOf, isAuthorizationHttpStatus, isRejectedByTargetHttpStatus, isTransientHttpStatus }

export type RetryDecision =
    | { allowed: true, reason: 'READ_ONLY' | 'IDEMPOTENT' | 'LOOKUP_BEFORE_WRITE' | 'NOT_APPLIED' }
    | { allowed: false, reason: 'UNSAFE_OUTCOME_UNKNOWN' | 'DEDUPE_WINDOW_PASSED' }

export type RetryWriteSafety = 'IDEMPOTENT' | 'LOOKUP_BEFORE_WRITE' | 'UNSAFE'

type DecideParams = {
    classification?: 'READ' | 'SEARCH' | 'WRITE' | 'DESTRUCTIVE'
    writeSafety?: RetryWriteSafety
    errorCode?: string | null
    message?: string | null
    firstAttemptAt: number
    now: number
    dedupeWindowSeconds?: number
}
