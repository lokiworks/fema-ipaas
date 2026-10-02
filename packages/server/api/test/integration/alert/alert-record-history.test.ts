import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../helpers/db'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createPolicy({ ctx, name }: { ctx: TestContext, name: string }): Promise<string> {
    const channel = await ctx.post('/v1/alerts/channels', { name: `${name}-channel`, type: 'WEBHOOK', url: 'https://example.com/hook' })
    const policy = await ctx.post('/v1/alerts/policies', {
        name,
        enabled: true,
        projectIds: [],
        workflowIds: [],
        events: ['ISSUE_NEW'],
        failureRate: null,
        capacityThresholdPercent: null,
        groupWindowMinutes: 30,
        quietHours: { enabled: false, from: '22:00', to: '08:00', timezone: 'UTC' },
        escalation: { enabled: false, afterMinutes: 30, channelId: null },
        channelIds: [channel.json().id],
    })
    expect(policy.statusCode).toBe(StatusCodes.CREATED)
    return policy.json().id
}

async function seedRecord({ ctx, policyId, id }: { ctx: TestContext, policyId: string, id: string }): Promise<void> {
    const now = new Date().toISOString()
    await db.save('alert_record', {
        id,
        created: now,
        updated: now,
        tenantId: ctx.tenant.id,
        policyId,
        projectId: ctx.project.id,
        issueId: null,
        kind: 'NEW',
        channelIds: [],
        mergedCount: 1,
        status: 'SENT',
        scheduledAt: now,
        sentAt: now,
        error: null,
        summary: 'kept after the policy is gone',
    })
}

describe('Alert history', () => {
    it('keeps the alert records of a policy that was deleted', async () => {
        const ctx = await createTestContext(app!)
        const policyId = await createPolicy({ ctx, name: 'doomed' })
        await seedRecord({ ctx, policyId, id: 'rl-record-kept' })

        const deleted = await ctx.delete(`/v1/alerts/policies/${policyId}`)
        const records = (await ctx.get('/v1/alerts/records')).json().data

        expect(deleted.statusCode).toBe(StatusCodes.NO_CONTENT)
        expect(records.map((record: { id: string }) => record.id)).toEqual(['rl-record-kept'])
        expect(records[0].policyId).toBe(policyId)
    })

    it('never shows another tenant the records of a deleted policy', async () => {
        const owner = await createTestContext(app!)
        const outsider = await createTestContext(app!)
        const policyId = await createPolicy({ ctx: owner, name: 'doomed' })
        await seedRecord({ ctx: owner, policyId, id: 'rl-record-private' })
        await owner.delete(`/v1/alerts/policies/${policyId}`)

        const records = (await outsider.get('/v1/alerts/records')).json().data

        expect(records).toEqual([])
    })
})
