import { ConnectionSharePermission, ConnectionStatus, DefaultProjectRole, NotificationType } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../src/app/database/database-connection'
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

async function saveOwnedConnection({ ctx, status }: { ctx: TestContext, status: ConnectionStatus }): Promise<string> {
    const connection = {
        ...createMockConnection({ tenantId: ctx.tenant.id, projectIds: [ctx.project.id], displayName: 'Feishu prod' }, ctx.user.id),
        status,
        projectMembersPermission: ConnectionSharePermission.USE,
    }
    await db.save('connection', connection)
    return connection.id
}

async function notificationsFor(userId: string): Promise<{ type: string, title: string }[]> {
    return databaseConnection().getRepository('notification').find({ where: { recipientId: userId, type: NotificationType.CONNECTION_REAUTH_REQUESTED } }) as Promise<{ type: string, title: string }[]>
}

describe('POST /v1/connections/:id/remind-reauth', () => {
    it('notifies the owner once and rate limits repeat reminders from the same member', async () => {
        const owner = await createTestContext(app!)
        const member = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.OPERATOR })
        const connectionId = await saveOwnedConnection({ ctx: owner, status: ConnectionStatus.EXPIRED })

        const first = await member.post(`/v1/connections/${connectionId}/remind-reauth`)
        const second = await member.post(`/v1/connections/${connectionId}/remind-reauth`)

        expect(first.statusCode).toBe(StatusCodes.OK)
        expect(first.json().reminded).toBe(true)
        expect(second.statusCode).toBe(StatusCodes.OK)
        expect(second.json().reminded).toBe(false)
        const received = await notificationsFor(owner.user.id)
        expect(received).toHaveLength(1)
        expect(received[0].title).toBe('Feishu prod')
    })

    it('refuses when the connection still works', async () => {
        const owner = await createTestContext(app!)
        const member = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.OPERATOR })
        const connectionId = await saveOwnedConnection({ ctx: owner, status: ConnectionStatus.ACTIVE })

        const response = await member.post(`/v1/connections/${connectionId}/remind-reauth`)

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(await notificationsFor(owner.user.id)).toHaveLength(0)
    })

    it('refuses when the owner asks themselves', async () => {
        const owner = await createTestContext(app!)
        const connectionId = await saveOwnedConnection({ ctx: owner, status: ConnectionStatus.EXPIRED })

        const response = await owner.post(`/v1/connections/${connectionId}/remind-reauth`)

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('does not let someone outside the tenant remind', async () => {
        const owner = await createTestContext(app!)
        const outsider = await createTestContext(app!)
        const connectionId = await saveOwnedConnection({ ctx: owner, status: ConnectionStatus.EXPIRED })

        const response = await outsider.post(`/v1/connections/${connectionId}/remind-reauth`)

        expect([StatusCodes.NOT_FOUND, StatusCodes.FORBIDDEN]).toContain(response.statusCode)
        expect(await notificationsFor(owner.user.id)).toHaveLength(0)
    })
})
