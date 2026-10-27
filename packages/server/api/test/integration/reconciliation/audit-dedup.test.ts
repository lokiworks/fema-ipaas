import { generateId } from '@fema-ipaas/core-utils'
import { ApplicationEventName } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { auditEventRepo } from '../../../src/app/audit/audit-event.repo'
import { auditEventService } from '../../../src/app/audit/audit-event.service'
import { createTestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance
beforeAll(async () => { app = await setupTestEnvironment() })
afterAll(async () => { await teardownTestEnvironment() })

it('records a single finish event when concurrent callbacks report the same execution', async () => {
    const ctx = await createTestContext(app)
    const executionId = generateId()
    const event = { tenantId: ctx.tenant.id, projectId: ctx.project.id, action: ApplicationEventName.EXECUTION_FINISHED, data: { execution: { id: executionId } } }
    await Promise.all(Array.from({ length: 8 }, () => auditEventService(app.log).record(event)))
    expect(await auditEventRepo().countBy({ tenantId: ctx.tenant.id, eventKey: `${event.action}:${executionId}` })).toBe(1)
    const other = await createTestContext(app)
    await auditEventService(app.log).record({ ...event, tenantId: other.tenant.id, projectId: other.project.id })
    expect(await auditEventRepo().countBy({ tenantId: other.tenant.id, eventKey: `${event.action}:${executionId}` })).toBe(1)
})

it('preserves repeatable events without an execution finish key', async () => {
    const ctx = await createTestContext(app)
    const event = { tenantId: ctx.tenant.id, projectId: ctx.project.id, action: ApplicationEventName.EXECUTION_FINISHED, data: {} }
    await auditEventService(app.log).record(event)
    await auditEventService(app.log).record(event)
    expect(await auditEventRepo().countBy({ tenantId: ctx.tenant.id, projectId: ctx.project.id })).toBe(2)
})

it('keeps exactly one finish event per execution across two thousand repeated deliveries', async () => {
    const ctx = await createTestContext(app)
    const executionIds = Array.from({ length: 2000 }, () => generateId())
    for (let index = 0; index < executionIds.length; index += 50) {
        await Promise.all(executionIds.slice(index, index + 50).flatMap((id) => {
            const event = { tenantId: ctx.tenant.id, projectId: ctx.project.id, action: ApplicationEventName.EXECUTION_FINISHED, data: { execution: { id } } }
            return [auditEventService(app.log).record(event), auditEventService(app.log).record(event)]
        }))
    }
    expect(await auditEventRepo().countBy({ tenantId: ctx.tenant.id, projectId: ctx.project.id, action: ApplicationEventName.EXECUTION_FINISHED })).toBe(2000)
}, 60000)
