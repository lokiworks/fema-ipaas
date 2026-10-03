import { generateId, Permission } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, InvitationType, PersonalAccessTokenExpiry, TenantRole } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { identitySeed } from '../support/identity-seed'
import { MatrixCase } from '../support/matrix'

function tokenName(): string {
    return `sec-${generateId()}`.slice(0, 20)
}

const channel = { im: true, email: false }

export const identityAccountCases: MatrixCase[] = [
    {
        id: 'GET /v1/account/access-tokens',
        access: { type: 'authenticated' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/account/access-tokens' } }),
    },
    {
        id: 'POST /v1/account/access-tokens',
        access: { type: 'authenticated' },
        expectOk: [201],
        prepare: async () => ({
            request: { method: 'POST', url: '/v1/account/access-tokens', body: { name: tokenName(), expiry: PersonalAccessTokenExpiry.DAYS_30 } },
        }),
    },
    {
        id: 'DELETE /v1/account/access-tokens/:id',
        label: 'only the owner can revoke a token',
        access: { type: 'custom', allow: ['projectAdmin'] },
        expectOk: [204],
        prepare: async ({ world }) => {
            const token = await identitySeed.personalAccessToken({ world, identity: 'projectAdmin' })
            return { request: { method: 'DELETE', url: `/v1/account/access-tokens/${token.id}` }, state: { tokenId: token.id } }
        },
        afterDenied: async ({ prepared }) => {
            const stillThere = await db.findOneBy('personal_access_token', { id: String(prepared.state?.tokenId) })
            expect(stillThere).not.toBeNull()
        },
    },
    {
        id: 'GET /v1/account/notification-preferences',
        access: { type: 'authenticated' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/account/notification-preferences' } }),
    },
    {
        id: 'POST /v1/account/notification-preferences',
        access: { type: 'authenticated' },
        prepare: async () => ({
            request: { method: 'POST', url: '/v1/account/notification-preferences', body: { runFailed: channel, connectionBroken: channel, projectMemberAdded: channel, weeklyDigest: channel } },
        }),
    },
    {
        id: 'POST /v1/account/profile',
        access: { type: 'authenticated' },
        expectOk: [204],
        prepare: async () => ({ request: { method: 'POST', url: '/v1/account/profile', body: { name: 'Sec Test' } } }),
    },
]

export const identityInvitationCases: MatrixCase[] = [
    {
        id: 'POST /v1/user-invitations',
        label: 'project invitation',
        access: { type: 'project', permission: Permission.WRITE_INVITATION },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const email = `${generateId()}@example.com`.toLowerCase()
            return {
                request: {
                    method: 'POST',
                    url: '/v1/user-invitations',
                    body: { type: InvitationType.PROJECT, email, projectId: world.scopes[scope].project.id, projectRole: DefaultProjectRole.VIEWER },
                },
                state: { email },
            }
        },
        afterDenied: async ({ prepared }) => {
            const created = await db.findOneBy('user_invitation', { email: String(prepared.state?.email) })
            expect(created).toBeNull()
        },
    },
    {
        id: 'POST /v1/user-invitations',
        label: 'tenant invitation',
        access: { type: 'tenantAdminSelf' },
        expectOk: [201],
        prepare: async () => ({
            request: { method: 'POST', url: '/v1/user-invitations', body: { type: InvitationType.TENANT, email: `${generateId()}@example.com`, tenantRole: TenantRole.MEMBER } },
        }),
    },
    {
        id: 'GET /v1/user-invitations',
        label: 'project invitation list',
        access: { type: 'project', permission: Permission.READ_INVITATION },
        scopedRead: true,
        prepare: async ({ world, scope }) => ({
            request: { method: 'GET', url: '/v1/user-invitations', query: { type: InvitationType.PROJECT, projectId: world.scopes[scope].project.id } },
        }),
    },
    {
        id: 'GET /v1/user-invitations',
        label: 'tenant invitation list',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({
            request: { method: 'GET', url: '/v1/user-invitations', query: { type: InvitationType.TENANT } },
        }),
    },
]
