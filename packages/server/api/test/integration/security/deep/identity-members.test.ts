import { generateId } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, InvitationStatus, InvitationType, TenantRole } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { db } from '../../../helpers/db'
import { createMockProjectMember, createMockUserInvitation } from '../../../helpers/mocks'
import { setupTestEnvironment } from '../../../helpers/test-setup'
import { identitySeed } from '../support/identity-seed'
import { Identity, securityWorld, World } from '../support/world'

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

async function membershipOf({ userId, projectId }: { userId: string, projectId: string }): Promise<{ role: DefaultProjectRole } | null> {
    return db.findOneBy<{ role: DefaultProjectRole }>('project_member', { userId, projectId })
}

async function seedInvitation({ projectId, tenantId, type }: { projectId: string | null, tenantId: string, type: InvitationType }): Promise<string> {
    const invitation = createMockUserInvitation({
        tenantId,
        projectId,
        type,
        status: InvitationStatus.PENDING,
        email: `${generateId()}@example.com`.toLowerCase(),
    })
    await db.save('user_invitation', { ...invitation, projectRoleId: type === InvitationType.PROJECT ? DefaultProjectRole.VIEWER : null, tenantRole: type === InvitationType.TENANT ? TenantRole.MEMBER : null })
    return invitation.id
}

describe('project members: crossing project and tenant boundaries', () => {
    it('does not let the admin of project A add a member to project B by pointing the body at B', async () => {
        const w = currentWorld()
        const user = await identitySeed.tenantUser({ world: w })

        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: '/v1/project-members', body: { projectId: w.scopes.B.project.id, userId: user.id, role: DefaultProjectRole.ADMIN } },
        })

        expect(response.status).toBe(403)
        expect(await membershipOf({ userId: user.id, projectId: w.scopes.B.project.id })).toBeNull()
    })

    it('does not let the admin of project A remove a member of project B by passing projectId=A with the id of the B member', async () => {
        const w = currentWorld()
        const user = await identitySeed.tenantUser({ world: w })
        const member = createMockProjectMember({ userId: user.id, projectId: w.scopes.B.project.id, role: DefaultProjectRole.DEVELOPER })
        await db.save('project_member', member)

        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'DELETE', url: `/v1/project-members/${member.id}`, query: { projectId: w.scopes.A.project.id } },
        })

        expect(response.status).toBe(404)
        expect(await membershipOf({ userId: user.id, projectId: w.scopes.B.project.id })).not.toBeNull()
    })

    it('does not let a project admin add a user of another tenant as a member', async () => {
        const w = currentWorld()
        const foreignUser = await identitySeed.tenantUser({ world: w, scope: 'T2' })

        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: '/v1/project-members', body: { projectId: w.scopes.A.project.id, userId: foreignUser.id, role: DefaultProjectRole.VIEWER } },
        })

        expect(response.status).toBe(404)
        expect(await membershipOf({ userId: foreignUser.id, projectId: w.scopes.A.project.id })).toBeNull()
    })

    it.each<Identity>(['developer', 'operator', 'viewer'])('does not let a %s promote themselves to project admin', async (identity) => {
        const w = currentWorld()
        const actor = w.actors[identity]
        const userId = actor.userId as string
        const before = await membershipOf({ userId, projectId: w.scopes.A.project.id })

        const response = await w.send({
            identity,
            request: { method: 'POST', url: '/v1/project-members', body: { projectId: w.scopes.A.project.id, userId, role: DefaultProjectRole.ADMIN } },
        })

        expect(response.status).toBe(403)
        expect((await membershipOf({ userId, projectId: w.scopes.A.project.id }))?.role).toBe(before?.role)
    })

    it('does not let a viewer remove another member', async () => {
        const w = currentWorld()
        const developerId = w.actors.developer.userId as string
        const member = await membershipOf({ userId: developerId, projectId: w.scopes.A.project.id })
        const memberRow = await db.findOneBy<{ id: string }>('project_member', { userId: developerId, projectId: w.scopes.A.project.id })

        const response = await w.send({
            identity: 'viewer',
            request: { method: 'DELETE', url: `/v1/project-members/${memberRow?.id}`, query: { projectId: w.scopes.A.project.id } },
        })

        expect(response.status).toBe(403)
        expect(member).not.toBeNull()
        expect(await membershipOf({ userId: developerId, projectId: w.scopes.A.project.id })).not.toBeNull()
    })

    it('keeps the project administrable by the tenant admin and the owner after the last project admin demotes themselves and leaves', async () => {
        const w = currentWorld()
        const project = await identitySeed.freshTeamProject({ world: w, scope: 'B' })
        const adminId = w.actors.foreignProjectAdmin.userId as string

        const demote = await w.send({
            identity: 'foreignProjectAdmin',
            request: { method: 'POST', url: '/v1/project-members', body: { projectId: project.id, userId: adminId, role: DefaultProjectRole.VIEWER } },
        })
        const afterDemotion = await w.send({
            identity: 'foreignProjectAdmin',
            request: { method: 'POST', url: '/v1/project-members', body: { projectId: project.id, userId: adminId, role: DefaultProjectRole.ADMIN } },
        })
        const tenantAdminStillManages = await w.send({
            identity: 'tenantAdmin',
            request: { method: 'POST', url: '/v1/project-members', body: { projectId: project.id, userId: adminId, role: DefaultProjectRole.ADMIN } },
        })

        expect(demote.status).toBe(200)
        expect(afterDemotion.status).toBe(403)
        expect(tenantAdminStillManages.status).toBe(200)
        expect((await membershipOf({ userId: adminId, projectId: project.id }))?.role).toBe(DefaultProjectRole.ADMIN)
    })
})

