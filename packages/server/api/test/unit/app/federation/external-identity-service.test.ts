import { ExternalIdentityStatus, SsoMatchBy, TenantRole, UserStatus } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
    rows: [] as Row[],
    userUpdates: [] as Array<{ where: Row, patch: Row }>,
    tenantUpdates: [] as Array<{ where: Row, patch: Row }>,
    tenantProviders: {} as Record<string, unknown>,
}))

function matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, value]) => row[key] === value)
}

const fakeRepo = {
    findOneBy: async (where: Row) => state.rows.find((row) => matches(row, where)) ?? null,
    findOneByOrFail: async (where: Row) => {
        const found = state.rows.find((row) => matches(row, where))
        if (!found) throw new Error('not found')
        return found
    },
    find: async ({ where }: { where: Row }) => state.rows.filter((row) => matches(row, where)),
    save: async (row: Row) => {
        const saved = { created: 'c', updated: 'u', ...row }
        state.rows.push(saved)
        return saved
    },
    update: async (where: Row, patch: Row) => {
        state.rows.filter((row) => matches(row, where)).forEach((row) => Object.assign(row, patch))
    },
}

vi.mock('../../../../src/app/core/db/repo-factory', () => ({ repoFactory: () => () => fakeRepo }))
vi.mock('../../../../src/app/database/redis-connections', () => ({
    distributedLock: () => ({ runExclusive: ({ fn }: { fn: () => Promise<unknown> }) => fn() }),
}))
vi.mock('../../../../src/app/helper/encryption', () => ({
    encryptUtils: {
        encryptString: async (value: string) => ({ iv: 'iv', data: `enc:${value}` }),
        decryptString: async (value: { data: string }) => value.data.replace('enc:', ''),
        isEncryptedWithCurrentKey: async () => true,
    },
}))
vi.mock('../../../../src/app/user/user-service', () => ({
    userRepo: () => ({
        update: async (where: Row, patch: Row) => {
            state.userUpdates.push({ where, patch })
        },
    }),
}))
vi.mock('../../../../src/app/tenant/tenant.service', () => ({
    tenantRepo: () => ({
        update: async (where: Row, patch: Row) => {
            state.tenantUpdates.push({ where, patch })
        },
    }),
    tenantService: () => ({ getOneWithFederatedAuthOrThrow: async () => ({ id: 'tenant-1', federatedAuthProviders: state.tenantProviders }) }),
}))

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const issuer = 'https://iam.test'

async function loadService() {
    const { externalIdentityService } = await import('../../../../src/app/federation/external-identity.service')
    return externalIdentityService(log as never)
}

