import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../src/app/database/redis-connections', () => ({
    distributedStore: { put: vi.fn(), get: vi.fn() },
}))

const { sessionRevocationUtils } = await import('../../../../src/app/authentication/lib/session-revocation')

describe('sessionRevocationUtils', () => {
    it('keeps a revoked token only until the token itself expires', () => {
        expect(sessionRevocationUtils.remainingSeconds({ expiresAtSeconds: 1_000, nowMs: 400_000 })).toBe(600)
        expect(sessionRevocationUtils.remainingSeconds({ expiresAtSeconds: 1_000, nowMs: 1_200_000 })).toBeLessThanOrEqual(0)
    })

    it('stores a hash of the token, never the token itself', () => {
        const key = sessionRevocationUtils.keyOf('secret.jwt.value')
        expect(key.startsWith('revoked_session:v1:')).toBe(true)
        expect(key).not.toContain('secret.jwt.value')
        expect(sessionRevocationUtils.keyOf('secret.jwt.value')).toBe(key)
    })
})
