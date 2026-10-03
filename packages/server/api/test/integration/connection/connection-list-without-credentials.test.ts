import { ProjectType } from '@fema-ipaas/shared'
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

async function saveConnectionWithUnreadableCredentials({ ctx, displayName }: { ctx: TestContext, displayName: string }): Promise<string> {
    const mock = createMockConnection({ tenantId: ctx.tenant.id, projectIds: [ctx.project.id], connectorName: '@fema-ipaas/connector-slack', displayName }, ctx.user.id)
    const connection = { ...mock, value: { iv: 'not-a-real-iv', data: 'not-real-ciphertext' } }
    await db.save('connection', connection)
    return connection.id
}

describe('listing connections never touches their credentials', () => {
    it('lists a project page even when a credential on it cannot be decrypted, and sends no credentials', async () => {
        const ctx = await createTestContext(app!, { project: { type: ProjectType.TEAM } })
        const brokenId = await saveConnectionWithUnreadableCredentials({ ctx, displayName: 'Broken credentials' })

        const response = await ctx.get('/v1/connections', { projectId: ctx.project.id })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const [item] = response.json().data
        expect(item.id).toBe(brokenId)
        expect(item).not.toHaveProperty('value')
        expect(item.workflowIds).toEqual([])
        expect(item.owner).toMatchObject({ id: ctx.user.id })
    })

    it('does the same for the tenant level listing', async () => {
        const ctx = await createTestContext(app!, { project: { type: ProjectType.TEAM } })
        await saveConnectionWithUnreadableCredentials({ ctx, displayName: 'Broken credentials' })

        const response = await ctx.get('/v1/tenant-connections')

        expect(response.statusCode).toBe(StatusCodes.OK)
        const [item] = response.json().data
        expect(item).not.toHaveProperty('value')
        expect(item.projects.map((project: { id: string }) => project.id)).toEqual([ctx.project.id])
    })
})
