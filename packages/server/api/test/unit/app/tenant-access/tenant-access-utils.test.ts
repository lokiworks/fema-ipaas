import { LoginMethod, TenantModule, TenantRole } from '@fema-ipaas/shared'
import { tenantAccessUtils } from '../../../../src/app/tenant-access/tenant-access.utils'

describe('tenant access utils', () => {
    describe('home domains and external users', () => {
        it('prefers the allowed sign-in domains over the owner domain', () => {
            expect(tenantAccessUtils.homeDomains({ allowedAuthDomains: [' Acme.com ', 'acme.com', 'partner.io'], ownerEmail: 'boss@other.com' })).toEqual(['acme.com', 'partner.io'])
        })

        it('falls back to the owner domain when no allowed domains are set', () => {
            expect(tenantAccessUtils.homeDomains({ allowedAuthDomains: [], ownerEmail: 'Boss@Acme.com' })).toEqual(['acme.com'])
        })

        it('marks an address outside the home domains as external', () => {
            expect(tenantAccessUtils.isExternal({ email: 'someone@gmail.com', domains: ['acme.com'] })).toBe(true)
            expect(tenantAccessUtils.isExternal({ email: 'someone@ACME.com', domains: ['acme.com'] })).toBe(false)
        })

        it('never marks anyone external when the home domain is unknown', () => {
            expect(tenantAccessUtils.isExternal({ email: 'someone@gmail.com', domains: [] })).toBe(false)
        })
    })

    describe('module permissions', () => {
        it('always grants business integration to members', () => {
            expect(tenantAccessUtils.effectiveModules({ tenantRole: TenantRole.MEMBER, storedModules: [] })).toEqual([TenantModule.BUSINESS_INTEGRATION])
        })

        it('grants every module to admins regardless of what is stored', () => {
            expect(tenantAccessUtils.effectiveModules({ tenantRole: TenantRole.ADMIN, storedModules: [] })).toEqual(Object.values(TenantModule))
        })

        it('ignores platform admin stored on a member, the role is the source of truth', () => {
            const modules = tenantAccessUtils.effectiveModules({ tenantRole: TenantRole.MEMBER, storedModules: [TenantModule.PLATFORM_ADMIN, TenantModule.MCP_SERVICES] })
            expect(modules).toEqual([TenantModule.BUSINESS_INTEGRATION, TenantModule.MCP_SERVICES])
        })

        it('keeps only assignable modules', () => {
            expect(tenantAccessUtils.assignableModules([TenantModule.BUSINESS_INTEGRATION, TenantModule.CONNECTOR_DEVELOPMENT, 'UNKNOWN'])).toEqual([TenantModule.CONNECTOR_DEVELOPMENT])
        })

        it('answers module checks', () => {
            expect(tenantAccessUtils.hasModule({ tenantRole: TenantRole.OPERATOR, storedModules: [TenantModule.CONNECTOR_DEVELOPMENT], module: TenantModule.CONNECTOR_DEVELOPMENT })).toBe(true)
            expect(tenantAccessUtils.hasModule({ tenantRole: TenantRole.OPERATOR, storedModules: [], module: TenantModule.MCP_SERVICES })).toBe(false)
        })
    })

    describe('temporary passwords', () => {
        it('generates the requested length with at least one digit', () => {
            const password = tenantAccessUtils.generateTemporaryPassword(12)
            expect(password).toHaveLength(12)
            expect(password).toMatch(/[2-9]/)
            expect(password).not.toMatch(/[0O1lI]/)
        })

        it('never goes below the tenant minimum', () => {
            expect(tenantAccessUtils.temporaryPasswordLength(8)).toBe(12)
            expect(tenantAccessUtils.temporaryPasswordLength(20)).toBe(20)
        })

        it('does not repeat itself', () => {
            const passwords = new Set(Array.from({ length: 50 }, () => tenantAccessUtils.generateTemporaryPassword(12)))
            expect(passwords.size).toBe(50)
        })
    })

    describe('login methods', () => {
        it('lists every method in the fixed order and only email and password is available', () => {
            const methods = tenantAccessUtils.loginMethods({ emailAuthEnabled: true })
            expect(methods.map((method) => method.method)).toEqual([LoginMethod.EMAIL_PASSWORD, LoginMethod.OIDC, LoginMethod.SAML, LoginMethod.FEISHU, LoginMethod.WECOM, LoginMethod.DINGTALK])
            expect(methods.filter((method) => method.available).map((method) => method.method)).toEqual([LoginMethod.EMAIL_PASSWORD])
            expect(tenantAccessUtils.countEnabledLoginMethods(methods)).toBe(1)
        })

        it('counts zero enabled methods when email and password is turned off', () => {
            expect(tenantAccessUtils.countEnabledLoginMethods(tenantAccessUtils.loginMethods({ emailAuthEnabled: false }))).toBe(0)
        })
    })

    describe('email domain parsing', () => {
        it('returns null for malformed addresses', () => {
            expect(tenantAccessUtils.emailDomain('nobody')).toBeNull()
            expect(tenantAccessUtils.emailDomain('nobody@')).toBeNull()
        })
    })
})
