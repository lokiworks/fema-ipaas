import { describe, expect, it } from 'vitest'
import { totp } from '../../../../src/app/authentication/mfa/totp'

const RFC_SECRET = totp.base32Encode({ bytes: Buffer.from('12345678901234567890', 'ascii') })

describe('totp', () => {
    it('encodes the RFC 6238 test secret', () => {
        expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
        expect(totp.base32Decode({ value: RFC_SECRET }).toString('ascii')).toBe('12345678901234567890')
    })

    it.each([
        [59, '287082'],
        [1111111109, '081804'],
        [1111111111, '050471'],
        [1234567890, '005924'],
        [2000000000, '279037'],
        [20000000000, '353130'],
    ])('matches the RFC 6238 vector at t=%i', (seconds, expected) => {
        expect(totp.codeAtStep({ secret: RFC_SECRET, step: totp.stepAt({ nowMs: seconds * 1000 }) })).toBe(expected)
    })

    it('accepts the previous, current and next window and nothing further', () => {
        const nowMs = 1_800_000_015_000
        const step = totp.stepAt({ nowMs })
        const at = (offset: number) => totp.codeAtStep({ secret: RFC_SECRET, step: step + offset })
        expect(totp.matchStep({ secret: RFC_SECRET, code: at(0), nowMs })).toBe(step)
        expect(totp.matchStep({ secret: RFC_SECRET, code: at(-1), nowMs })).toBe(step - 1)
        expect(totp.matchStep({ secret: RFC_SECRET, code: at(1), nowMs })).toBe(step + 1)
        expect(totp.matchStep({ secret: RFC_SECRET, code: at(-2), nowMs })).toBeNull()
        expect(totp.matchStep({ secret: RFC_SECRET, code: at(2), nowMs })).toBeNull()
    })

    it('rejects codes that are not six digits', () => {
        expect(totp.matchStep({ secret: RFC_SECRET, code: '12345', nowMs: Date.now() })).toBeNull()
        expect(totp.matchStep({ secret: RFC_SECRET, code: 'abcdef', nowMs: Date.now() })).toBeNull()
    })

    it('generates a 160 bit secret that decodes back to 20 bytes', () => {
        const secret = totp.generateSecret()
        expect(secret).toMatch(/^[A-Z2-7]{32}$/u)
        expect(totp.base32Decode({ value: secret })).toHaveLength(20)
    })

    it('builds an otpauth link authenticator apps understand', () => {
        const url = new URL(totp.buildOtpauthUrl({ issuer: 'Acme Corp', account: 'ada@example.com', secret: RFC_SECRET }))
        expect(url.protocol).toBe('otpauth:')
        expect(url.host).toBe('totp')
        expect(decodeURIComponent(url.pathname)).toBe('/Acme Corp:ada@example.com')
        expect(url.searchParams.get('secret')).toBe(RFC_SECRET)
        expect(url.searchParams.get('issuer')).toBe('Acme Corp')
        expect(url.searchParams.get('digits')).toBe('6')
        expect(url.searchParams.get('period')).toBe('30')
    })
})
