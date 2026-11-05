import { describe, expect, it } from 'vitest'
import { tenantDomainUtils } from '../../../../src/app/tenant-domain/tenant-domain.utils'

describe('tenant domain utils', () => {
    describe('verification record', () => {
        it('puts the TXT record under the verification label of the domain', () => {
            const record = tenantDomainUtils.buildVerificationRecord({ domain: 'acme.com', token: 'abc123' })

            expect(record).toEqual({
                type: 'TXT',
                name: '_fema-ipaas-verification.acme.com',
                value: 'fema-ipaas-verification=abc123',
            })
        })

        it('generates a different token every time', () => {
            const first = tenantDomainUtils.buildVerificationRecord({ domain: 'acme.com' })
            const second = tenantDomainUtils.buildVerificationRecord({ domain: 'acme.com' })

            expect(first.value).not.toBe(second.value)
        })

        it('matches a TXT answer even when the provider splits it into chunks', () => {
            const expected = tenantDomainUtils.buildVerificationRecord({ domain: 'acme.com', token: 'abc123' })

            expect(tenantDomainUtils.txtMatches({ answers: [['v=spf1'], ['fema-ipaas-verification=', 'abc123']], expected })).toBe(true)
            expect(tenantDomainUtils.txtMatches({ answers: [['fema-ipaas-verification=other']], expected })).toBe(false)
            expect(tenantDomainUtils.txtMatches({ answers: [], expected })).toBe(false)
        })
    })

    describe('email domain', () => {
        it('takes the part after the at sign in lower case', () => {
            expect(tenantDomainUtils.emailDomain({ email: 'Li@Acme.COM' })).toBe('acme.com')
        })

        it('has no domain for a malformed address', () => {
            expect(tenantDomainUtils.emailDomain({ email: 'no-at-sign' })).toBeNull()
            expect(tenantDomainUtils.emailDomain({ email: 'a@b@c' })).toBeNull()
            expect(tenantDomainUtils.emailDomain({ email: 'a@' })).toBeNull()
        })
    })

    describe('host handling', () => {
        it('drops the port and lowers the case', () => {
            expect(tenantDomainUtils.hostWithoutPort({ host: 'Acme.Example.com:8443' })).toBe('acme.example.com')
        })

        it('reads the tenant slug from a subdomain of the base domain', () => {
            expect(tenantDomainUtils.subdomainSlug({ host: 'acme.ipaas.example.com:3000', baseDomain: 'ipaas.example.com' })).toBe('acme')
        })

        it('offers no slug for the base domain itself, deeper subdomains or other domains', () => {
            expect(tenantDomainUtils.subdomainSlug({ host: 'ipaas.example.com', baseDomain: 'ipaas.example.com' })).toBeNull()
            expect(tenantDomainUtils.subdomainSlug({ host: 'a.b.ipaas.example.com', baseDomain: 'ipaas.example.com' })).toBeNull()
            expect(tenantDomainUtils.subdomainSlug({ host: 'acme.other.com', baseDomain: 'ipaas.example.com' })).toBeNull()
        })

        it('offers no slug when the base domain is not configured', () => {
            expect(tenantDomainUtils.subdomainSlug({ host: 'acme.ipaas.example.com', baseDomain: undefined })).toBeNull()
            expect(tenantDomainUtils.subdomainSlug({ host: 'acme.ipaas.example.com', baseDomain: '  ' })).toBeNull()
        })

        it('reads the host of a url', () => {
            expect(tenantDomainUtils.hostOfUrl({ url: 'https://IPaaS.example.com:8443/app' })).toBe('ipaas.example.com')
            expect(tenantDomainUtils.hostOfUrl({ url: 'not a url' })).toBeNull()
        })
    })
})
