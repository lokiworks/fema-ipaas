import { generateId } from '@fema-ipaas/core-utils'
import { PersonalAccessTokenExpiry, PrincipalType, TenantRole, UserStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import { setupTestEnvironment } from '../../../helpers/test-setup'
import { identitySeed } from '../support/identity-seed'
import { securityWorld, World } from '../support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

function currentWorld(): World {
    if (world === null) {
        throw new Error('world is not ready')
    }
    return world
}

async function userRow({ id }: { id: string }): Promise<{ tenantRole: TenantRole, status: UserStatus } | null> {
    return db.findOneBy<{ tenantRole: TenantRole, status: UserStatus }>('user', { id })
}

describe('tenant owner invariants', () => {
    it('keeps the tenant owner an admin when another admin tries to demote them through the user endpoint', async () => {
        const w = currentWorld()
        const secondAdmin = await identitySeed.tenantUser({ world: w, tenantRole: TenantRole.ADMIN })
        const secondAdminToken = await securityWorld.tokenFor({ user: secondAdmin, tenantId: w.scopes.A.tenant.id })
        const ownerId = w.scopes.A.ownerId

        const response = await w.sendAsToken({
            token: secondAdminToken,
            request: { method: 'POST', url: `/v1/users/${ownerId}`, body: { tenantRole: TenantRole.MEMBER } },
        })

        expect(response.status).not.toBe(200)
        expect((await userRow({ id: ownerId }))?.tenantRole).toBe(TenantRole.ADMIN)
    })

    it('keeps the tenant owner an admin when the owner demotes themselves through the user endpoint', async () => {
        const w = currentWorld()
        const ownerId = w.scopes.A.ownerId

        const response = await w.send({
            identity: 'tenantAdmin',
            request: { method: 'POST', url: `/v1/users/${ownerId}`, body: { tenantRole: TenantRole.MEMBER } },
        })

        expect(response.status).not.toBe(200)
        expect((await userRow({ id: ownerId }))?.tenantRole).toBe(TenantRole.ADMIN)
    })

    it('refuses to deactivate or delete the tenant owner through the user endpoints', async () => {
        const w = currentWorld()
        const ownerId = w.scopes.A.ownerId

        const deactivate = await w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: `/v1/users/${ownerId}`, body: { status: UserStatus.INACTIVE } } })
        const remove = await w.send({ identity: 'tenantAdmin', request: { method: 'DELETE', url: `/v1/users/${ownerId}` } })
        const removeViaAccess = await w.send({ identity: 'tenantAdmin', request: { method: 'DELETE', url: `/v1/tenant-access/members/${ownerId}` } })

        expect([deactivate.status, remove.status, removeViaAccess.status].every((status) => status >= 400)).toBe(true)
        expect((await userRow({ id: ownerId }))?.status).toBe(UserStatus.ACTIVE)
    })
})

