import { FastifyInstance } from 'fastify'
import { weeklyDigestService } from '../../../src/app/notification/weekly-digest.service'
import { db } from '../../helpers/db'
import { createTestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

const sendAlert = vi.fn()

vi.mock('../../../src/app/helper/email/email-service', () => ({
    emailService: vi.fn(() => ({ isConfigured: () => true, sendAlert })),
}))

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('weeklyDigestService.sendAll', () => {
    it('finds subscribed users on a real database and sends them the Chinese summary', async () => {
        sendAlert.mockResolvedValue(undefined)
        const ctx = await createTestContext(app!)
        await db.update('user', ctx.user.id, { notificationPreferences: { weeklyDigest: { email: true } } })

        const sent = await weeklyDigestService(app!.log).sendAll()

        expect(sent).toBeGreaterThanOrEqual(1)
        expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: ctx.tenant.id,
            to: expect.stringContaining('@'),
            title: expect.stringContaining('每周摘要'),
        }))
    })
})
