import { ExternalIdentityStatus, SsoLoginErrorCode, SsoMatchBy, TenantRole, UserIdentityProvider, UserStatus } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimePolicy } from '../../../../src/app/sso/sso-runtime'

const touchLogin = vi.fn()
const bindToUser = vi.fn()
const getUser = vi.fn()
const getOneByIdentityAndTenant = vi.fn()
const getOrCreateWithProject = vi.fn()
const updateUser = vi.fn()
const getIdentityByEmail = vi.fn()
const getIdentity = vi.fn()
const createIdentity = vi.fn()
const verifyAndDiscardPassword = vi.fn()
const hasAnyAcceptedInvitations = vi.fn()
const provisionUserInvitation = vi.fn()
const getTenant = vi.fn()
const upsertMember = vi.fn()
const sendUserEvent = vi.fn()

vi.mock('../../../../src/app/federation/external-identity.service', () => ({
    externalIdentityService: () => ({ touchLogin, bindToUser }),
}))
vi.mock('../../../../src/app/user/user-service', () => ({
    userService: () => ({ get: getUser, getOneByIdentityAndTenant, getOrCreateWithProject, update: updateUser }),
}))
vi.mock('../../../../src/app/authentication/user-identity/user-identity-service', () => ({
    userIdentityService: () => ({ getIdentityByEmail, getOneOrFail: getIdentity, create: createIdentity, verifyAndDiscardPassword }),
}))
vi.mock('../../../../src/app/user-invitations/user-invitation.service', () => ({
    userInvitationsService: () => ({ hasAnyAcceptedInvitations, provisionUserInvitation }),
}))
vi.mock('../../../../src/app/tenant/tenant.service', () => ({
    tenantService: () => ({ getOneOrThrow: getTenant }),
}))
vi.mock('../../../../src/app/project/project-member.service', () => ({
    projectMemberService: () => ({ upsert: upsertMember }),
}))
vi.mock('../../../../src/app/helper/application-events', () => ({
    applicationEvents: () => ({ sendUserEvent }),
}))
vi.mock('../../../../src/app/authentication/authentication-utils', () => ({
    isDomainAllowed: ({ enforce }: { enforce: boolean }) => !enforce,
}))

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

const subjectPolicy: RuntimePolicy = {
    issuer: 'https://iam.test',
    matchBy: SsoMatchBy.SUBJECT,
    allowedDomains: [],
    autoCreateUsers: false,
    defaultRole: TenantRole.MEMBER,
    roleMapping: null,
    defaultProject: null,
    requireVerifiedEmail: false,
    userProvider: UserIdentityProvider.OIDC,
    federated: true,
}

const emailPolicy: RuntimePolicy = { ...subjectPolicy, issuer: 'feishu:app1', matchBy: SsoMatchBy.EMAIL, userProvider: UserIdentityProvider.FEISHU, federated: false }

function profileOf(overrides: Partial<{ subject: string, email: string, fullName: string }> = {}) {
    return {
        subject: 'member-1',
        email: '',
        emailVerified: false,
        fullName: '',
        givenName: '',
        familyName: '',
        groups: [],
        enterpriseKey: null,
        enterpriseName: null,
        ...overrides,
    }
}

function bindingOf(overrides: Record<string, unknown> = {}) {
    return {
        id: 'bind-1',
        issuer: 'https://iam.test',
        subject: 'member-1',
        tenantId: 'tenant-1',
        identityId: 'identity-1',
        userId: 'user-1',
        prebindRole: null,
        status: ExternalIdentityStatus.ACTIVE,
        email: null,
        displayName: null,
        lastVerifiedAt: null,
        created: '2026-11-05T00:00:00.000Z',
        updated: '2026-11-05T00:00:00.000Z',
        ...overrides,
    }
}

const activeUser = { id: 'user-1', identityId: 'identity-1', tenantId: 'tenant-1', tenantRole: TenantRole.MEMBER, status: UserStatus.ACTIVE }

async function loadResolver() {
    const { ssoUserResolver } = await import('../../../../src/app/sso/sso-user-resolver')
    return ssoUserResolver
}

