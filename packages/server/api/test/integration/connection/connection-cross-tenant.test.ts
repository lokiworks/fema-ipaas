import { ConnectionSharePermission, ConnectionStatus, ProjectType } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../helpers/db'
import { createMockConnection } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
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

async function saveSharedBrokenConnection({ ctx }: { ctx: TestContext }): Promise<string> {
    const connection = {
        ...createMockConnection({ tenantId: ctx.tenant.id, projectIds: [ctx.project.id], connectorName: '@fema-ipaas/connector-slack' }, ctx.user.id),
        status: ConnectionStatus.EXPIRED,
        projectMembersPermission: ConnectionSharePermission.EDIT,
    }
    await db.save('connection', connection)
    return connection.id
}

describe('connections across tenants', () => {
    it('never lists or serves a connection of another tenant', async () => {
        const victim = await createTeamContext()
        const attacker = await createTeamContext()
        const connectionId = await saveSharedBrokenConnection({ ctx: victim })

        const accessible = await attacker.get('/v1/connections/accessible')
        const projectList = await attacker.get('/v1/connections', { projectId: victim.project.id })
        const projectListOwn = await attacker.get('/v1/connections', { projectId: attacker.project.id })
        const detail = await attacker.get(`/v1/connections/${connectionId}/detail`)
        const single = await attacker.get(`/v1/connections/${connectionId}`)

        expect(accessible.json().data).toHaveLength(0)
        expect(projectList.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(projectListOwn.json().data).toHaveLength(0)
        expect(detail.statusCode).toBe(StatusCodes.NOT_FOUND)
        expect([StatusCodes.NOT_FOUND, StatusCodes.FORBIDDEN]).toContain(single.statusCode)
    })

    it('refuses every mutating call on a connection of another tenant', async () => {
        const victim = await createTeamContext()
        const attacker = await createTeamContext()
        const connectionId = await saveSharedBrokenConnection({ ctx: victim })

        const responses = await Promise.all([
            attacker.post(`/v1/connections/${connectionId}`, { displayName: 'hijacked' }),
            attacker.post(`/v1/connections/${connectionId}/revalidate`),
            attacker.post(`/v1/connections/${connectionId}/remind-reauth`),
            attacker.post(`/v1/connections/${connectionId}/shares`, { userIds: [attacker.user.id], permission: ConnectionSharePermission.EDIT }),
            attacker.post(`/v1/connections/${connectionId}/access`, { allProjects: false, projectIds: [attacker.project.id], projectMembersPermission: null }),
            attacker.post(`/v1/connections/${connectionId}/access-impact`, { allProjects: false, projectIds: [attacker.project.id] }),
            attacker.delete(`/v1/connections/${connectionId}`),
            attacker.delete(`/v1/connections/${connectionId}/shares/${victim.user.id}`),
        ])

        responses.forEach((response) => {
            expect([StatusCodes.NOT_FOUND, StatusCodes.FORBIDDEN]).toContain(response.statusCode)
        })
        const untouched = await db.findOneByOrFail<{ displayName: string, projectIds: string[], projectMembersPermission: string }>('connection', { id: connectionId })
        expect(untouched.displayName).not.toBe('hijacked')
        expect(untouched.projectIds).toEqual([victim.project.id])
        expect(untouched.projectMembersPermission).toBe(ConnectionSharePermission.EDIT)
    })

    it('cannot write a connection into a project of another tenant', async () => {
        const victim = await createTeamContext()
        const attacker = await createTeamContext()

        const response = await attacker.post('/v1/connections', {
            projectId: victim.project.id,
            externalId: 'planted',
            displayName: 'planted',
            connectorName: '@fema-ipaas/connector-slack',
            type: 'SECRET_TEXT',
            value: { type: 'SECRET_TEXT', secret_text: 'x' },
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('keeps tenant level listings admin only and scoped to the tenant', async () => {
        const victim = await createTeamContext()
        const attacker = await createTeamContext()
        await saveSharedBrokenConnection({ ctx: victim })

        const tenantList = await attacker.get('/v1/tenant-connections')
        const owners = await attacker.get('/v1/tenant-connections/owners')

        expect(tenantList.statusCode).toBe(StatusCodes.OK)
        expect(tenantList.json().data).toHaveLength(0)
        expect(owners.json().data).toHaveLength(0)
    })
})
