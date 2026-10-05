import { SsoLoginErrorCode, TenantRole } from '@fema-ipaas/shared'
import { SsoLoginError } from '../../../../src/app/sso/sso-errors'
import { ssoProfile } from '../../../../src/app/sso/sso-profile'

describe('sso profile', () => {
    describe('reading claims', () => {
        it('lowercases the email and reads the verified flag', () => {
            const profile = ssoProfile.fromClaims({ claims: { sub: 'u1', email: ' Alice@Acme.TEST ', email_verified: true, name: 'Alice' }, emailClaim: 'email', groupsClaim: null })
            expect(profile.email).toBe('alice@acme.test')
            expect(profile.emailVerified).toBe(true)
            expect(profile.fullName).toBe('Alice')
        })

        it('treats a string "true" as verified and anything else as not verified', () => {
            expect(ssoProfile.fromClaims({ claims: { sub: 'u1', email: 'a@b.c', email_verified: 'true' }, emailClaim: 'email', groupsClaim: null }).emailVerified).toBe(true)
            expect(ssoProfile.fromClaims({ claims: { sub: 'u1', email: 'a@b.c', email_verified: 'yes' }, emailClaim: 'email', groupsClaim: null }).emailVerified).toBe(false)
            expect(ssoProfile.fromClaims({ claims: { sub: 'u1', email: 'a@b.c' }, emailClaim: 'email', groupsClaim: null }).emailVerified).toBe(false)
        })

        it('reads the email from another claim', () => {
            const profile = ssoProfile.fromClaims({ claims: { sub: 'u1', preferred_username: 'bob@acme.test' }, emailClaim: 'preferred_username', groupsClaim: null })
            expect(profile.email).toBe('bob@acme.test')
        })

        it('reads groups from nested paths, arrays and comma separated strings', () => {
            expect(ssoProfile.claimStrings({ claims: { realm_access: { roles: ['a', 'b'] } }, path: 'realm_access.roles' })).toEqual(['a', 'b'])
            expect(ssoProfile.claimStrings({ claims: { groups: 'a, b ,c' }, path: 'groups' })).toEqual(['a', 'b', 'c'])
            expect(ssoProfile.claimStrings({ claims: { groups: ['a', 7, 'b'] }, path: 'groups' })).toEqual(['a', 'b'])
            expect(ssoProfile.claimStrings({ claims: {}, path: 'groups' })).toEqual([])
        })

        it('prefers a literal claim name that contains dots', () => {
            expect(ssoProfile.claimStrings({ claims: { 'https://acme.test/groups': ['x'] }, path: 'https://acme.test/groups' })).toEqual(['x'])
        })

        it('rejects a token with no subject', () => {
            expect(() => ssoProfile.fromClaims({ claims: { email: 'a@b.c' }, emailClaim: 'email', groupsClaim: null })).toThrow(SsoLoginError)
        })
    })

    describe('judging a profile', () => {
        const profile = ssoProfile.fromClaims({ claims: { sub: 'u1', email: 'a@acme.test', email_verified: false }, emailClaim: 'email', groupsClaim: null })

        it('rejects an unverified email when verification is required', () => {
            expect(() => ssoProfile.assertUsable({ profile, requireVerifiedEmail: true })).toThrow(expect.objectContaining({ code: SsoLoginErrorCode.EMAIL_NOT_VERIFIED }))
            expect(() => ssoProfile.assertUsable({ profile, requireVerifiedEmail: false })).not.toThrow()
        })

        it('rejects a profile without an address', () => {
            const empty = ssoProfile.fromClaims({ claims: { sub: 'u1' }, emailClaim: 'email', groupsClaim: null })
            expect(() => ssoProfile.assertUsable({ profile: empty, requireVerifiedEmail: false })).toThrow(expect.objectContaining({ code: SsoLoginErrorCode.EMAIL_MISSING }))
        })

        it('accepts any domain when the allow list is empty and enforces it otherwise', () => {
            expect(() => ssoProfile.assertDomainListed({ email: 'a@x.test', allowedDomains: [] })).not.toThrow()
            expect(() => ssoProfile.assertDomainListed({ email: 'a@acme.test', allowedDomains: [' ACME.test '] })).not.toThrow()
            expect(() => ssoProfile.assertDomainListed({ email: 'a@evil.test', allowedDomains: ['acme.test'] })).toThrow(expect.objectContaining({ code: SsoLoginErrorCode.DOMAIN_NOT_ALLOWED }))
            expect(() => ssoProfile.assertDomainListed({ email: 'a@sub.acme.test', allowedDomains: ['acme.test'] })).toThrow(expect.objectContaining({ code: SsoLoginErrorCode.DOMAIN_NOT_ALLOWED }))
        })
    })

    describe('mapping roles', () => {
        const roleMapping = {
            rules: [
                { value: 'ops', role: TenantRole.OPERATOR },
                { value: 'admins', role: TenantRole.ADMIN },
            ],
        }

        it('uses the default role when nothing matches or no mapping is set', () => {
            expect(ssoProfile.resolveRole({ groups: ['staff'], roleMapping, defaultRole: TenantRole.MEMBER })).toBe(TenantRole.MEMBER)
            expect(ssoProfile.resolveRole({ groups: ['admins'], roleMapping: null, defaultRole: TenantRole.MEMBER })).toBe(TenantRole.MEMBER)
        })

        it('picks the most privileged match regardless of rule order', () => {
            expect(ssoProfile.resolveRole({ groups: ['ops', 'admins'], roleMapping, defaultRole: TenantRole.MEMBER })).toBe(TenantRole.ADMIN)
            expect(ssoProfile.resolveRole({ groups: ['ops'], roleMapping, defaultRole: TenantRole.MEMBER })).toBe(TenantRole.OPERATOR)
        })
    })
})