describe('sso user resolver', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getIdentity.mockResolvedValue({ id: 'identity-1', verified: true })
        getTenant.mockResolvedValue({ id: 'tenant-1', ownerId: 'someone-else', enforceAllowedAuthDomains: false, allowedAuthDomains: [] })
        bindToUser.mockResolvedValue(bindingOf())
    })

    describe('signing in through a binding', () => {
        it('signs a member in with no email at all', async () => {
            const resolver = await loadResolver()
            getUser.mockResolvedValue(activeUser)
            const resolved = await resolver.resolve({ log: log as never, policy: subjectPolicy, profile: profileOf(), tenantId: 'tenant-1', binding: bindingOf(), ip: undefined })
            expect(resolved).toEqual({ userId: 'user-1', externalIdentityId: 'bind-1' })
            expect(getIdentityByEmail).not.toHaveBeenCalled()
            expect(createIdentity).not.toHaveBeenCalled()
            expect(touchLogin).toHaveBeenCalledWith(expect.objectContaining({ id: 'bind-1', tenantId: 'tenant-1' }))
        })

        it('refuses a binding that belongs to another tenant', async () => {
            const resolver = await loadResolver()
            await expect(resolver.resolve({ log: log as never, policy: subjectPolicy, profile: profileOf(), tenantId: 'tenant-2', binding: bindingOf(), ip: undefined }))
                .rejects.toMatchObject({ code: SsoLoginErrorCode.USER_NOT_PROVISIONED })
        })

        it('refuses a binding revoked by the identity provider', async () => {
            const resolver = await loadResolver()
            await expect(resolver.resolve({ log: log as never, policy: subjectPolicy, profile: profileOf(), tenantId: 'tenant-1', binding: bindingOf({ status: ExternalIdentityStatus.REVOKED }), ip: undefined }))
                .rejects.toMatchObject({ code: SsoLoginErrorCode.USER_DISABLED })
        })

        it('refuses a deactivated user', async () => {
            const resolver = await loadResolver()
            getUser.mockResolvedValue({ ...activeUser, status: UserStatus.INACTIVE })
            await expect(resolver.resolve({ log: log as never, policy: subjectPolicy, profile: profileOf(), tenantId: 'tenant-1', binding: bindingOf(), ip: undefined }))
                .rejects.toMatchObject({ code: SsoLoginErrorCode.USER_DISABLED })
        })
    })

    describe('first sign-in of a prebound member', () => {
        it('creates the user with the prebound role and completes the binding', async () => {
            const resolver = await loadResolver()
            createIdentity.mockResolvedValue({ id: 'identity-new', verified: true })
            getOrCreateWithProject.mockResolvedValue({ id: 'user-new', tenantRole: TenantRole.MEMBER })
            bindToUser.mockResolvedValue(bindingOf({ id: 'bind-2', userId: 'user-new' }))
            const resolved = await resolver.resolve({
                log: log as never,
                policy: subjectPolicy,
                profile: profileOf({ email: 'Owner@Acme.test', fullName: 'Owner Person' }),
                tenantId: 'tenant-1',
                binding: bindingOf({ userId: null, identityId: null, prebindRole: TenantRole.ADMIN }),
                ip: undefined,
            })
            expect(resolved.userId).toBe('user-new')
            expect(updateUser).toHaveBeenCalledWith({ id: 'user-new', tenantId: 'tenant-1', tenantRole: TenantRole.ADMIN })
            expect(createIdentity).toHaveBeenCalledWith(expect.objectContaining({ email: null, contactEmail: 'Owner@Acme.test', provider: UserIdentityProvider.OIDC }))
            expect(bindToUser).toHaveBeenCalledWith(expect.objectContaining({ issuer: 'https://iam.test', subject: 'member-1', identityId: 'identity-new', userId: 'user-new' }))
        })

        it('keeps the email off the global identity so two tenants can share an address', async () => {
            const resolver = await loadResolver()
            createIdentity.mockResolvedValue({ id: 'identity-new', verified: true })
            getOrCreateWithProject.mockResolvedValue({ id: 'user-new', tenantRole: TenantRole.MEMBER })
            await resolver.resolve({ log: log as never, policy: subjectPolicy, profile: profileOf({ email: 'same@acme.test' }), tenantId: 'tenant-1', binding: bindingOf({ userId: null, prebindRole: TenantRole.MEMBER }), ip: undefined })
            expect(getIdentityByEmail).not.toHaveBeenCalled()
            expect(createIdentity.mock.calls[0][0].email).toBeNull()
        })
    })

    describe('a member nobody expected', () => {
        it('is refused when subject matching is on and automatic creation is off', async () => {
            const resolver = await loadResolver()
            await expect(resolver.resolve({ log: log as never, policy: subjectPolicy, profile: profileOf({ email: 'known@acme.test' }), tenantId: 'tenant-1', binding: null, ip: undefined }))
                .rejects.toMatchObject({ code: SsoLoginErrorCode.USER_NOT_PROVISIONED })
            expect(getIdentityByEmail).not.toHaveBeenCalled()
        })

        it('is created without an email when automatic creation is on', async () => {
            const resolver = await loadResolver()
            createIdentity.mockResolvedValue({ id: 'identity-new', verified: true })
            getOrCreateWithProject.mockResolvedValue({ id: 'user-new', tenantRole: TenantRole.MEMBER })
            const resolved = await resolver.resolve({ log: log as never, policy: { ...subjectPolicy, autoCreateUsers: true }, profile: profileOf({ fullName: '张三' }), tenantId: 'tenant-1', binding: null, ip: undefined })
            expect(resolved.userId).toBe('user-new')
            expect(createIdentity.mock.calls[0][0]).toMatchObject({ email: null, contactEmail: null })
        })
    })

    describe('matching by email', () => {
        it('links an existing user of the tenant and records the binding', async () => {
            const resolver = await loadResolver()
            getIdentityByEmail.mockResolvedValue({ id: 'identity-1', verified: true })
            getOneByIdentityAndTenant.mockResolvedValue(activeUser)
            bindToUser.mockResolvedValue(bindingOf({ issuer: 'feishu:app1' }))
            const resolved = await resolver.resolve({ log: log as never, policy: emailPolicy, profile: profileOf({ email: 'a@acme.test' }), tenantId: 'tenant-1', binding: null, ip: undefined })
            expect(resolved.userId).toBe('user-1')
            expect(bindToUser).toHaveBeenCalledWith(expect.objectContaining({ issuer: 'feishu:app1', identityId: 'identity-1', userId: 'user-1' }))
        })

        it('does not link by email when the policy matches by subject', async () => {
            const resolver = await loadResolver()
            getIdentityByEmail.mockResolvedValue({ id: 'identity-1', verified: true })
            await expect(resolver.resolve({ log: log as never, policy: subjectPolicy, profile: profileOf({ email: 'a@acme.test' }), tenantId: 'tenant-1', binding: null, ip: undefined }))
                .rejects.toMatchObject({ code: SsoLoginErrorCode.USER_NOT_PROVISIONED })
            expect(bindToUser).not.toHaveBeenCalled()
        })

        it('creates an invited user under the email identity', async () => {
            const resolver = await loadResolver()
            getIdentityByEmail.mockResolvedValue(null)
            hasAnyAcceptedInvitations.mockResolvedValue(true)
            createIdentity.mockResolvedValue({ id: 'identity-new', verified: true })
            getOrCreateWithProject.mockResolvedValue({ id: 'user-new', tenantRole: TenantRole.MEMBER })
            await resolver.resolve({ log: log as never, policy: emailPolicy, profile: profileOf({ email: 'Invited@Acme.test' }), tenantId: 'tenant-1', binding: null, ip: undefined })
            expect(createIdentity.mock.calls[0][0]).toMatchObject({ email: 'Invited@Acme.test', contactEmail: null })
        })
    })

    describe('judging a profile', () => {
        it('asks for an email only when matching by email without a binding', async () => {
            const resolver = await loadResolver()
            await expect(resolver.assertProfileAllowed({ log: log as never, policy: emailPolicy, profile: profileOf(), tenantId: 'tenant-1', binding: null }))
                .rejects.toMatchObject({ code: SsoLoginErrorCode.EMAIL_MISSING })
            await expect(resolver.assertProfileAllowed({ log: log as never, policy: emailPolicy, profile: profileOf(), tenantId: 'tenant-1', binding: bindingOf() })).resolves.toBeUndefined()
            await expect(resolver.assertProfileAllowed({ log: log as never, policy: subjectPolicy, profile: profileOf(), tenantId: 'tenant-1', binding: null })).resolves.toBeUndefined()
        })

        it('still enforces the tenant domain rule when an address is present', async () => {
            const resolver = await loadResolver()
            getTenant.mockResolvedValue({ id: 'tenant-1', ownerId: 'x', enforceAllowedAuthDomains: true, allowedAuthDomains: ['acme.test'] })
            await expect(resolver.assertProfileAllowed({ log: log as never, policy: subjectPolicy, profile: profileOf({ email: 'a@other.test' }), tenantId: 'tenant-1', binding: null }))
                .rejects.toMatchObject({ code: SsoLoginErrorCode.DOMAIN_NOT_ALLOWED })
        })
    })
})