describe('tenant admin endpoints across tenants', () => {
    it('does not let the admin of tenant 1 touch the users of tenant 2 through any user or access endpoint', async () => {
        const w = currentWorld()
        const foreignUser = await identitySeed.tenantUser({ world: w, scope: 'T2' })
        const requests = [
            { method: 'GET' as const, url: `/v1/users/${foreignUser.id}` },
            { method: 'POST' as const, url: `/v1/users/${foreignUser.id}`, body: { tenantRole: TenantRole.ADMIN } },
            { method: 'POST' as const, url: `/v1/tenant-access/members/${foreignUser.id}/access`, body: { tenantRole: TenantRole.ADMIN } },
            { method: 'POST' as const, url: `/v1/tenant-access/members/${foreignUser.id}/disable` },
            { method: 'POST' as const, url: `/v1/tenant-access/members/${foreignUser.id}/enable` },
            { method: 'POST' as const, url: `/v1/tenant-access/members/${foreignUser.id}/reset-password` },
            { method: 'DELETE' as const, url: `/v1/tenant-access/members/${foreignUser.id}` },
        ]

        const statuses = await Promise.all(requests.map(async (request) => (await w.send({ identity: 'tenantAdmin', request })).status))

        const idempotentDelete = await w.send({ identity: 'tenantAdmin', request: { method: 'DELETE', url: `/v1/users/${foreignUser.id}` } })

        expect(statuses.every((status) => status === 403 || status === 404)).toBe(true)
        expect(idempotentDelete.status).toBe(204)
        expect(await userRow({ id: foreignUser.id })).not.toBeNull()
        expect((await userRow({ id: foreignUser.id }))?.tenantRole).toBe(TenantRole.MEMBER)
        expect((await userRow({ id: foreignUser.id }))?.status).toBe(UserStatus.ACTIVE)
    })

    it('does not leak the member lists or settings of one tenant to the admin of the other', async () => {
        const w = currentWorld()
        const members = await w.send({ identity: 'otherTenantAdmin', request: { method: 'GET', url: '/v1/tenant-access/members' } })
        const users = await w.send({ identity: 'otherTenantAdmin', request: { method: 'GET', url: '/v1/users' } })
        const resources = await w.send({ identity: 'otherTenantAdmin', request: { method: 'GET', url: '/v1/tenant-access/resources' } })
        const projects = await w.send({ identity: 'otherTenantAdmin', request: { method: 'GET', url: '/v1/projects' } })
        const forbidden = [w.scopes.A.tenant.id, w.scopes.A.project.id, w.scopes.B.project.id, w.actors.viewer.userId as string, w.actors.projectAdmin.userId as string]

        ;[members, users, resources, projects].forEach((response) => {
            expect(response.status).toBe(200)
            forbidden.forEach((needle) => expect(response.text).not.toContain(needle))
        })
    })

    it('does not let ownership transfer move resources of another tenant', async () => {
        const w = currentWorld()
        const recipient = await identitySeed.tenantUser({ world: w })

        const response = await w.send({
            identity: 'tenantAdmin',
            request: { method: 'POST', url: '/v1/tenant-access/resources/transfer', body: { resources: [{ type: 'PROJECT', id: w.scopes.T2.project.id }], toUserId: recipient.id } },
        })

        expect(response.status).toBe(404)
        expect((await db.findOneBy<{ ownerId: string }>('project', { id: w.scopes.T2.project.id }))?.ownerId).toBe(w.scopes.T2.ownerId)
    })

    it('does not let a tenant admin read or change the tenant record of another tenant', async () => {
        const w = currentWorld()
        const read = await w.send({ identity: 'tenantAdmin', request: { method: 'GET', url: `/v1/tenants/${w.scopes.T2.tenant.id}` } })
        const write = await w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: `/v1/tenants/${w.scopes.T2.tenant.id}`, body: { welcomeText: 'pwned' } } })
        const switchTenant = await w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: '/v1/authentication/switch-tenant', body: { tenantId: w.scopes.T2.tenant.id } } })

        expect([read.status, write.status, switchTenant.status]).toEqual([403, 403, 403])
        expect((await db.findOneBy<{ welcomeText: string | null }>('tenant', { id: w.scopes.T2.tenant.id }))?.welcomeText ?? null).not.toBe('pwned')
    })

    it('does not let a tenant admin change the projects of another tenant', async () => {
        const w = currentWorld()
        const update = await w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: `/v1/projects/${w.scopes.T2.project.id}`, body: { description: 'pwned' } } })
        const remove = await w.send({ identity: 'tenantAdmin', request: { method: 'DELETE', url: `/v1/projects/${w.scopes.T2.project.id}` } })

        expect([update.status, remove.status].every((status) => status === 403 || status === 404)).toBe(true)
        const project = await db.findOneBy<{ description: string | null, deleted: string | null }>('project', { id: w.scopes.T2.project.id })
        expect(project?.description ?? null).not.toBe('pwned')
        expect(project?.deleted ?? null).toBeNull()
    })
})

