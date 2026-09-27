import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { PERSONAL_ACCESS_TOKEN_EXPIRY_DAYS, PERSONAL_ACCESS_TOKEN_PREFIX, PERSONAL_ACCESS_TOKEN_SECRET_LENGTH, PersonalAccessTokenExpiry } from '@fema-ipaas/shared'
import dayjs from 'dayjs'

function generate(): string {
    const secret = Array.from({ length: PERSONAL_ACCESS_TOKEN_SECRET_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
    return `${PERSONAL_ACCESS_TOKEN_PREFIX}${secret}`
}

function hash(value: string): string {
    return createHash('sha256').update(value).digest('hex')
}

function matches({ value, tokenHash }: { value: string, tokenHash: string }): boolean {
    const computed = Buffer.from(hash(value), 'hex')
    const stored = Buffer.from(tokenHash, 'hex')
    return computed.length === stored.length && timingSafeEqual(computed, stored)
}

function isPersonalAccessToken(value: string): boolean {
    return TOKEN_PATTERN.test(value)
}

function hint(value: string): string {
    return value.slice(-HINT_LENGTH)
}

function expiresAt({ expiry, now }: { expiry: PersonalAccessTokenExpiry, now: Date }): string | null {
    const days = PERSONAL_ACCESS_TOKEN_EXPIRY_DAYS[expiry]
    return isNil(days) ? null : dayjs(now).add(days, 'day').toISOString()
}

function isExpired({ expiresAt, now }: { expiresAt: string | Date | null | undefined, now: Date }): boolean {
    return !isNil(expiresAt) && dayjs(expiresAt).valueOf() <= now.getTime()
}

function shouldTouchLastUsed({ lastUsedAt, now }: { lastUsedAt: string | Date | null | undefined, now: Date }): boolean {
    return isNil(lastUsedAt) || now.getTime() - dayjs(lastUsedAt).valueOf() >= LAST_USED_THROTTLE_MS
}

export const personalAccessTokenUtils = {
    generate,
    hash,
    matches,
    isPersonalAccessToken,
    hint,
    expiresAt,
    isExpired,
    shouldTouchLastUsed,
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const TOKEN_PATTERN = new RegExp(`^${PERSONAL_ACCESS_TOKEN_PREFIX}[A-Za-z0-9]{${PERSONAL_ACCESS_TOKEN_SECRET_LENGTH}}$`)
const HINT_LENGTH = 4
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000
