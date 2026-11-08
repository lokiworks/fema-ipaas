import { SsoMatchBy, SsoProvider, TenantRole } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { samlTestCredentials } from './saml-test-credentials'

const state = vi.hoisted(() => ({
    providers: {} as Record<string, unknown>,
    updates: [] as Array<Record<string, unknown>>,
    emailAuthEnabled: true,
}))

vi.mock('../../../../src/app/tenant/tenant.service', () => ({
    tenantRepo: () => ({
        update: async (_where: unknown, patch: Record<string, unknown>) => {
            state.updates.push(patch)
        },
    }),
    tenantService: () => ({
        getOneWithFederatedAuthOrThrow: async () => ({ id: 'tenant-1', emailAuthEnabled: state.emailAuthEnabled, federatedAuthProviders: state.providers }),
    }),
}))
vi.mock('../../../../src/app/database/redis-connections', () => ({
    distributedLock: () => ({ runExclusive: ({ fn }: { fn: () => Promise<unknown> }) => fn() }),
}))
vi.mock('../../../../src/app/helper/domain-helper', () => ({
    domainHelper: { getPublicApiUrl: async ({ path }: { path: string }) => `https://ipaas.test/api${path.startsWith('/') ? path : `/${path}`}` },
}))
vi.mock('../../../../src/app/helper/encryption', () => ({
    encryptUtils: {
        encryptString: async (value: string) => ({ iv: 'iv', data: `enc:${value}` }),
        decryptString: async (value: { data: string }) => value.data.replace('enc:', ''),
        isEncryptedWithCurrentKey: async () => true,
    },
}))
vi.mock('../../../../src/app/project/project-service', () => ({ projectService: () => ({ getOne: async () => null }) }))
vi.mock('../../../../src/app/sso/oidc-client', () => ({ oidcClient: { discover: vi.fn().mockResolvedValue({}) } }))
vi.mock('../../../../src/app/sso/platform-login-apps.service', () => ({
    platformLoginAppsService: { listEnabledKinds: async () => ['FEISHU'], rotateSecrets: async () => 0 },
}))
vi.mock('../../../../src/app/federation/external-identity.service', () => ({
    externalIdentityService: () => ({ rotateRefreshTokens: async () => 0 }),
}))

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const secret = { iv: 'iv', data: 'enc:client-secret' }

const provisionedOidc = {
    enabled: true,
    displayName: 'Company login',
    allowedDomains: [],
    autoCreateUsers: false,
    defaultRole: TenantRole.MEMBER,
    roleMapping: null,
    defaultProject: null,
    verifiedAt: '2026-11-05T00:00:00.000Z',
    lastLoginAt: null,
    issuer: 'https://iam.test',
    clientId: 'client-1',
    clientSecret: secret,
    scopes: 'openid email profile',
    emailClaim: 'email',
    requireVerifiedEmail: false,
    matchBy: SsoMatchBy.SUBJECT,
    extraAuthParams: { tenant: 'acme' },
    sessionRecheckMinutes: null,
    provisioned: true,
    memberSubscription: { subscriptionId: 'sub-1', code: 'ipaas-members-x', plainSecret: { iv: 'iv', data: 'enc:signing' }, endpoint: 'https://ipaas.test/api/v1/federation/members/tenant-1', apiUrl: 'https://fema.test', connectionExternalId: 'fema-iam', projectId: 'project-1', createdAt: '2026-11-05T00:00:00.000Z' },
}

function oidcRequest(overrides: Record<string, unknown> = {}) {
    return {
        enabled: true,
        displayName: 'Company login',
        allowedDomains: [],
        autoCreateUsers: false,
        defaultRole: TenantRole.MEMBER,
        roleMapping: null,
        defaultProject: null,
        issuer: 'https://iam.test',
        clientId: 'client-1',
        scopes: 'openid email profile',
        emailClaim: 'email',
        requireVerifiedEmail: false,
        ...overrides,
    }
}

