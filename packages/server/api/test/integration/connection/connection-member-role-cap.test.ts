import { ConnectionSharePermission, ConnectionStatus, DefaultProjectRole } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../helpers/db'
import { createMockConnection } from '../../helpers/mocks'
import { createMemberContext, createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function saveSharedWithMembers({ ctx, permission }: { ctx: TestContext, permission: ConnectionSharePermission }): Promise<string> {
    const connection = {
        ...createMockConnection({ tenantId: ctx.tenant.id, projectIds: [ctx.project.id], displayName: 'Shared prod' }, ctx.user.id),
        status: ConnectionStatus.ACTIVE,
        projectMembersPermission: permission,
    }
    await db.save('connection', connection)
    return connection.id
}

async function permissionSeenBy({ member, connectionId }: { member: TestContext, connectionId: string }): Promise<string | undefined> {
    const response = await member.get('/v1/connections/accessible', { availableInProjectId: member.project.id })
    expect(response.statusCode).toBe(StatusCodes.OK)
    return response.json().data.find((entry: { id: string }) => entry.id === connectionId)?.myPermission
}

describe('Project members permission on a connection', () => {
    it('lets an editor of the project edit but only lets a viewer use it', async () => {
        const owner = await createTestContext(app!)
        const connectionId = await saveSharedWithMembers({ ctx: owner, permission: ConnectionSharePermission.EDIT })
        const developer = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.DEVELOPER })
        const viewer = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })

        expect(await permissionSeenBy({ member: developer, connectionId })).toBe('EDIT')
        expect(await permissionSeenBy({ member: viewer, connectionId })).toBe('USE')
    })

    it('does not let the viewer rename or share it', async () => {
        const owner = await createTestContext(app!)
        const connectionId = await saveSharedWithMembers({ ctx: owner, permission: ConnectionSharePermission.EDIT })
        const viewer = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })

        const rename = await viewer.post(`/v1/connections/${connectionId}`, { displayName: 'Hijacked' })
        const share = await viewer.post(`/v1/connections/${connectionId}/shares`, { userIds: [viewer.user.id], permission: 'EDIT' })

        expect(rename.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(share.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
})
