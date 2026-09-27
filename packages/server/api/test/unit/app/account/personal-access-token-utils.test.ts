import { PersonalAccessTokenExpiry } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { personalAccessTokenUtils } from '../../../../src/app/account/personal-access-token-utils'

describe('personalAccessTokenUtils', () => {
    it('generates pat_ followed by 32 alphanumeric characters', () => {
        const token = personalAccessTokenUtils.generate()
        expect(token).toMatch(/^pat_[A-Za-z0-9]{32}$/)
        expect(personalAccessTokenUtils.isPersonalAccessToken(token)).toBe(true)
        expect(personalAccessTokenUtils.generate()).not.toBe(token)
    })

    it('rejects values that only look like tokens', () => {
        expect(personalAccessTokenUtils.isPersonalAccessToken('pat_short')).toBe(false)
        expect(personalAccessTokenUtils.isPersonalAccessToken(`pat_${'a'.repeat(31)}!`)).toBe(false)
        expect(personalAccessTokenUtils.isPersonalAccessToken(`jwt.${'a'.repeat(32)}`)).toBe(false)
    })

    it('stores only a hash and matches the original value against it', () => {
        const token = personalAccessTokenUtils.generate()
        const tokenHash = personalAccessTokenUtils.hash(token)
        expect(tokenHash).not.toContain(token)
        expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
        expect(personalAccessTokenUtils.matches({ value: token, tokenHash })).toBe(true)
        expect(personalAccessTokenUtils.matches({ value: personalAccessTokenUtils.generate(), tokenHash })).toBe(false)
        expect(personalAccessTokenUtils.hint(token)).toBe(token.slice(-4))
    })

    it('computes the expiry for each option', () => {
        const now = new Date('2026-01-01T00:00:00.000Z')
        expect(personalAccessTokenUtils.expiresAt({ expiry: PersonalAccessTokenExpiry.DAYS_30, now })).toBe('2026-01-31T00:00:00.000Z')
        expect(personalAccessTokenUtils.expiresAt({ expiry: PersonalAccessTokenExpiry.DAYS_90, now })).toBe('2026-04-01T00:00:00.000Z')
        expect(personalAccessTokenUtils.expiresAt({ expiry: PersonalAccessTokenExpiry.DAYS_365, now })).toBe('2027-01-01T00:00:00.000Z')
        expect(personalAccessTokenUtils.expiresAt({ expiry: PersonalAccessTokenExpiry.NEVER, now })).toBeNull()
    })

    it('treats tokens without an expiry as valid and past expiries as expired', () => {
        const now = new Date('2026-06-01T00:00:00.000Z')
        expect(personalAccessTokenUtils.isExpired({ expiresAt: null, now })).toBe(false)
        expect(personalAccessTokenUtils.isExpired({ expiresAt: '2026-05-31T23:59:59.000Z', now })).toBe(true)
        expect(personalAccessTokenUtils.isExpired({ expiresAt: '2026-06-02T00:00:00.000Z', now })).toBe(false)
    })

    it('throttles last-used writes', () => {
        const now = new Date('2026-06-01T00:10:00.000Z')
        expect(personalAccessTokenUtils.shouldTouchLastUsed({ lastUsedAt: null, now })).toBe(true)
        expect(personalAccessTokenUtils.shouldTouchLastUsed({ lastUsedAt: '2026-06-01T00:08:00.000Z', now })).toBe(false)
        expect(personalAccessTokenUtils.shouldTouchLastUsed({ lastUsedAt: '2026-06-01T00:04:00.000Z', now })).toBe(true)
    })
})