describe('tenant operator role', () => {
    it('is not a tenant admin on any admin only endpoint', async () => {
        const w = currentWorld()
        const operator = await identitySeed.tenantUser({ world: w, tenantRole: TenantRole.OPERATOR })
        const token = await securityWorld.tokenFor({ user: operator, tenantId: w.scopes.A.tenant.id })
        const requests = [
            { method: 'GET' as const, url: '/v1/tenant-access/members' },
            { method: 'GET' as const, url: '/v1/tenant-access/login-security' },
            { method: 'GET' as const, url: '/v1/privacy-settings/erasures' },
            { method: 'GET' as const, url: '/v1/alerts/channels' },
            { method: 'GET' as const, url: '/v1/audit-events' },
            { method: 'GET' as const, url: '/v1/global-connections' },
            { method: 'GET' as const, url: '/v1/health/system' },
            { method: 'GET' as const, url: '/v1/worker-machines' },
            { method: 'POST' as const, url: `/v1/users/${operator.id}`, body: { tenantRole: TenantRole.ADMIN } },
            { method: 'POST' as const, url: `/v1/tenant-access/members/${w.actors.viewer.userId}/access`, body: { tenantRole: TenantRole.ADMIN } },
            { method: 'POST' as const, url: `/v1/projects/${w.scopes.A.project.id}`, body: { description: 'x' } },
        ]

        const statuses = await Promise.all(requests.map(async (request) => (await w.sendAsToken({ token, request })).status))

        expect(statuses).toEqual(requests.map(() => 403))
        expect((await userRow({ id: operator.id }))?.tenantRole).toBe(TenantRole.OPERATOR)
    })

    it('cannot open a project it is not a member of even though the project list shows it', async () => {
        const w = currentWorld()
        const operator = await identitySeed.tenantUser({ world: w, tenantRole: TenantRole.OPERATOR })
        const token = await securityWorld.tokenFor({ user: operator, tenantId: w.scopes.A.tenant.id })

        const list = await w.sendAsToken({ token, request: { method: 'GET', url: '/v1/projects' } })
        const workflows = await w.sendAsToken({ token, request: { method: 'GET', url: '/v1/workflows', query: { projectId: w.scopes.A.project.id } } })
        const members = await w.sendAsToken({ token, request: { method: 'GET', url: '/v1/project-members', query: { projectId: w.scopes.A.project.id } } })

        expect(list.status).toBe(200)
        expect([workflows.status, members.status]).toEqual([403, 403])
    })
})

