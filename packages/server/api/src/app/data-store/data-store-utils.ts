import { isNil } from '@fema-ipaas/core-utils'
import { DATA_STORE_KEY_PREFIX } from '@fema-ipaas/shared'
import { QueryFailedError } from 'typeorm'

function parseEngineKey(fullKey: string): EngineKeyTarget {
    if (!fullKey.startsWith(DATA_STORE_KEY_PREFIX)) {
        return { type: 'implicit' }
    }
    const rest = fullKey.slice(DATA_STORE_KEY_PREFIX.length)
    const separator = rest.indexOf('/')
    if (separator <= 0 || separator === rest.length - 1) {
        return { type: 'invalid' }
    }
    return {
        type: 'named',
        storeName: rest.slice(0, separator),
        key: rest.slice(separator + 1),
    }
}

function computeExpiresAt({ now, ttlDays }: { now: Date, ttlDays: number }): Date {
    return new Date(now.getTime() + ttlDays * DAY_IN_MS)
}

function isExpired({ expiresAt, now }: { expiresAt: string | Date | null | undefined, now: Date }): boolean {
    if (isNil(expiresAt)) {
        return false
    }
    return new Date(expiresAt).getTime() <= now.getTime()
}

function valueLength(value: unknown): number {
    if (typeof value === 'string') {
        return value.length
    }
    return JSON.stringify(value ?? null).length
}

function escapeLikePattern(search: string): string {
    return search.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
        return false
    }
    const driverError: unknown = error.driverError
    return typeof driverError === 'object' && driverError !== null && 'code' in driverError && driverError.code === POSTGRES_UNIQUE_VIOLATION
}

const DAY_IN_MS = 24 * 60 * 60 * 1000
const POSTGRES_UNIQUE_VIOLATION = '23505'

export const dataStoreUtils = {
    parseEngineKey,
    computeExpiresAt,
    isExpired,
    valueLength,
    escapeLikePattern,
    isUniqueViolation,
}

export type NamedStoreKey = {
    type: 'named'
    storeName: string
    key: string
}

export type EngineKeyTarget = { type: 'implicit' } | { type: 'invalid' } | NamedStoreKey
