import { VARIABLE_NAME_MAX_LENGTH } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { createTestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('variable names', () => {
    it('accepts a name at the length limit', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.post('/v1/variables', { projectId: ctx.project.id, name: 'a'.repeat(VARIABLE_NAME_MAX_LENGTH), value: 'x' })

        expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('rejects a name longer than the limit', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.post('/v1/variables', { projectId: ctx.project.id, name: 'a'.repeat(VARIABLE_NAME_MAX_LENGTH + 1), value: 'x' })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(JSON.stringify(response.json())).toContain('variableNameTooLong')
    })
})
