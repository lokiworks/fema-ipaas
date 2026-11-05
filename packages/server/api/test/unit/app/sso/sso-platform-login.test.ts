import { ExternalIdentityStatus, SsoLoginErrorCode, SsoRegion, TenantRole, UserStatus } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    findBinding: vi.fn(),
    bindToUser: vi.fn(),
    findTenantIdByPlatformBinding: vi.fn(),
    addPlatformBinding: vi.fn(),
    provisionTenant: vi.fn(),
    getUser: vi.fn(),
    selfSignup: vi.fn(),
    resolve: vi.fn(),
    assertProfileAllowed: vi.fn(),
    ensureIdentity: vi.fn(),
    bindUser: vi.fn(),
}))

vi.mock('../../../../src/app/federation/external-identity.service', () => ({
    externalIdentityService: () => ({ findBinding: mocks.findBinding, bindToUser: mocks.bindToUser }),
}))
vi.mock('../../../../src/app/sso/sso-config.service', () => ({
    ssoConfigService: () => ({ findTenantIdByPlatformBinding: mocks.findTenantIdByPlatformBinding, addPlatformBinding: mocks.addPlatformBinding }),
}))
vi.mock('../../../../src/app/tenant/tenant.service', () => ({
    tenantService: () => ({ provisionTenant: mocks.provisionTenant }),
}))
vi.mock('../../../../src/app/user/user-service', () => ({
    userService: () => ({ get: mocks.getUser }),
}))
vi.mock('../../../../src/app/operator/instance-settings.store', () => ({
    instanceSettingsStore: { get: mocks.selfSignup },
}))
vi.mock('../../../../src/app/database/redis-connections', () => ({
    distributedLock: () => ({ runExclusive: ({ fn }: { fn: () => Promise<unknown> }) => fn() }),
}))
vi.mock('../../../../src/app/sso/sso-user-resolver', () => ({
    ssoUserResolver: {
        resolve: mocks.resolve,
        assertProfileAllowed: mocks.assertProfileAllowed,
        ensureIdentity: mocks.ensureIdentity,
        bindUser: mocks.bindUser,
        displayNameOf: ({ profile }: { profile: { fullName: string } }) => profile.fullName,
    },
}))

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const app = { kind: 'FEISHU' as const, appId: 'cli_1', appSecret: 's', region: SsoRegion.FEISHU, allowSelfSignup: true }

function platformOf(overrides: Record<string, unknown> = {}) {
    return {
        issuer: 'feishu:cli_1',
        enterpriseKey: 'ent-1',
        profile: { subject: 'ou_1', email: 'a@acme.test', emailVerified: true, fullName: '张三', givenName: '三', familyName: '张', groups: [], enterpriseKey: 'ent-1', enterpriseName: null, ...overrides },
    }
}

async function loadPlatformLogin() {
    const { ssoPlatformLogin } = await import('../../../../src/app/sso/sso-platform-login')
    return ssoPlatformLogin
}