describe('sessions and tokens', () => {
    it('stops honouring the session of a user who has been disabled', async () => {
        const w = currentWorld()
        const user = await identitySeed.tenantUser({ world: w })
        const token = await securityWorld.tokenFor({ user, tenantId: w.scopes.A.tenant.id })
        const before = await w.sendAsToken({ token, request: { method: 'GET', url: '/v1/account/access-tokens' } })

        const disable = await w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: `/v1/tenant-access/members/${user.id}/disable` } })
        const after = await w.sendAsToken({ token, request: { method: 'GET', url: '/v1/account/access-tokens' } })

        expect(before.status).toBe(200)
        expect(disable.status).toBe(200)
        expect(after.status).toBe(403)
    })

    it('stops honouring the personal access token of a user who has been disabled, revoked or expired', async () => {
        const w = currentWorld()
        const user = await identitySeed.tenantUser({ world: w })
        const sessionToken = await securityWorld.tokenFor({ user, tenantId: w.scopes.A.tenant.id })
        const created = await w.sendAsToken({ token: sessionToken, request: { method: 'POST', url: '/v1/account/access-tokens', body: { name: 'sec', expiry: PersonalAccessTokenExpiry.DAYS_30 } } })
        const created2 = await w.sendAsToken({ token: sessionToken, request: { method: 'POST', url: '/v1/account/access-tokens', body: { name: 'sec2', expiry: PersonalAccessTokenExpiry.DAYS_30 } } })
        const { token: first, value: firstValue } = created.json() as { token: { id: string }, value: string }
        const { token: second, value: secondValue } = created2.json() as { token: { id: string }, value: string }
        const works = await w.sendAsToken({ token: firstValue, request: { method: 'GET', url: '/v1/account/access-tokens' } })

        await w.sendAsToken({ token: sessionToken, request: { method: 'DELETE', url: `/v1/account/access-tokens/${first.id}` } })
        const revoked = await w.sendAsToken({ token: firstValue, request: { method: 'GET', url: '/v1/account/access-tokens' } })
        await db.update('personal_access_token', second.id, { expiresAt: new Date(Date.now() - 1000).toISOString() })
        const expired = await w.sendAsToken({ token: secondValue, request: { method: 'GET', url: '/v1/account/access-tokens' } })

        expect(works.status).toBe(200)
        expect(revoked.status).toBe(401)
        expect(expired.status).toBe(401)
    })

    it('gives a viewer personal access token no more power than the viewer session', async () => {
        const w = currentWorld()
        const created = await w.send({ identity: 'viewer', request: { method: 'POST', url: '/v1/account/access-tokens', body: { name: `v-${generateId()}`.slice(0, 20), expiry: PersonalAccessTokenExpiry.DAYS_30 } } })
        const { value } = created.json() as { value: string }

        const write = await w.sendAsToken({ token: value, request: { method: 'POST', url: '/v1/workflows', body: { displayName: 'x', projectId: w.scopes.A.project.id } } })
        const read = await w.sendAsToken({ token: value, request: { method: 'GET', url: '/v1/workflows', query: { projectId: w.scopes.A.project.id } } })
        const foreign = await w.sendAsToken({ token: value, request: { method: 'GET', url: '/v1/workflows', query: { projectId: w.scopes.B.project.id } } })

        expect([write.status, read.status, foreign.status]).toEqual([403, 200, 403])
    })

    it('rejects engine, worker and unknown principals on every user facing tenant endpoint sampled', async () => {
        const w = currentWorld()
        const engineToken = await generateMockToken({ id: generateId(), type: PrincipalType.ENGINE, projectId: w.scopes.A.project.id, tenant: { id: w.scopes.A.tenant.id } })
        const workerToken = await generateMockToken({ id: generateId(), type: PrincipalType.WORKER })
        const requests = [
            { method: 'GET' as const, url: '/v1/projects' },
            { method: 'GET' as const, url: '/v1/account/access-tokens' },
            { method: 'GET' as const, url: '/v1/tenant-access/members' },
            { method: 'GET' as const, url: '/v1/project-members', query: { projectId: w.scopes.A.project.id } },
            { method: 'GET' as const, url: '/v1/workflows', query: { projectId: w.scopes.A.project.id } },
            { method: 'POST' as const, url: '/v1/user-invitations', body: { type: 'TENANT', email: 'x@example.com', tenantRole: 'ADMIN' } },
        ]

        const engineStatuses = await Promise.all(requests.map(async (request) => (await w.sendAsToken({ token: engineToken, request })).status))
        const workerStatuses = await Promise.all(requests.map(async (request) => (await w.sendAsToken({ token: workerToken, request })).status))

        expect(engineStatuses).toEqual(requests.map(() => 403))
        expect(workerStatuses).toEqual(requests.map(() => 403))
    })

    it('rejects a token signed with a wrong secret, an expired token and a token claiming another tenant for the same user', async () => {
        const w = currentWorld()
        const userId = w.actors.viewer.userId as string
        const forged = await generateMockToken({ id: userId, type: PrincipalType.USER, tenant: { id: w.scopes.A.tenant.id } })
        const tampered = `${forged.slice(0, -4)}AAAA`
        const claimingForeignTenant = await generateMockToken({ id: userId, type: PrincipalType.USER, tenant: { id: w.scopes.T2.tenant.id } })

        const wrongSignature = await w.sendAsToken({ token: tampered, request: { method: 'GET', url: '/v1/projects' } })
        const foreignClaim = await w.sendAsToken({ token: claimingForeignTenant, request: { method: 'GET', url: '/v1/workflows', query: { projectId: w.scopes.A.project.id } } })
        const foreignClaimOwn = await w.sendAsToken({ token: claimingForeignTenant, request: { method: 'GET', url: '/v1/workflows', query: { projectId: w.scopes.T2.project.id } } })

        expect(wrongSignature.status).toBe(401)
        expect(foreignClaim.status).toBe(403)
        expect(foreignClaimOwn.status).toBe(403)
    })
})
