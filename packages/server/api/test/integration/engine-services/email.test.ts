import { generateId } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { mailSender } from '../../../src/app/helper/email/mail-sender'
import { generateMockToken } from '../../helpers/auth'
import { createTestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance
beforeAll(async () => { app = await setupTestEnvironment() })
afterAll(async () => { await teardownTestEnvironment() })

it('restricts workflow mail delivery to engine principals', async () => {
    const ctx = await createTestContext(app)
    const result = await ctx.post('/v1/engine/email/send', { to: ['recipient@example.com'], subject: 'Hi', text: 'Hello' })
    expect(result.statusCode).toBe(403)
})

it('returns disabled when the optional platform SMTP service is absent', async () => {
    const ctx = await createTestContext(app)
    expect(mailSender(app.log).isConfigured()).toBe(false)
    const token = await generateMockToken({ id: generateId(), type: PrincipalType.ENGINE, projectId: ctx.project.id, tenant: { id: ctx.tenant.id } })
    const result = await app.inject({ method: 'POST', url: '/api/v1/engine/email/send', headers: { authorization: `Bearer ${token}` }, payload: { to: ['recipient@example.com'], subject: 'Hi', text: 'Hello' } })
    expect(result.statusCode).toBe(503)
})

it('enforces the combined recipient limit before sending', async () => {
    const ctx = await createTestContext(app)
    const token = await generateMockToken({ id: generateId(), type: PrincipalType.ENGINE, projectId: ctx.project.id, tenant: { id: ctx.tenant.id } })
    const result = await app.inject({ method: 'POST', url: '/api/v1/engine/email/send', headers: { authorization: `Bearer ${token}` }, payload: { to: Array.from({ length: 30 }, (_, index) => `to${index}@example.com`), cc: Array.from({ length: 30 }, (_, index) => `cc${index}@example.com`), subject: 'Hi', text: 'Hello' } })
    expect(result.statusCode).toBe(400)
})
