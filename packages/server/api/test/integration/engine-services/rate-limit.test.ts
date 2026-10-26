import { generateId } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { db } from '../../helpers/db'
import { createMockProject } from '../../helpers/mocks'
import { generateMockToken } from '../../helpers/auth'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance

beforeAll(async () => { app = await setupTestEnvironment() })
afterAll(async () => { await teardownTestEnvironment() })

async function acquire({ ctx, payload }: { ctx: TestContext, payload: Record<string, unknown> }) {
    const token = await generateMockToken({ id: generateId(), type: PrincipalType.ENGINE, projectId: ctx.project.id, tenant: { id: ctx.tenant.id } })
    return app.inject({ method: 'POST', url: '/api/v1/engine/rate-limits/acquire', headers: { authorization: `Bearer ${token}` }, payload })
}

describe('engine rate limit endpoint', () => {
    it('rejects user credentials', async () => {
        const ctx = await createTestContext(app)
        const response = await ctx.post('/v1/engine/rate-limits/acquire', { bucket: 'api', scopeKey: 'app', perSecond: 1 })
        expect(response.statusCode).toBe(403)
    })

    it('takes the tenant from the engine token and shares a bucket across projects in that tenant', async () => {
        const a = await createTestContext(app)
        const b = await createTestContext(app)
        const bucket = generateId()
        const payload = { bucket, scopeKey: 'app', perSecond: 0.1, tenantId: b.tenant.id }
        const first = await acquire({ ctx: a, payload })
        const project = createMockProject({ tenantId: a.tenant.id, ownerId: a.user.id })
        await db.save('project', project)
        const second = await acquire({ ctx: { ...a, project }, payload })
        const foreign = await acquire({ ctx: b, payload })
        expect(first.statusCode).toBe(200)
        expect(first.json().waitMs).toBe(0)
        expect(second.json().waitMs).toBeGreaterThan(0)
        expect(foreign.json().waitMs).toBe(0)
    })

    it('rejects event references outside the engine project', async () => {
        const ctx = await createTestContext(app)
        const response = await acquire({ ctx, payload: {
            bucket: 'api', scopeKey: 'app', perSecond: 1,
            event: { executionId: 'foreign-run', workflowId: 'foreign-workflow', stepName: 's1', connectorName: 'test', eventKey: 'event1' },
        } })
        expect(response.statusCode).toBe(404)
    })

    it.each([0, -1, 10001])('rejects an invalid rate %s', async (perSecond) => {
        const ctx = await createTestContext(app)
        const response = await acquire({ ctx, payload: { bucket: 'invalid', scopeKey: 'app', perSecond } })
        expect(response.statusCode).toBe(400)
    })
})
