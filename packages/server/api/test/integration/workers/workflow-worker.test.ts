import { apId } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import {
    createMockWorkflow,
    createMockWorkflowVersion,
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
describe('Workflow API for Worker', () => {
    describe('Get Workflow from Worker', () => {
        it('should deny worker access to workflow from another workspace', async () => {
            const { mockTenant, mockOwner, mockWorkspace } = await mockAndSaveBasicSetup()

            const mockWorkspace2 = createMockWorkspace({
                tenantId: mockTenant.id,
                ownerId: mockOwner.id,
            })

            await db.save('workspace', [mockWorkspace2])

            const mockWorkflow = createMockWorkflow({
                workspaceId: mockWorkspace.id,
            })
            await db.save('workflow', [mockWorkflow])

            const mockWorkflowVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
            })
            await db.save('workflow_version', [mockWorkflowVersion])

            const mockToken = await generateMockToken({
                id: apId(),
                type: PrincipalType.WORKER,
            })

            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/worker/workflows/${mockWorkflowVersion.id}`,
                headers: {
                    authorization: `Bearer ${mockToken}`,
                },
            })
            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })
})