describe('invitations: crossing project, type and tenant boundaries', () => {
    it('does not let the admin of project A invite someone into project B', async () => {
        const w = currentWorld()
        const email = `${generateId()}@example.com`.toLowerCase()

        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: '/v1/user-invitations', body: { type: InvitationType.PROJECT, email, projectId: w.scopes.B.project.id, projectRole: DefaultProjectRole.ADMIN } },
        })

        expect(response.status).toBe(403)
        expect(await db.findOneBy('user_invitation', { email })).toBeNull()
    })

    it('does not let a project admin send a tenant-level invitation', async () => {
        const w = currentWorld()
        const email = `${generateId()}@example.com`.toLowerCase()

        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: '/v1/user-invitations', body: { type: InvitationType.TENANT, email, tenantRole: TenantRole.ADMIN } },
        })

        expect(response.status).toBe(403)
        expect(await db.findOneBy('user_invitation', { email })).toBeNull()
    })

    it('does not auto-accept a project invitation for an existing tenant user when the sender is not a project admin', async () => {
        const w = currentWorld()
        const existing = await identitySeed.tenantUser({ world: w })
        const identityRow = await db.findOneBy<{ email: string }>('user_identity', { id: (await db.findOneBy<{ identityId: string }>('user', { id: existing.id }))?.identityId as string })

        const response = await w.send({
            identity: 'developer',
            request: { method: 'POST', url: '/v1/user-invitations', body: { type: InvitationType.PROJECT, email: identityRow?.email, projectId: w.scopes.A.project.id, projectRole: DefaultProjectRole.ADMIN } },
        })

        expect(response.status).toBe(403)
        expect(await membershipOf({ userId: existing.id, projectId: w.scopes.A.project.id })).toBeNull()
    })

    it('does not list the invitations of project B to the admin of project A, nor to the same tenant non member', async () => {
        const w = currentWorld()
        await seedInvitation({ projectId: w.scopes.B.project.id, tenantId: w.scopes.B.tenant.id, type: InvitationType.PROJECT })

        const fromAdminA = await w.send({ identity: 'projectAdmin', request: { method: 'GET', url: '/v1/user-invitations', query: { type: InvitationType.PROJECT, projectId: w.scopes.B.project.id } } })
        const fromNonMember = await w.send({ identity: 'nonMember', request: { method: 'GET', url: '/v1/user-invitations', query: { type: InvitationType.PROJECT, projectId: w.scopes.B.project.id } } })
        const withoutProject = await w.send({ identity: 'projectAdmin', request: { method: 'GET', url: '/v1/user-invitations', query: { type: InvitationType.PROJECT } } })

        expect(fromAdminA.status).toBe(403)
        expect(fromNonMember.status).toBe(403)
        expect(withoutProject.status).toBe(403)
    })

    it('does not list tenant invitations through the project listing by claiming type PROJECT with the tenant listing parameters', async () => {
        const w = currentWorld()
        const tenantInvitationId = await seedInvitation({ projectId: null, tenantId: w.scopes.A.tenant.id, type: InvitationType.TENANT })

        const projectListing = await w.send({ identity: 'projectAdmin', request: { method: 'GET', url: '/v1/user-invitations', query: { type: InvitationType.PROJECT, projectId: w.scopes.A.project.id } } })
        const tenantListingByProjectAdmin = await w.send({ identity: 'projectAdmin', request: { method: 'GET', url: '/v1/user-invitations', query: { type: InvitationType.TENANT, projectId: w.scopes.A.project.id } } })

        expect(projectListing.status).toBe(200)
        expect(projectListing.text).not.toContain(tenantInvitationId)
        expect(tenantListingByProjectAdmin.status).toBe(403)
    })

    it('does not let anyone but the right admin revoke an invitation', async () => {
        const w = currentWorld()
        const projectBInvitation = await seedInvitation({ projectId: w.scopes.B.project.id, tenantId: w.scopes.B.tenant.id, type: InvitationType.PROJECT })
        const tenantInvitation = await seedInvitation({ projectId: null, tenantId: w.scopes.A.tenant.id, type: InvitationType.TENANT })
        const projectAInvitation = await seedInvitation({ projectId: w.scopes.A.project.id, tenantId: w.scopes.A.tenant.id, type: InvitationType.PROJECT })

        const adminAOnB = await w.send({ identity: 'projectAdmin', request: { method: 'DELETE', url: `/v1/user-invitations/${projectBInvitation}` } })
        const adminAOnTenant = await w.send({ identity: 'projectAdmin', request: { method: 'DELETE', url: `/v1/user-invitations/${tenantInvitation}` } })
        const viewerOnA = await w.send({ identity: 'viewer', request: { method: 'DELETE', url: `/v1/user-invitations/${projectAInvitation}` } })
        const foreignTenant = await w.send({ identity: 'otherTenantAdmin', request: { method: 'DELETE', url: `/v1/user-invitations/${projectAInvitation}` } })
        const anonymous = await w.send({ identity: 'anonymous', request: { method: 'DELETE', url: `/v1/user-invitations/${projectAInvitation}` } })

        expect([adminAOnB.status, adminAOnTenant.status, viewerOnA.status]).toEqual([403, 403, 403])
        expect(foreignTenant.status).toBe(404)
        expect(anonymous.status).toBe(403)
        expect(await db.findOneBy('user_invitation', { id: projectBInvitation })).not.toBeNull()
        expect(await db.findOneBy('user_invitation', { id: tenantInvitation })).not.toBeNull()
        expect(await db.findOneBy('user_invitation', { id: projectAInvitation })).not.toBeNull()
    })

    it.each([
        ['a made up token', 'not-a-token'],
        ['an access token of a user', 'USER_ACCESS_TOKEN'],
    ])('does not accept an invitation with %s', async (_name, token) => {
        const w = currentWorld()
        const actualToken = token === 'USER_ACCESS_TOKEN' ? (w.actors.projectAdmin.token as string) : token

        const response = await w.send({ identity: 'anonymous', request: { method: 'POST', url: '/v1/user-invitations/accept', body: { invitationToken: actualToken } } })

        expect(response.status).toBe(404)
    })
})
