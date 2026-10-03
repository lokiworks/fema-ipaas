import { ApplicationEventName } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { auditEventRepo } from '../../../src/app/audit/audit-event.repo'
import { auditEventService } from '../../../src/app/audit/audit-event.service'
import { createTestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Recording audit events', () => {
    it('keeps an event whose payload carries a NUL byte instead of losing it', async () => {
        const ctx = await createTestContext(app!)

        await auditEventService(app!.log).record({
            tenantId: ctx.tenant.id,
            projectId: ctx.project.id,
            userId: ctx.user.id,
            action: ApplicationEventName.VARIABLE_UPSERTED,
            data: { variable: { name: 'bad\u0000name' }, note: 'a\u0000b' },
        })

        const rows = await auditEventRepo().find({ where: { tenantId: ctx.tenant.id } })
        expect(rows).toHaveLength(1)
        expect(rows[0].data).toEqual({ variable: { name: 'badname' }, note: 'ab' })
    })
})
