import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { federationSignature } from '../../../../src/app/federation/federation-signature'

describe('federation signature', () => {
    const secret = 'a-shared-secret-with-enough-length'
    const rawBody = JSON.stringify({ id: 'evt-1', type: 'MEMBER_REMOVED', issuer: 'https://iam.test', externalTenantId: 't1', subject: 'm1', occurredAt: '2026-11-05T00:00:00Z' })

    it('produces the sha256=<hex> form over the raw body', () => {
        const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
        expect(federationSignature.sign({ rawBody, secret })).toBe(expected)
    })

    it('accepts the signature of the exact bytes received', () => {
        const header = federationSignature.sign({ rawBody, secret })
        expect(federationSignature.verify({ rawBody, header, secret })).toBe(true)
    })

    it('rejects a body that was changed after signing', () => {
        const header = federationSignature.sign({ rawBody, secret })
        expect(federationSignature.verify({ rawBody: rawBody.replace('m1', 'm2'), header, secret })).toBe(false)
    })

    it('rejects a different secret', () => {
        const header = federationSignature.sign({ rawBody, secret })
        expect(federationSignature.verify({ rawBody, header, secret: 'another-secret-another-secret' })).toBe(false)
    })

    it('rejects a missing header, a wrong prefix and malformed hex', () => {
        expect(federationSignature.verify({ rawBody, header: undefined, secret })).toBe(false)
        expect(federationSignature.verify({ rawBody, header: 'sha1=abcd', secret })).toBe(false)
        expect(federationSignature.verify({ rawBody, header: 'sha256=zz', secret })).toBe(false)
        expect(federationSignature.verify({ rawBody, header: 'sha256=', secret })).toBe(false)
    })

    it('rejects a truncated signature without throwing', () => {
        const header = federationSignature.sign({ rawBody, secret }).slice(0, 40)
        expect(federationSignature.verify({ rawBody, header, secret })).toBe(false)
    })
})
