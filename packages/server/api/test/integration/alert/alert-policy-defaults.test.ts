import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createChannel({ ctx }: { ctx: TestContext }): Promise<string> {
    const channel = await ctx.post('/v1/alerts/channels', { name: 'defaults-channel', type: 'WEBHOOK', url: 'https://example.com/hook' })
    expect(channel.statusCode).toBe(StatusCodes.CREATED)
    return channel.json().id
}

function policyBody({ name, channelId }: { name: string, channelId: string }) {
    return {
        name,
        enabled: true,
        projectIds: [],
        workflowIds: [],
        events: ['ISSUE_NEW'],
        failureRate: null,
        groupWindowMinutes: 30,
        escalation: { enabled: false, afterMinutes: 60, channelId: null },
        channelIds: [channelId],
    }
}

describe('alert policy quiet hours default', () => {
    it('creates a policy with quiet hours off when the request leaves them out', async () => {
        const ctx = await createTestContext(app!)
        const channelId = await createChannel({ ctx })

        const created = await ctx.post('/v1/alerts/policies', policyBody({ name: 'no-quiet', channelId }))

        expect(created.statusCode).toBe(StatusCodes.CREATED)
        expect(created.json().quietHours.enabled).toBe(false)

        const listed = await ctx.get('/v1/alerts/policies')
        const stored = listed.json().find((policy: { id: string }) => policy.id === created.json().id)
        expect(stored.quietHours.enabled).toBe(false)
    })

    it('keeps quiet hours on with the given window when the request turns them on', async () => {
        const ctx = await createTestContext(app!)
        const channelId = await createChannel({ ctx })
        const quietHours = { enabled: true, from: '23:00', to: '07:30', timezone: 'Asia/Shanghai' }

        const created = await ctx.post('/v1/alerts/policies', { ...policyBody({ name: 'with-quiet', channelId }), quietHours })

        expect(created.statusCode).toBe(StatusCodes.CREATED)
        expect(created.json().quietHours).toEqual(quietHours)

        const listed = await ctx.get('/v1/alerts/policies')
        const stored = listed.json().find((policy: { id: string }) => policy.id === created.json().id)
        expect(stored.quietHours).toEqual(quietHours)
    })
})
