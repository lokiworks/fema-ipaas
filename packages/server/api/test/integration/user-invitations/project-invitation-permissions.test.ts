import { DefaultProjectRole, InvitationStatus, InvitationType, ProjectType, TenantRole } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { db } from '../../helpers/db'
import { createMockUserInvitation } from '../../helpers/mocks'
import { createMemberContext, createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createTeamProjectContext(): Promise<TestContext> {
    return createTestContext(app!, { project: { type: ProjectType.TEAM } })
}

async function savePendingProjectInvitation({ owner }: { owner: TestContext }): Promise<string> {
    const invitation = createMockUserInvitation({
        tenantId: owner.tenant.id,
        projectId: owner.project.id,
        type: InvitationType.PROJECT,
        status: InvitationStatus.PENDING,
        email: `${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    })
    await db.save('user_invitation', { ...invitation, projectRoleId: DefaultProjectRole.VIEWER })
    return invitation.id
}

describe('POST /v1/user-invitations (project)', () => {
    it.each([DefaultProjectRole.VIEWER, DefaultProjectRole.OPERATOR, DefaultProjectRole.DEVELOPER])('rejects %s inviting anyone as project admin', async (role) => {
        const owner = await createTeamProjectContext()
        const member = await createMemberContext(app!, owner, { projectRole: role })

        const response = await member.post('/v1/user-invitations', {
            type: InvitationType.PROJECT,
            email: 'someone-new@example.com',
            projectId: owner.project.id,
            projectRole: DefaultProjectRole.ADMIN,
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('does not let a viewer promote themselves by inviting their own email', async () => {
        const owner = await createTeamProjectContext()
        const viewer = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })

        const response = await viewer.post('/v1/user-invitations', {
            type: InvitationType.PROJECT,
            email: viewer.userIdentity.email,
            projectId: owner.project.id,
            projectRole: DefaultProjectRole.ADMIN,
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
        const membership = await db.findOneBy<{ role: string }>('project_member', { userId: viewer.user.id, projectId: owner.project.id })
        expect(membership?.role).toBe(DefaultProjectRole.VIEWER)
    })

    it('lets a project admin invite', async () => {
        const owner = await createTeamProjectContext()
        const admin = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.ADMIN })

        const response = await admin.post('/v1/user-invitations', {
            type: InvitationType.PROJECT,
            email: 'invited-by-admin@example.com',
            projectId: owner.project.id,
            projectRole: DefaultProjectRole.VIEWER,
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)
        expect(response.json().status).toBe(InvitationStatus.PENDING)
    })

    it('rejects a tenant member who is not in the project', async () => {
        const owner = await createTeamProjectContext()
        const other = await createTeamProjectContext()

        const response = await other.post('/v1/user-invitations', {
            type: InvitationType.PROJECT,
            email: 'cross-tenant@example.com',
            projectId: owner.project.id,
            projectRole: DefaultProjectRole.VIEWER,
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
})

describe('GET /v1/user-invitations', () => {
    it('lets any project member read the project invitations', async () => {
        const owner = await createTeamProjectContext()
        const viewer = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })
        await savePendingProjectInvitation({ owner })

        const response = await viewer.get('/v1/user-invitations', { type: InvitationType.PROJECT, projectId: owner.project.id })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.json().data).toHaveLength(1)
    })

    it('hides project invitations from someone who is not a project member', async () => {
        const owner = await createTeamProjectContext()
        const outsider = await createTeamProjectContext()
        await savePendingProjectInvitation({ owner })

        const sameTenantNonMember = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })
        await databaseConnection().getRepository('project_member').delete({ userId: sameTenantNonMember.user.id })

        const fromOtherTenant = await outsider.get('/v1/user-invitations', { type: InvitationType.PROJECT, projectId: owner.project.id })
        const fromSameTenant = await sameTenantNonMember.get('/v1/user-invitations', { type: InvitationType.PROJECT, projectId: owner.project.id })

        expect(fromOtherTenant.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(fromSameTenant.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('requires a project id for project invitations', async () => {
        const owner = await createTeamProjectContext()
        const viewer = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })

        const response = await viewer.get('/v1/user-invitations', { type: InvitationType.PROJECT })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('limits the tenant invitation list to tenant admins', async () => {
        const owner = await createTeamProjectContext()
        const member = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.ADMIN })

        const asMember = await member.get('/v1/user-invitations', { type: InvitationType.TENANT })
        const asAdmin = await owner.get('/v1/user-invitations', { type: InvitationType.TENANT })

        expect(asMember.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(asAdmin.statusCode).toBe(StatusCodes.OK)
    })
})

describe('DELETE /v1/user-invitations/:id', () => {
    it('rejects a viewer revoking a project invitation', async () => {
        const owner = await createTeamProjectContext()
        const viewer = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })
        const invitationId = await savePendingProjectInvitation({ owner })

        const response = await viewer.delete(`/v1/user-invitations/${invitationId}`)

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(await db.findOneBy('user_invitation', { id: invitationId })).not.toBeNull()
    })

    it('lets a project admin revoke it', async () => {
        const owner = await createTeamProjectContext()
        const admin = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.ADMIN })
        const invitationId = await savePendingProjectInvitation({ owner })

        const response = await admin.delete(`/v1/user-invitations/${invitationId}`)

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
        expect(await db.findOneBy('user_invitation', { id: invitationId })).toBeNull()
    })

    it('does not reveal invitations of another tenant', async () => {
        const owner = await createTeamProjectContext()
        const outsider = await createTeamProjectContext()
        const invitationId = await savePendingProjectInvitation({ owner })

        const response = await outsider.delete(`/v1/user-invitations/${invitationId}`)

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('limits revoking tenant invitations to tenant admins', async () => {
        const owner = await createTeamProjectContext()
        const member = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.ADMIN })
        const invitation = createMockUserInvitation({ tenantId: owner.tenant.id, type: InvitationType.TENANT, status: InvitationStatus.PENDING, tenantRole: TenantRole.MEMBER })
        await db.save('user_invitation', invitation)

        const response = await member.delete(`/v1/user-invitations/${invitation.id}`)

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
})