describe('external identity service', () => {
    beforeEach(() => {
        state.rows = []
        state.userUpdates = []
        state.tenantUpdates = []
        state.tenantProviders = { saml: null }
    })

    describe('prebinding', () => {
        it('records a binding that waits for the first sign-in', async () => {
            const service = await loadService()
            const binding = await service.prebind({ tenantId: 'tenant-1', issuer, subject: 'm1', role: TenantRole.ADMIN, email: ' Owner@Acme.test ' })
            expect(binding).toMatchObject({ issuer, subject: 'm1', tenantId: 'tenant-1', userId: null, prebindRole: TenantRole.ADMIN, status: ExternalIdentityStatus.ACTIVE, email: 'owner@acme.test' })
        })

        it('is idempotent and refreshes the role of a binding nobody used yet', async () => {
            const service = await loadService()
            await service.prebind({ tenantId: 'tenant-1', issuer, subject: 'm1', role: TenantRole.MEMBER })
            await service.prebind({ tenantId: 'tenant-1', issuer, subject: 'm1', role: TenantRole.ADMIN })
            expect(state.rows).toHaveLength(1)
            expect(state.rows[0]['prebindRole']).toBe(TenantRole.ADMIN)
        })

        it('does not touch a binding that already belongs to a user', async () => {
            const service = await loadService()
            await service.bindToUser({ tenantId: 'tenant-1', issuer, subject: 'm1', identityId: 'i1', userId: 'u1' })
            const again = await service.prebind({ tenantId: 'tenant-1', issuer, subject: 'm1', role: TenantRole.ADMIN })
            expect(again.userId).toBe('u1')
            expect(state.rows[0]['prebindRole']).toBeNull()
        })

        it('refuses to move a member to another tenant', async () => {
            const service = await loadService()
            await service.prebind({ tenantId: 'tenant-1', issuer, subject: 'm1', role: TenantRole.MEMBER })
            await expect(service.prebind({ tenantId: 'tenant-2', issuer, subject: 'm1', role: TenantRole.MEMBER })).rejects.toThrow()
        })
    })

    describe('binding to a user', () => {
        it('completes a prebound member and clears the waiting role', async () => {
            const service = await loadService()
            await service.prebind({ tenantId: 'tenant-1', issuer, subject: 'm1', role: TenantRole.ADMIN })
            const bound = await service.bindToUser({ tenantId: 'tenant-1', issuer, subject: 'm1', identityId: 'i1', userId: 'u1', email: 'a@b.test', displayName: 'A' })
            expect(bound).toMatchObject({ userId: 'u1', identityId: 'i1', prebindRole: null, email: 'a@b.test', displayName: 'A' })
            expect(state.rows).toHaveLength(1)
        })

        it('refuses to give a bound member to another user', async () => {
            const service = await loadService()
            await service.bindToUser({ tenantId: 'tenant-1', issuer, subject: 'm1', identityId: 'i1', userId: 'u1' })
            await expect(service.bindToUser({ tenantId: 'tenant-1', issuer, subject: 'm1', identityId: 'i2', userId: 'u2' })).rejects.toThrow()
        })

        it('finds a binding by issuer and subject', async () => {
            const service = await loadService()
            await service.bindToUser({ tenantId: 'tenant-1', issuer, subject: 'm1', identityId: 'i1', userId: 'u1' })
            expect(await service.findBinding({ issuer, subject: 'm1' })).toMatchObject({ userId: 'u1' })
            expect(await service.findBinding({ issuer, subject: 'm2' })).toBeNull()
            expect(await service.findBinding({ issuer: 'https://other.test', subject: 'm1' })).toBeNull()
        })
    })

    describe('revoking and restoring', () => {
        it('revokes the binding, drops the refresh token and deactivates the user', async () => {
            const service = await loadService()
            await service.bindToUser({ tenantId: 'tenant-1', issuer, subject: 'm1', identityId: 'i1', userId: 'u1' })
            const result = await service.revokeBySubject({ issuer, subject: 'm1' })
            expect(result).toMatchObject({ found: true, tenantId: 'tenant-1', userId: 'u1', alreadyRevoked: false })
            expect(state.rows[0]).toMatchObject({ status: ExternalIdentityStatus.REVOKED, refreshToken: null })
            expect(state.userUpdates).toEqual([{ where: { id: 'u1', tenantId: 'tenant-1' }, patch: { status: UserStatus.INACTIVE } }])
        })

        it('is harmless when the member is unknown or already revoked', async () => {
            const service = await loadService()
            expect(await service.revokeBySubject({ issuer, subject: 'ghost' })).toMatchObject({ found: false })
            await service.bindToUser({ tenantId: 'tenant-1', issuer, subject: 'm1', identityId: 'i1', userId: 'u1' })
            await service.revokeBySubject({ issuer, subject: 'm1' })
            expect(await service.revokeBySubject({ issuer, subject: 'm1' })).toMatchObject({ found: true, alreadyRevoked: true })
        })

        it('ignores a member that belongs to a different tenant than the sender', async () => {
            const service = await loadService()
            await service.bindToUser({ tenantId: 'tenant-1', issuer, subject: 'm1', identityId: 'i1', userId: 'u1' })
            const result = await service.revokeBySubject({ issuer, subject: 'm1', tenantId: 'tenant-2' })
            expect(result.found).toBe(false)
            expect(state.rows[0]['status']).toBe(ExternalIdentityStatus.ACTIVE)
            expect(state.userUpdates).toHaveLength(0)
        })

        it('restores a revoked binding and reactivates its user', async () => {
            const service = await loadService()
            await service.bindToUser({ tenantId: 'tenant-1', issuer, subject: 'm1', identityId: 'i1', userId: 'u1' })
            await service.revokeBySubject({ issuer, subject: 'm1' })
            state.userUpdates = []
            const result = await service.restoreBySubject({ issuer, subject: 'm1', tenantId: 'tenant-1' })
            expect(result.found).toBe(true)
            expect(state.rows[0]['status']).toBe(ExternalIdentityStatus.ACTIVE)
            expect(state.userUpdates).toEqual([{ where: { id: 'u1', tenantId: 'tenant-1' }, patch: { status: UserStatus.ACTIVE } }])
        })

        it('does not reactivate a user whose binding was never revoked', async () => {
            const service = await loadService()
            await service.bindToUser({ tenantId: 'tenant-1', issuer, subject: 'm1', identityId: 'i1', userId: 'u1' })
            await service.restoreBySubject({ issuer, subject: 'm1' })
            expect(state.userUpdates).toHaveLength(0)
        })
    })

    describe('listing', () => {
        it('lists only the bindings of the tenant', async () => {
            const service = await loadService()
            await service.prebind({ tenantId: 'tenant-1', issuer, subject: 'm1', role: TenantRole.MEMBER })
            await service.prebind({ tenantId: 'tenant-2', issuer, subject: 'm2', role: TenantRole.MEMBER })
            const listed = await service.listForTenant({ tenantId: 'tenant-1' })
            expect(listed.map((row) => row.subject)).toEqual(['m1'])
        })
    })

    describe('provisioning the OIDC configuration', () => {
        const oidc = { issuer, clientId: 'client', clientSecret: 'secret', extraAuthParams: { tenant: 'acme' } }

        it('writes a verified, enabled configuration that matches by subject', async () => {
            const service = await loadService()
            await service.upsertOidcConfigForProvisioning({ tenantId: 'tenant-1', oidc })
            const written = state.tenantUpdates[0].patch['federatedAuthProviders'] as { oidc: Record<string, unknown> }
            expect(written.oidc).toMatchObject({
                enabled: true,
                issuer,
                clientId: 'client',
                matchBy: SsoMatchBy.SUBJECT,
                provisioned: true,
                extraAuthParams: { tenant: 'acme' },
                autoCreateUsers: false,
                scopes: 'openid email profile',
                clientSecret: { data: 'enc:secret' },
            })
            expect(typeof written.oidc['verifiedAt']).toBe('string')
        })

        it('keeps what an administrator tuned and the earlier signing secret when provisioned again', async () => {
            const service = await loadService()
            state.tenantProviders = {
                saml: null,
                oidc: {
                    enabled: false, displayName: 'Mine', allowedDomains: ['acme.test'], autoCreateUsers: true, defaultRole: TenantRole.OPERATOR, roleMapping: null, defaultProject: null,
                    verifiedAt: null, lastLoginAt: '2026-11-01T00:00:00.000Z', issuer, clientId: 'old', clientSecret: { iv: 'i', data: 'enc:old' }, scopes: 'openid', emailClaim: 'email',
                    requireVerifiedEmail: false, sessionRecheckMinutes: 30, memberSubscription: { subscriptionId: 'sub-1', plainSecret: { iv: 'i', data: 'enc:kept' } },
                },
            }
            await service.upsertOidcConfigForProvisioning({ tenantId: 'tenant-1', oidc })
            const written = state.tenantUpdates[0].patch['federatedAuthProviders'] as { oidc: Record<string, unknown> }
            expect(written.oidc).toMatchObject({
                enabled: true, displayName: 'Mine', allowedDomains: ['acme.test'], autoCreateUsers: true, defaultRole: TenantRole.OPERATOR,
                lastLoginAt: '2026-11-01T00:00:00.000Z', clientId: 'client', sessionRecheckMinutes: 30, memberSubscription: { subscriptionId: 'sub-1', plainSecret: { data: 'enc:kept' } },
            })
        })

        it('writes the session recheck interval the platform asks for', async () => {
            const service = await loadService()
            await service.upsertOidcConfigForProvisioning({ tenantId: 'tenant-1', oidc: { ...oidc, sessionRecheckMinutes: 30 } })
            const written = state.tenantUpdates[0].patch['federatedAuthProviders'] as { oidc: Record<string, unknown> }
            expect(written.oidc['sessionRecheckMinutes']).toBe(30)
        })

        it('leaves the interval empty when none was asked for the first time', async () => {
            const service = await loadService()
            await service.upsertOidcConfigForProvisioning({ tenantId: 'tenant-1', oidc })
            const written = state.tenantUpdates[0].patch['federatedAuthProviders'] as { oidc: Record<string, unknown> }
            expect(written.oidc['sessionRecheckMinutes']).toBeNull()
        })

        it('replaces the interval when it is provisioned again with a new one', async () => {
            const service = await loadService()
            state.tenantProviders = { saml: null, oidc: { enabled: true, displayName: 'x', allowedDomains: [], autoCreateUsers: false, defaultRole: TenantRole.MEMBER, roleMapping: null, defaultProject: null, verifiedAt: null, lastLoginAt: null, issuer, clientId: 'c', clientSecret: { iv: 'i', data: 'enc:s' }, scopes: 'openid', emailClaim: 'email', requireVerifiedEmail: false, sessionRecheckMinutes: 30 } }
            await service.upsertOidcConfigForProvisioning({ tenantId: 'tenant-1', oidc: { ...oidc, sessionRecheckMinutes: 10 } })
            const written = state.tenantUpdates[0].patch['federatedAuthProviders'] as { oidc: Record<string, unknown> }
            expect(written.oidc['sessionRecheckMinutes']).toBe(10)
        })

        it('keeps the other providers of the tenant', async () => {
            const service = await loadService()
            state.tenantProviders = { saml: null, feishu: { appId: 'f' } }
            await service.upsertOidcConfigForProvisioning({ tenantId: 'tenant-1', oidc })
            const written = state.tenantUpdates[0].patch['federatedAuthProviders'] as Record<string, unknown>
            expect(written['feishu']).toEqual({ appId: 'f' })
        })
    })
})