async function loadService() {
    const { ssoConfigService } = await import('../../../../src/app/sso/sso-config.service')
    return ssoConfigService(log as never)
}

function lastOidc(): Record<string, unknown> {
    const written = state.updates[state.updates.length - 1]['federatedAuthProviders'] as { oidc: Record<string, unknown> }
    return written.oidc
}

describe('sso config service', () => {
    beforeEach(() => {
        state.providers = { saml: null }
        state.updates = []
        state.emailAuthEnabled = true
    })

    describe('a configuration written by the platform', () => {
        beforeEach(() => {
            state.providers = { saml: null, oidc: provisionedOidc }
        })

        it('lets the administrator switch it off and rename it', async () => {
            const service = await loadService()
            await service.saveOidc({ tenantId: 'tenant-1', request: oidcRequest({ enabled: false, displayName: 'Renamed' }) })
            expect(lastOidc()).toMatchObject({ enabled: false, displayName: 'Renamed', provisioned: true, matchBy: SsoMatchBy.SUBJECT, issuer: 'https://iam.test', clientId: 'client-1' })
        })

        it('keeps the member subscription, the extra parameters and the verification', async () => {
            const service = await loadService()
            await service.saveOidc({ tenantId: 'tenant-1', request: oidcRequest({ displayName: 'Renamed' }) })
            expect(lastOidc()).toMatchObject({ memberSubscription: { subscriptionId: 'sub-1', plainSecret: { data: 'enc:signing' } }, extraAuthParams: { tenant: 'acme' }, verifiedAt: '2026-11-05T00:00:00.000Z' })
        })

        it.each([
            ['issuer', { issuer: 'https://evil.test' }],
            ['client id', { clientId: 'other' }],
            ['client secret', { clientSecret: 'new-secret' }],
            ['scopes', { scopes: 'openid admin' }],
            ['match mode', { matchBy: SsoMatchBy.EMAIL }],
            ['extra parameters', { extraAuthParams: { tenant: 'other' } }],
            ['email claim', { emailClaim: 'upn' }],
        ])('refuses to change the %s', async (_name, change) => {
            const service = await loadService()
            await expect(service.saveOidc({ tenantId: 'tenant-1', request: oidcRequest(change) })).rejects.toMatchObject({ error: { code: 'VALIDATION' } })
            expect(state.updates).toHaveLength(0)
        })

        it('lets the administrator tune the session recheck interval', async () => {
            const service = await loadService()
            await service.saveOidc({ tenantId: 'tenant-1', request: oidcRequest({ sessionRecheckMinutes: 60 }) })
            expect(lastOidc()).toMatchObject({ sessionRecheckMinutes: 60, provisioned: true, issuer: 'https://iam.test', memberSubscription: { subscriptionId: 'sub-1' } })
        })

        it('lets the administrator clear the interval back to the default', async () => {
            const service = await loadService()
            state.providers = { saml: null, oidc: { ...provisionedOidc, sessionRecheckMinutes: 60 } }
            await service.saveOidc({ tenantId: 'tenant-1', request: oidcRequest({ sessionRecheckMinutes: null }) })
            expect(lastOidc()['sessionRecheckMinutes']).toBeNull()
        })

        it('keeps the interval when the request does not mention it', async () => {
            const service = await loadService()
            state.providers = { saml: null, oidc: { ...provisionedOidc, sessionRecheckMinutes: 45 } }
            await service.saveOidc({ tenantId: 'tenant-1', request: oidcRequest() })
            expect(lastOidc()['sessionRecheckMinutes']).toBe(45)
        })

        it('allows the access rules to be tuned', async () => {
            const service = await loadService()
            await service.saveOidc({ tenantId: 'tenant-1', request: oidcRequest({ autoCreateUsers: true, allowedDomains: ['Acme.test'], defaultRole: TenantRole.OPERATOR }) })
            expect(lastOidc()).toMatchObject({ autoCreateUsers: true, allowedDomains: ['acme.test'], defaultRole: TenantRole.OPERATOR })
        })
    })

    describe('a configuration written by the administrator', () => {
        it('defaults to matching by email and saves the new federation fields', async () => {
            const service = await loadService()
            state.providers = { saml: null, oidc: { ...provisionedOidc, provisioned: false, matchBy: undefined, extraAuthParams: undefined, verifiedAt: '2026-11-05T00:00:00.000Z' } }
            await service.saveOidc({ tenantId: 'tenant-1', request: oidcRequest({ enabled: false, matchBy: SsoMatchBy.SUBJECT, extraAuthParams: { tenant: 'acme' }, sessionRecheckMinutes: 30 }) })
            expect(lastOidc()).toMatchObject({ matchBy: SsoMatchBy.SUBJECT, extraAuthParams: { tenant: 'acme' }, sessionRecheckMinutes: 30, provisioned: false })
        })

        it('needs a fresh test sign-in after the match mode changes', async () => {
            const service = await loadService()
            state.providers = { saml: null, oidc: { ...provisionedOidc, provisioned: false } }
            await expect(service.saveOidc({ tenantId: 'tenant-1', request: oidcRequest({ matchBy: SsoMatchBy.EMAIL }) })).rejects.toMatchObject({ error: { code: 'VALIDATION' } })
        })

        it('rejects signed authentication requests until they are supported', async () => {
            const service = await loadService()
            await expect(service.saveSaml({
                tenantId: 'tenant-1',
                request: { enabled: false, displayName: 'x', allowedDomains: [], autoCreateUsers: false, defaultRole: TenantRole.MEMBER, roleMapping: null, defaultProject: null, idpMetadataXml: '<x/>', emailAttribute: 'mail', firstNameAttribute: null, lastNameAttribute: null, subjectSource: 'NAME_ID', subjectAttribute: null, signAuthnRequests: true },
            })).rejects.toMatchObject({ error: { code: 'VALIDATION' } })
        })
    })

    describe('SAML 2.0', () => {
        const certificate = samlTestCredentials.idp.certificate.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '')
        const metadata = `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="https://idp.acme.test/entity"><md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certificate}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.acme.test/sso"/></md:IDPSSODescriptor></md:EntityDescriptor>`
        const request = { enabled: false, displayName: 'Acme', allowedDomains: [], autoCreateUsers: false, defaultRole: TenantRole.MEMBER, roleMapping: null, defaultProject: null, emailAttribute: 'mail', firstNameAttribute: null, lastNameAttribute: null, subjectSource: 'NAME_ID' as const, subjectAttribute: null, signAuthnRequests: false }

        it('shows the service provider addresses before anything is configured', async () => {
            const service = await loadService()
            const settings = await service.getSettings({ tenantId: 'tenant-1' })
            expect(settings.saml).toBeNull()
            expect(settings.samlServiceProvider).toEqual({
                spEntityId: 'https://ipaas.test/api/v1/authn/sso/saml/metadata/tenant-1',
                acsUrl: 'https://ipaas.test/api/v1/authn/sso/saml/acs',
                spMetadataUrl: 'https://ipaas.test/api/v1/authn/sso/saml/metadata/tenant-1',
            })
        })

        it('needs the metadata the first time', async () => {
            const service = await loadService()
            await expect(service.saveSaml({ tenantId: 'tenant-1', request })).rejects.toMatchObject({ error: { code: 'VALIDATION' } })
            expect(state.updates).toHaveLength(0)
        })

        it('reads the identity provider facts out of the metadata', async () => {
            const service = await loadService()
            await service.saveSaml({ tenantId: 'tenant-1', request: { ...request, idpMetadataXml: metadata } })
            const written = state.updates[0]['federatedAuthProviders'] as { saml2: Record<string, unknown> }
            expect(written.saml2).toMatchObject({ idpEntityId: 'https://idp.acme.test/entity', idpSsoUrl: 'https://idp.acme.test/sso', idpCertificates: [certificate], signAuthnRequests: false })
        })

        it('keeps the stored metadata and the verification when it is left out later', async () => {
            const service = await loadService()
            await service.saveSaml({ tenantId: 'tenant-1', request: { ...request, idpMetadataXml: metadata } })
            const saved = (state.updates[0]['federatedAuthProviders'] as { saml2: Record<string, unknown> }).saml2
            state.providers = { saml: null, saml2: { ...saved, verifiedAt: '2026-11-05T00:00:00.000Z' } }
            await service.saveSaml({ tenantId: 'tenant-1', request: { ...request, enabled: true, displayName: 'Renamed' } })
            const next = (state.updates[1]['federatedAuthProviders'] as { saml2: Record<string, unknown> }).saml2
            expect(next).toMatchObject({ displayName: 'Renamed', enabled: true, idpMetadataXml: metadata, idpEntityId: 'https://idp.acme.test/entity', verifiedAt: '2026-11-05T00:00:00.000Z' })
        })

        it('rejects metadata without a redirect endpoint', async () => {
            const service = await loadService()
            await expect(service.saveSaml({ tenantId: 'tenant-1', request: { ...request, idpMetadataXml: metadata.replace('HTTP-Redirect', 'HTTP-POST') } })).rejects.toMatchObject({ error: { code: 'VALIDATION' } })
        })
    })

    describe('what the sign-in page may offer', () => {
        it('lists every enabled tenant method with its scope', async () => {
            const service = await loadService()
            state.providers = {
                saml: null,
                oidc: provisionedOidc,
                wecom: { ...provisionedOidc, displayName: '企业微信', enabled: true },
                dingtalk: { ...provisionedOidc, displayName: '钉钉', enabled: false },
            }
            const options = await service.listPublicProviders({ tenantId: 'tenant-1' })
            expect(options).toEqual([
                { provider: SsoProvider.OIDC, label: 'Company login', scope: 'TENANT' },
                { provider: SsoProvider.WECOM, label: '企业微信', scope: 'TENANT' },
            ])
        })

        it('lists the instance wide scan apps with the PLATFORM scope', async () => {
            const service = await loadService()
            expect(await service.listPlatformProviders()).toEqual([{ provider: SsoProvider.FEISHU, label: '飞书', scope: 'PLATFORM' }])
        })
    })

    describe('the settings page', () => {
        it('shows the SAML addresses, the platform apps and the enterprise bindings', async () => {
            const service = await loadService()
            state.providers = { saml: null, platformAppBindings: [{ kind: 'FEISHU', enterpriseKey: 'ent-1', enterpriseName: 'Acme', boundAt: '2026-11-05T00:00:00.000Z' }] }
            const settings = await service.getSettings({ tenantId: 'tenant-1' })
            expect(settings.platformAppBindings).toEqual([{ kind: 'FEISHU', enterpriseKey: 'ent-1', enterpriseName: 'Acme', boundAt: '2026-11-05T00:00:00.000Z' }])
            expect(settings.availablePlatformApps).toEqual(['FEISHU'])
            expect(settings.redirectUri).toBe('https://ipaas.test/api/v1/authn/sso/callback')
            expect(settings.saml).toBeNull()
        })

        it('removes an enterprise binding without touching the others', async () => {
            const service = await loadService()
            state.providers = {
                saml: null,
                platformAppBindings: [
                    { kind: 'FEISHU', enterpriseKey: 'ent-1', enterpriseName: 'Acme', boundAt: 'x' },
                    { kind: 'WECOM', enterpriseKey: 'ent-2', enterpriseName: 'Acme', boundAt: 'x' },
                ],
            }
            await service.removePlatformBinding({ tenantId: 'tenant-1', kind: 'FEISHU' })
            const written = state.updates[0]['federatedAuthProviders'] as { platformAppBindings: Array<{ kind: string }> }
            expect(written.platformAppBindings.map((binding) => binding.kind)).toEqual(['WECOM'])
        })
    })
})
