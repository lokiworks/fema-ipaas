import { apId } from '@fema/core-utils'
import { PrincipalType } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { generateMockToken } from '../../../helpers/auth'
import { mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})
describe('Workspace Worker API', () => {
    describe('Get worker workspace endpoint', () => {
        it('should return worker workspace with correct id', async () => {
            const { mockWorkspace, mockPlatform } = await mockAndSaveBasicSetup()

            const mockToken = await generateMockToken({
                type: PrincipalType.ENGINE,
                id: apId(),
                platform: {
                    id: mockPlatform.id,
                },
                workspaceId: mockWorkspace.id,
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/worker/workspace',
                headers: {
                    authorization: `Bearer ${mockToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const responseBody = response?.json()
            expect(responseBody?.id).toBe(mockWorkspace.id)
        })

        it('should reject request without authorization', async () => {
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/worker/workspace',
            })

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })
})
