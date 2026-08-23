import { apId } from '@fema/core-utils'
import { PrincipalType } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import {
    createMockFlow,
    createMockFlowVersion,
    createMockWorkspace,
    mockAndSaveBasicSetup,
} from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})
describe('Flow API for Worker', () => {
    describe('Get Flow from Worker', () => {
        it('should deny worker access to flow from another workspace', async () => {
            const { mockPlatform, mockOwner, mockWorkspace } = await mockAndSaveBasicSetup()

            const mockWorkspace2 = createMockWorkspace({
                platformId: mockPlatform.id,
                ownerId: mockOwner.id,
            })

            await db.save('workspace', [mockWorkspace2])

            const mockFlow = createMockFlow({
                workspaceId: mockWorkspace.id,
            })
            await db.save('flow', [mockFlow])

            const mockFlowVersion = createMockFlowVersion({
                flowId: mockFlow.id,
            })
            await db.save('flow_version', [mockFlowVersion])

            const mockToken = await generateMockToken({
                id: apId(),
                type: PrincipalType.WORKER,
            })

            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/worker/flows/${mockFlowVersion.id}`,
                headers: {
                    authorization: `Bearer ${mockToken}`,
                },
            })
            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })
})
