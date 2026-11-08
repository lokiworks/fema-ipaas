import { SsoMatchBy, SsoProvider, SsoRegion, TenantRole } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { ssoSettingsView } from '../../../../src/app/sso/sso-settings-view'

const secret = { iv: 'iv', data: 'data' }

const common = {
    enabled: true,
    displayName: 'Login',
    allowedDomains: [],
    autoCreateUsers: false,
    defaultRole: TenantRole.MEMBER,
    roleMapping: null,
    defaultProject: null,
    verifiedAt: '2026-11-05T00:00:00.000Z',
    lastLoginAt: null,
}

const oidc = {
    ...common,
    issuer: 'https://iam.test',
    clientId: 'client',
    clientSecret: secret,
    scopes: 'openid',
    emailClaim: 'email',
    requireVerifiedEmail: false,
}

describe('sso settings view', () => {
    it('shows an OIDC configuration without matchBy as matched by email', () => {
        const view = ssoSettingsView.toOidcSettings(oidc)
        expect(view.matchBy).toBe(SsoMatchBy.EMAIL)
        expect(view.extraAuthParams).toEqual({})
        expect(view.sessionRecheckMinutes).toBeNull()
        expect(view.provisioned).toBe(false)
        expect(view).not.toHaveProperty('clientSecret')
    })

    it('shows the platform written fields of a provisioned configuration', () => {
        const view = ssoSettingsView.toOidcSettings({ ...oidc, matchBy: SsoMatchBy.SUBJECT, extraAuthParams: { tenant: 'acme' }, sessionRecheckMinutes: 30, provisioned: true, memberSubscription: { subscriptionId: 'sub-1', code: 'ipaas-members-x', plainSecret: secret, endpoint: 'https://ipaas.test/api/v1/federation/members/tenant-1', apiUrl: 'https://fema.test', connectionExternalId: 'fema-iam', projectId: 'project-1', createdAt: '2026-11-05T00:00:00.000Z' } })
        expect(view).toMatchObject({ matchBy: SsoMatchBy.SUBJECT, extraAuthParams: { tenant: 'acme' }, sessionRecheckMinutes: 30, provisioned: true })
        expect(JSON.stringify(view)).not.toContain('memberSubscription')
    })

    it('patches only the provider it was asked to patch', () => {
        const providers = { saml: null, oidc, feishu: { ...common, appId: 'a', appSecret: secret, region: SsoRegion.FEISHU, allowedEnterpriseKey: null } }
        const patched = ssoSettingsView.patchProvider({ providers, provider: SsoProvider.FEISHU, patch: { enabled: false } })
        expect(patched.feishu?.enabled).toBe(false)
        expect(patched.oidc?.enabled).toBe(true)
    })

    it('leaves the configuration alone when the provider is not configured', () => {
        const providers = { saml: null, oidc }
        expect(ssoSettingsView.patchProvider({ providers, provider: SsoProvider.WECOM, patch: { enabled: false } })).toEqual(providers)
    })

    it('reads the common part of every provider including the SAML 2.0 slot', () => {
        const providers = { saml: null, saml2: { ...common, idpMetadataXml: '', idpEntityId: 'e', idpSsoUrl: 'https://idp.test', idpCertificates: [], emailAttribute: 'mail', firstNameAttribute: null, lastNameAttribute: null, subjectSource: 'NAME_ID' as const, subjectAttribute: null, signAuthnRequests: false } }
        expect(ssoSettingsView.commonOf({ providers, provider: SsoProvider.SAML })?.displayName).toBe('Login')
        expect(ssoSettingsView.commonOf({ providers, provider: SsoProvider.OIDC })).toBeNull()
    })

    it('counts a method only when it is both enabled and verified', () => {
        expect(ssoSettingsView.hasVerifiedEnabled({ saml: null, oidc })).toBe(true)
        expect(ssoSettingsView.hasVerifiedEnabled({ saml: null, oidc: { ...oidc, verifiedAt: null } })).toBe(false)
        expect(ssoSettingsView.hasVerifiedEnabled({ saml: null, oidc: { ...oidc, enabled: false } })).toBe(false)
        expect(ssoSettingsView.hasVerifiedEnabled({ saml: null })).toBe(false)
    })

    it('counts WeCom, DingTalk and SAML 2.0 as sign-in methods', () => {
        const wecom = { ...common, corpId: 'c', agentId: 'a', secret }
        expect(ssoSettingsView.hasVerifiedEnabled({ saml: null, wecom })).toBe(true)
    })
})
