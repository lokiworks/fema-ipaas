import { isDomainAllowed } from '../../../../src/app/authentication/authentication-utils'

describe('allowed sign-up domains', () => {
    it('lets anyone in while the tenant does not enforce a list', () => {
        expect(isDomainAllowed({ email: 'someone@anywhere.com', enforce: false, allowedDomains: ['acme.com'] })).toBe(true)
    })

    it('accepts an address on the list', () => {
        expect(isDomainAllowed({ email: 'someone@acme.com', enforce: true, allowedDomains: ['acme.com'] })).toBe(true)
    })

    it('rejects an address that is not on the list', () => {
        expect(isDomainAllowed({ email: 'someone@evil.com', enforce: true, allowedDomains: ['acme.com'] })).toBe(false)
    })

    it('rejects everyone when enforcement is on and the list is empty', () => {
        expect(isDomainAllowed({ email: 'someone@acme.com', enforce: true, allowedDomains: [] })).toBe(false)
    })

    it('ignores case and stray whitespace on both sides', () => {
        expect(isDomainAllowed({ email: '  Someone@ACME.com ', enforce: true, allowedDomains: [' Acme.com '] })).toBe(true)
    })

    it('does not treat a lookalike subdomain as a match', () => {
        expect(isDomainAllowed({ email: 'someone@acme.com.evil.com', enforce: true, allowedDomains: ['acme.com'] })).toBe(false)
    })

    it('rejects a malformed address rather than reading it as allowed', () => {
        expect(isDomainAllowed({ email: 'not-an-email', enforce: true, allowedDomains: ['acme.com'] })).toBe(false)
        expect(isDomainAllowed({ email: 'someone@', enforce: true, allowedDomains: ['acme.com'] })).toBe(false)
    })
})
