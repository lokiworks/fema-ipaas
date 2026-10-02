import { generateId } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, NotificationType, ProjectType } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { db } from '../../helpers/db'
import { mockBasicUser } from '../../helpers/mocks'
import { createMemberContext, createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createTeamContext(): Promise<TestContext> {
    return createTestContext(app!, { project: { type: ProjectType.TEAM } })
}

async function createTenantUser({ ctx }: { ctx: TestContext }): Promise<string> {
    const { mockUser } = await mockBasicUser({ user: { tenantId: ctx.tenant.id } })
    return mockUser.id
}

describe('POST /v1/project-members', () => {
    it.each([DefaultProjectRole.DEVELOPER, DefaultProjectRole.OPERATOR, DefaultProjectRole.VIEWER])('rejects %s adding members', async (role) => {
        const owner = await createTeamContext()
        const member = await createMemberContext(app!, owner, { projectRole: role })
        const target = await createTenantUser({ ctx: owner })

        const response = await member.post('/v1/project-members', { projectId: owner.project.id, userId: target, role: DefaultProjectRole.ADMIN })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(await db.findOneBy('project_member', { userId: target, projectId: owner.project.id })).toBeNull()
    })

    it('adds a member, changes the role without a second row, and notifies only once', async () => {
        const owner = await createTeamContext()
        const target = await createTenantUser({ ctx: owner })

        const added = await owner.post('/v1/project-members', { projectId: owner.project.id, userId: target, role: DefaultProjectRole.VIEWER })
        const changed = await owner.post('/v1/project-members', { projectId: owner.project.id, userId: target, role: DefaultProjectRole.OPERATOR })

        expect(added.statusCode).toBe(StatusCodes.OK)
        expect(changed.statusCode).toBe(StatusCodes.OK)
        expect(changed.json().id).toBe(added.json().id)
        const rows = await databaseConnection().getRepository('project_member').findBy({ userId: target, projectId: owner.project.id })
        expect(rows).toHaveLength(1)
        expect(rows[0].role).toBe(DefaultProjectRole.OPERATOR)
        const notifications = await databaseConnection().getRepository('notification').findBy({ recipientId: target, type: NotificationType.PROJECT_MEMBER_ADDED })
        expect(notifications).toHaveLength(1)
    })

    it('answers 404 instead of a database error when the user does not exist', async () => {
        const owner = await createTeamContext()

        const response = await owner.post('/v1/project-members', { projectId: owner.project.id, userId: generateId(), role: DefaultProjectRole.VIEWER })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('refuses to add a user that belongs to another tenant', async () => {
        const owner = await createTeamContext()
        const otherTenant = await createTeamContext()

        const response = await owner.post('/v1/project-members', { projectId: owner.project.id, userId: otherTenant.user.id, role: DefaultProjectRole.ADMIN })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
        expect(await db.findOneBy('project_member', { userId: otherTenant.user.id, projectId: owner.project.id })).toBeNull()
    })

    it('does not let an admin of another tenant manage this project', async () => {
        const owner = await createTeamContext()
        const otherTenant = await createTeamContext()
        const target = await createTenantUser({ ctx: owner })

        const response = await otherTenant.post('/v1/project-members', { projectId: owner.project.id, userId: target, role: DefaultProjectRole.ADMIN })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('rejects a role that does not exist', async () => {
        const owner = await createTeamContext()
        const target = await createTenantUser({ ctx: owner })

        const response = await owner.post('/v1/project-members', { projectId: owner.project.id, userId: target, role: 'Superuser' })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })
})

describe('GET /v1/project-members', () => {
    it.each(Object.values(DefaultProjectRole))('lets a %s read the member list', async (role) => {
        const owner = await createTeamContext()
        const member = await createMemberContext(app!, owner, { projectRole: role })

        const response = await member.get('/v1/project-members', { projectId: owner.project.id })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.json().data.some((row: { userId: string }) => row.userId === member.user.id)).toBe(true)
    })

    it('hides the member list from another tenant and from non members', async () => {
        const owner = await createTeamContext()
        const otherTenant = await createTeamContext()
        const nonMember = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })
        await databaseConnection().getRepository('project_member').delete({ userId: nonMember.user.id })

        const fromOtherTenant = await otherTenant.get('/v1/project-members', { projectId: owner.project.id })
        const fromNonMember = await nonMember.get('/v1/project-members', { projectId: owner.project.id })

        expect(fromOtherTenant.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(fromNonMember.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
})

describe('DELETE /v1/project-members/:id', () => {
    it('rejects a viewer removing a member', async () => {
        const owner = await createTeamContext()
        const viewer = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })
        const target = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.OPERATOR })
        const row = await db.findOneByOrFail<{ id: string }>('project_member', { userId: target.user.id, projectId: owner.project.id })

        const response = await viewer.delete(`/v1/project-members/${row.id}`, undefined, { query: { projectId: owner.project.id } })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(await db.findOneBy('project_member', { id: row.id })).not.toBeNull()
    })

    it('removes a member, revokes access immediately, and cannot touch another project through a different projectId', async () => {
        const owner = await createTeamContext()
        const target = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.OPERATOR })
        const row = await db.findOneByOrFail<{ id: string }>('project_member', { userId: target.user.id, projectId: owner.project.id })
        const otherProject = await createTeamContext()
        await databaseConnection().getRepository('project_member').save({ id: generateId(), projectId: otherProject.project.id, userId: owner.user.id, role: DefaultProjectRole.ADMIN })

        const crossProject = await owner.delete(`/v1/project-members/${row.id}`, undefined, { query: { projectId: otherProject.project.id } })
        expect([StatusCodes.FORBIDDEN, StatusCodes.NOT_FOUND]).toContain(crossProject.statusCode)
        expect(await db.findOneBy('project_member', { id: row.id })).not.toBeNull()

        const removed = await owner.delete(`/v1/project-members/${row.id}`, undefined, { query: { projectId: owner.project.id } })
        expect(removed.statusCode).toBe(StatusCodes.NO_CONTENT)
        expect(await db.findOneBy('project_member', { id: row.id })).toBeNull()
        const afterwards = await target.get('/v1/connections', { projectId: owner.project.id })
        expect(afterwards.statusCode).toBe(StatusCodes.FORBIDDEN)
        const again = await owner.delete(`/v1/project-members/${row.id}`, undefined, { query: { projectId: owner.project.id } })
        expect(again.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
})

describe('GET /v1/project-members/me', () => {
    it.each(Object.values(DefaultProjectRole))('reports the %s role', async (role) => {
        const owner = await createTeamContext()
        const member = await createMemberContext(app!, owner, { projectRole: role })

        const response = await member.get('/v1/project-members/me', { projectId: owner.project.id })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.json().role).toBe(role)
    })
})