describe('platform login', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.findBinding.mockResolvedValue(null)
        mocks.findTenantIdByPlatformBinding.mockResolvedValue(null)
        mocks.selfSignup.mockResolvedValue({ tenantSelfSignup: true })
        mocks.resolve.mockResolvedValue({ userId: 'user-1', externalIdentityId: 'bind-1' })
        mocks.ensureIdentity.mockResolvedValue({ id: 'identity-1' })
        mocks.provisionTenant.mockResolvedValue({ tenant: { id: 'tenant-new' }, ownerUserId: 'owner-1', projectId: 'project-1' })
    })

    describe('signing in', () => {
        it('goes to the tenant that is bound to the scanned enterprise', async () => {
            const platformLogin = await loadPlatformLogin()
            mocks.findTenantIdByPlatformBinding.mockResolvedValue('tenant-1')
            const result = await platformLogin.login({ log: log as never, kind: 'FEISHU', platform: platformOf(), app, ip: undefined })
            expect(result).toEqual({ userId: 'user-1', tenantId: 'tenant-1', createdTenant: false })
            expect(mocks.findTenantIdByPlatformBinding).toHaveBeenCalledWith({ kind: 'FEISHU', enterpriseKey: 'ent-1' })
            expect(mocks.provisionTenant).not.toHaveBeenCalled()
        })

        it('never matches people to existing accounts by email on the shared app', async () => {
            const platformLogin = await loadPlatformLogin()
            mocks.findTenantIdByPlatformBinding.mockResolvedValue('tenant-1')
            await platformLogin.login({ log: log as never, kind: 'FEISHU', platform: platformOf(), app, ip: undefined })
            expect(mocks.resolve.mock.calls[0][0].policy).toMatchObject({ matchBy: 'SUBJECT', autoCreateUsers: false, issuer: 'feishu:cli_1' })
        })

        it('follows an existing binding to its tenant', async () => {
            const platformLogin = await loadPlatformLogin()
            mocks.findBinding.mockResolvedValue({ id: 'bind-1', tenantId: 'tenant-7', userId: 'user-1', status: ExternalIdentityStatus.ACTIVE })
            mocks.findTenantIdByPlatformBinding.mockResolvedValue('tenant-7')
            const result = await platformLogin.login({ log: log as never, kind: 'FEISHU', platform: platformOf(), app, ip: undefined })
            expect(result.tenantId).toBe('tenant-7')
        })

        it('refuses a binding that conflicts with the tenant that owns the enterprise', async () => {
            const platformLogin = await loadPlatformLogin()
            mocks.findBinding.mockResolvedValue({ id: 'bind-1', tenantId: 'tenant-7', userId: 'user-1', status: ExternalIdentityStatus.ACTIVE })
            mocks.findTenantIdByPlatformBinding.mockResolvedValue('tenant-8')
            await expect(platformLogin.login({ log: log as never, kind: 'FEISHU', platform: platformOf(), app, ip: undefined })).rejects.toMatchObject({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH })
        })
    })

    describe('creating a tenant by signing in', () => {
        it('creates a tenant owned by the person who scanned and binds the enterprise', async () => {
            const platformLogin = await loadPlatformLogin()
            const result = await platformLogin.login({ log: log as never, kind: 'FEISHU', platform: platformOf({ enterpriseName: 'Acme 科技' }), app, ip: undefined })
            expect(result).toEqual({ userId: 'owner-1', tenantId: 'tenant-new', createdTenant: true })
            expect(mocks.provisionTenant).toHaveBeenCalledWith({ identityId: 'identity-1', name: 'Acme 科技' })
            expect(mocks.addPlatformBinding).toHaveBeenCalledWith({ tenantId: 'tenant-new', kind: 'FEISHU', enterpriseKey: 'ent-1', enterpriseName: 'Acme 科技' })
            expect(mocks.bindUser).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-new', identityId: 'identity-1', userId: 'owner-1' }))
        })

        it('is refused when the app does not allow self sign-up', async () => {
            const platformLogin = await loadPlatformLogin()
            await expect(platformLogin.login({ log: log as never, kind: 'FEISHU', platform: platformOf(), app: { ...app, allowSelfSignup: false }, ip: undefined })).rejects.toMatchObject({ code: SsoLoginErrorCode.USER_NOT_PROVISIONED })
            expect(mocks.provisionTenant).not.toHaveBeenCalled()
        })

        it('is refused when the instance does not open self sign-up', async () => {
            const platformLogin = await loadPlatformLogin()
            mocks.selfSignup.mockResolvedValue({ tenantSelfSignup: false })
            await expect(platformLogin.login({ log: log as never, kind: 'FEISHU', platform: platformOf(), app, ip: undefined })).rejects.toMatchObject({ code: SsoLoginErrorCode.USER_NOT_PROVISIONED })
            expect(mocks.provisionTenant).not.toHaveBeenCalled()
        })

        it('does not create a second tenant when a colleague bound the enterprise a moment ago', async () => {
            const platformLogin = await loadPlatformLogin()
            mocks.findTenantIdByPlatformBinding.mockResolvedValueOnce(null).mockResolvedValueOnce('tenant-first')
            const result = await platformLogin.login({ log: log as never, kind: 'FEISHU', platform: platformOf(), app, ip: undefined })
            expect(result.tenantId).toBe('tenant-first')
            expect(mocks.provisionTenant).not.toHaveBeenCalled()
        })
    })

    describe('binding an enterprise from the settings page', () => {
        const admin = { id: 'admin-1', identityId: 'identity-9', tenantId: 'tenant-1', tenantRole: TenantRole.ADMIN, status: UserStatus.ACTIVE }

        it('binds the enterprise and the scanning administrator', async () => {
            const platformLogin = await loadPlatformLogin()
            mocks.getUser.mockResolvedValue(admin)
            await platformLogin.bind({ log: log as never, kind: 'FEISHU', platform: platformOf(), tenantId: 'tenant-1', actorUserId: 'admin-1' })
            expect(mocks.addPlatformBinding).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', kind: 'FEISHU', enterpriseKey: 'ent-1' }))
            expect(mocks.bindToUser).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', issuer: 'feishu:cli_1', subject: 'ou_1', identityId: 'identity-9', userId: 'admin-1' }))
        })

        it('is only for administrators of the tenant', async () => {
            const platformLogin = await loadPlatformLogin()
            mocks.getUser.mockResolvedValue({ ...admin, tenantRole: TenantRole.MEMBER })
            await expect(platformLogin.bind({ log: log as never, kind: 'FEISHU', platform: platformOf(), tenantId: 'tenant-1', actorUserId: 'admin-1' })).rejects.toMatchObject({ code: SsoLoginErrorCode.USER_NOT_PROVISIONED })
            mocks.getUser.mockResolvedValue({ ...admin, tenantId: 'tenant-2' })
            await expect(platformLogin.bind({ log: log as never, kind: 'FEISHU', platform: platformOf(), tenantId: 'tenant-1', actorUserId: 'admin-1' })).rejects.toMatchObject({ code: SsoLoginErrorCode.USER_NOT_PROVISIONED })
            expect(mocks.addPlatformBinding).not.toHaveBeenCalled()
        })

        it('refuses an enterprise that another tenant already owns', async () => {
            const platformLogin = await loadPlatformLogin()
            mocks.getUser.mockResolvedValue(admin)
            mocks.findTenantIdByPlatformBinding.mockResolvedValue('tenant-2')
            await expect(platformLogin.bind({ log: log as never, kind: 'FEISHU', platform: platformOf(), tenantId: 'tenant-1', actorUserId: 'admin-1' })).rejects.toMatchObject({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH })
            expect(mocks.bindToUser).not.toHaveBeenCalled()
        })

        it('refuses an account that is already bound to someone else', async () => {
            const platformLogin = await loadPlatformLogin()
            mocks.getUser.mockResolvedValue(admin)
            mocks.findBinding.mockResolvedValue({ tenantId: 'tenant-1', userId: 'other-user' })
            await expect(platformLogin.bind({ log: log as never, kind: 'FEISHU', platform: platformOf(), tenantId: 'tenant-1', actorUserId: 'admin-1' })).rejects.toMatchObject({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH })
        })
    })
})
