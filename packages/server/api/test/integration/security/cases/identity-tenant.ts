import { generateId } from '@fema-ipaas/core-utils'
import { ErasureSubjectKind, ModuleAccessRequestStatus, TenantModule, TenantRole, UserStatus } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { identitySeed } from '../support/identity-seed'
import { MatrixCase } from '../support/matrix'

const tenantAdminRead = (id: string, url: string): MatrixCase => ({
    id,
    access: { type: 'tenantAdminSelf' },
    prepare: async () => ({ request: { method: 'GET', url } }),
})

export const identityTenantCases: MatrixCase[] = [
    {
        id: 'GET /v1/tenants',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => (identity === 'otherTenantAdmin' ? [world.scopes.A.project.id, world.scopes.B.project.id] : [world.scopes.T2.project.id]),
        prepare: async () => ({ request: { method: 'GET', url: '/v1/tenants' } }),
    },
    {
        id: 'GET /v1/tenants/:id',
        access: { type: 'tenantMember' },
        prepare: async ({ world, scope }) => ({ request: { method: 'GET', url: `/v1/tenants/${world.scopes[scope].tenant.id}` } }),
    },
    {
        id: 'POST /v1/tenants/:id',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const welcomeText = `hi-${generateId()}`.slice(0, 20)
            return {
                request: { method: 'POST', url: `/v1/tenants/${world.scopes[scope].tenant.id}`, body: { welcomeText } },
                state: { tenantId: world.scopes[scope].tenant.id, welcomeText },
            }
        },
        afterDenied: async ({ prepared }) => {
            const tenant = await db.findOneBy<{ welcomeText: string | null }>('tenant', { id: String(prepared.state?.tenantId) })
            expect(tenant?.welcomeText ?? null).not.toBe(String(prepared.state?.welcomeText))
        },
    },
    {
        id: 'POST /v1/authentication/switch-tenant',
        access: { type: 'tenantMember' },
        prepare: async ({ world, scope }) => ({ request: { method: 'POST', url: '/v1/authentication/switch-tenant', body: { tenantId: world.scopes[scope].tenant.id } } }),
    },
    {
        id: 'GET /v1/users',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/users' } }),
    },
    {
        id: 'GET /v1/users/:id',
        access: { type: 'tenantMember' },
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            return { request: { method: 'GET', url: `/v1/users/${user.id}` } }
        },
    },
    {
        id: 'POST /v1/users/:id',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            return { request: { method: 'POST', url: `/v1/users/${user.id}`, body: { tenantRole: TenantRole.ADMIN } }, state: { userId: user.id } }
        },
        afterDenied: async ({ prepared }) => {
            const user = await db.findOneBy<{ tenantRole: TenantRole }>('user', { id: String(prepared.state?.userId) })
            expect(user?.tenantRole).toBe(TenantRole.MEMBER)
        },
    },
    {
        id: 'DELETE /v1/users/:id',
        label: 'deleting is idempotent, so another tenant gets a harmless 204 and nothing is deleted',
        access: { type: 'tenantAdmin' },
        expectOk: [204],
        alsoDeniedWith: [204],
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            return { request: { method: 'DELETE', url: `/v1/users/${user.id}` }, state: { userId: user.id } }
        },
        afterDenied: async ({ prepared }) => {
            const user = await db.findOneBy('user', { id: String(prepared.state?.userId) })
            expect(user).not.toBeNull()
        },
    },
    tenantAdminRead('GET /v1/tenant-access/members', '/v1/tenant-access/members'),
    tenantAdminRead('GET /v1/tenant-access/module-settings', '/v1/tenant-access/module-settings'),
    tenantAdminRead('GET /v1/tenant-access/requests', '/v1/tenant-access/requests'),
    tenantAdminRead('GET /v1/tenant-access/resources', '/v1/tenant-access/resources'),
    tenantAdminRead('GET /v1/tenant-access/login-security', '/v1/tenant-access/login-security'),
    {
        id: 'GET /v1/tenant-access/me',
        access: { type: 'authenticated' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/tenant-access/me' } }),
    },
    {
        id: 'POST /v1/tenant-access/me/requests',
        access: { type: 'authenticated' },
        expectOk: [201, 400, 409],
        prepare: async () => ({ request: { method: 'POST', url: '/v1/tenant-access/me/requests', body: { module: TenantModule.MCP_SERVICES, reason: 'need it' } } }),
    },
    {
        id: 'POST /v1/tenant-access/members/invite',
        access: { type: 'tenantAdminSelf' },
        expectOk: [201],
        prepare: async () => ({
            request: { method: 'POST', url: '/v1/tenant-access/members/invite', body: { emails: [`${generateId()}@example.com`], tenantRole: TenantRole.MEMBER, modules: [] } },
        }),
    },
    {
        id: 'POST /v1/tenant-access/members/:id/access',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            return { request: { method: 'POST', url: `/v1/tenant-access/members/${user.id}/access`, body: { tenantRole: TenantRole.ADMIN } }, state: { userId: user.id } }
        },
        afterDenied: async ({ prepared }) => {
            const user = await db.findOneBy<{ tenantRole: TenantRole }>('user', { id: String(prepared.state?.userId) })
            expect(user?.tenantRole).toBe(TenantRole.MEMBER)
        },
    },
    {
        id: 'POST /v1/tenant-access/members/:id/disable',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            return { request: { method: 'POST', url: `/v1/tenant-access/members/${user.id}/disable` }, state: { userId: user.id } }
        },
        afterDenied: async ({ prepared }) => {
            const user = await db.findOneBy<{ status: UserStatus }>('user', { id: String(prepared.state?.userId) })
            expect(user?.status).toBe(UserStatus.ACTIVE)
        },
    },
    {
        id: 'POST /v1/tenant-access/members/:id/enable',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            await db.update('user', user.id, { status: UserStatus.INACTIVE })
            return { request: { method: 'POST', url: `/v1/tenant-access/members/${user.id}/enable` }, state: { userId: user.id } }
        },
        afterDenied: async ({ prepared }) => {
            const user = await db.findOneBy<{ status: UserStatus }>('user', { id: String(prepared.state?.userId) })
            expect(user?.status).toBe(UserStatus.INACTIVE)
        },
    },
    {
        id: 'POST /v1/tenant-access/members/:id/reset-password',
        access: { type: 'tenantAdmin' },
        expectOk: [200, 400],
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            return { request: { method: 'POST', url: `/v1/tenant-access/members/${user.id}/reset-password` }, state: { userId: user.id } }
        },
    },
    {
        id: 'DELETE /v1/tenant-access/members/:id',
        access: { type: 'tenantAdmin' },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            return { request: { method: 'DELETE', url: `/v1/tenant-access/members/${user.id}` }, state: { userId: user.id } }
        },
        afterDenied: async ({ prepared }) => {
            const user = await db.findOneBy('user', { id: String(prepared.state?.userId) })
            expect(user).not.toBeNull()
        },
    },
    {
        id: 'POST /v1/tenant-access/resources/transfer',
        access: { type: 'tenantAdmin' },
        expectOk: [200],
        alsoDeniedWith: [409],
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            return {
                request: { method: 'POST', url: '/v1/tenant-access/resources/transfer', body: { resources: [{ type: 'PROJECT', id: world.scopes[scope].project.id }], toUserId: user.id } },
                state: { projectId: world.scopes[scope].project.id, userId: user.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const project = await db.findOneBy<{ ownerId: string }>('project', { id: String(prepared.state?.projectId) })
            expect(project?.ownerId).not.toBe(String(prepared.state?.userId))
        },
    },
    {
        id: 'POST /v1/tenant-access/module-settings',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({
            request: { method: 'POST', url: '/v1/tenant-access/module-settings', body: { allowRequests: true, deniedHint: 'ADMINS', url: null, personUserId: null, notice: '' } },
        }),
        expectOk: [200, 400],
    },
    {
        id: 'POST /v1/tenant-access/requests/:id/approve',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const requester = await identitySeed.tenantUser({ world, scope })
            const requestId = generateId()
            await db.save('module_access_request', { id: requestId, created: new Date().toISOString(), updated: new Date().toISOString(), tenantId: world.scopes[scope].tenant.id, userId: requester.id, module: TenantModule.MCP_SERVICES, reason: 'x', status: ModuleAccessRequestStatus.PENDING, decidedBy: null, decidedAt: null })
            return { request: { method: 'POST', url: `/v1/tenant-access/requests/${requestId}/approve` }, state: { requestId, userId: requester.id } }
        },
        afterDenied: async ({ prepared }) => {
            const request = await db.findOneBy<{ status: ModuleAccessRequestStatus }>('module_access_request', { id: String(prepared.state?.requestId) })
            expect(request?.status).toBe(ModuleAccessRequestStatus.PENDING)
        },
    },
    {
        id: 'POST /v1/tenant-access/requests/:id/reject',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const requester = await identitySeed.tenantUser({ world, scope })
            const requestId = generateId()
            await db.save('module_access_request', { id: requestId, created: new Date().toISOString(), updated: new Date().toISOString(), tenantId: world.scopes[scope].tenant.id, userId: requester.id, module: TenantModule.MCP_SERVICES, reason: 'x', status: ModuleAccessRequestStatus.PENDING, decidedBy: null, decidedAt: null })
            return { request: { method: 'POST', url: `/v1/tenant-access/requests/${requestId}/reject` }, state: { requestId } }
        },
        afterDenied: async ({ prepared }) => {
            const request = await db.findOneBy<{ status: ModuleAccessRequestStatus }>('module_access_request', { id: String(prepared.state?.requestId) })
            expect(request?.status).toBe(ModuleAccessRequestStatus.PENDING)
        },
    },
    {
        id: 'POST /v1/tenant-access/login-security',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'POST', url: '/v1/tenant-access/login-security', body: { sessionDurationDays: 7 } } }),
    },
    {
        id: 'GET /v1/privacy-settings',
        access: { type: 'authenticated' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/privacy-settings' } }),
    },
    tenantAdminRead('GET /v1/privacy-settings/erasures', '/v1/privacy-settings/erasures'),
    {
        id: 'POST /v1/privacy-settings',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({
            request: { method: 'POST', url: '/v1/privacy-settings', body: { logRetentionDays: 30, payloadLevel: 'FULL', rawPayloadRetentionDays: 7, maskRules: [], rawViewRoles: ['OWNER'], requireRawViewReason: false } },
        }),
        expectOk: [200, 400],
    },
    {
        id: 'POST /v1/privacy-settings/erasures',
        access: { type: 'tenantAdminSelf' },
        expectOk: [201],
        prepare: async () => ({
            request: { method: 'POST', url: '/v1/privacy-settings/erasures', body: { kind: ErasureSubjectKind.EMAIL, value: `${generateId()}@example.com`, reason: 'sec test' } },
        }),
    },
    {
        id: 'POST /v1/privacy-settings/erasures/:id/confirm',
        access: { type: 'tenantAdmin' },
        expectOk: [200, 400, 409],
        prepare: async ({ world, scope }) => {
            const created = await world.send({ identity: identitySeed.tenantAdminIdentityOf({ scope }), request: { method: 'POST', url: '/v1/privacy-settings/erasures', body: { kind: ErasureSubjectKind.EMAIL, value: `${generateId()}@example.com`, reason: 'sec test' } } })
            const id = (created.json() as { id: string }).id
            return { request: { method: 'POST', url: `/v1/privacy-settings/erasures/${id}/confirm` } }
        },
    },
    {
        id: 'POST /v1/privacy-settings/erasures/:id/cancel',
        access: { type: 'tenantAdmin' },
        expectOk: [200, 400, 409],
        prepare: async ({ world, scope }) => {
            const created = await world.send({ identity: identitySeed.tenantAdminIdentityOf({ scope }), request: { method: 'POST', url: '/v1/privacy-settings/erasures', body: { kind: ErasureSubjectKind.EMAIL, value: `${generateId()}@example.com`, reason: 'sec test' } } })
            const id = (created.json() as { id: string }).id
            return { request: { method: 'POST', url: `/v1/privacy-settings/erasures/${id}/cancel` } }
        },
    },
    {
        id: 'GET /v1/holiday-calendar',
        access: { type: 'authenticated' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/holiday-calendar' } }),
    },
    {
        id: 'POST /v1/holiday-calendar',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'POST', url: '/v1/holiday-calendar', body: { dates: ['2026-10-01'] } } }),
    },
]
