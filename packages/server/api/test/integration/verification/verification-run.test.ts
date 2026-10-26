import { FastifyInstance } from 'fastify'
import { SystemJobName } from '../../../src/app/helper/system-jobs/common'
import { systemJobHandlers } from '../../../src/app/helper/system-jobs/job-handlers'
import { createTestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance
beforeAll(async () => { app = await setupTestEnvironment() })
afterAll(async () => { await teardownTestEnvironment() })

describe('asynchronous result verification', () => {
    it('returns before checking and exposes the finished result through polling', async () => {
        const ctx = await createTestContext(app)
        const response = await ctx.post('/v1/verification/run', { projectId: ctx.project.id })
        expect(response.statusCode).toBe(200)
        const runId: string = response.json().runId
        expect(runId).toBeTruthy()
        const queued = await ctx.get(`/v1/verification/runs/${runId}`, { projectId: ctx.project.id })
        expect(queued.json()).toMatchObject({ status: 'QUEUED', result: null })
        await systemJobHandlers.getJobHandler(SystemJobName.VERIFY_RESULTS_MANUAL)({ runId, projectId: ctx.project.id, tenantId: ctx.tenant.id })
        const result = await ctx.get(`/v1/verification/runs/${runId}`, { projectId: ctx.project.id })
        expect(result.json()).toMatchObject({ status: 'SUCCEEDED', result: { checked: 0 } })
    })

    it('hides a run from another project', async () => {
        const owner = await createTestContext(app)
        const other = await createTestContext(app)
        const started = await owner.post('/v1/verification/run', { projectId: owner.project.id })
        const runId: string = started.json().runId
        const foreign = await other.get(`/v1/verification/runs/${runId}`, { projectId: other.project.id })
        expect(foreign.statusCode).toBe(404)
    })
})
