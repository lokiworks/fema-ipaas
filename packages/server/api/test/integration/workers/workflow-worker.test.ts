import { generateId } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import {
    createMockWorkflow,
    createMockWorkflowVersion,
    createMockProject,
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
        it('should deny worker access to workflow from another project', async () => {
            const { mockTenant, mockOwner, mockProject } = await mockAndSaveBasicSetup()

            const mockProject2 = createMockProject({
                tenantId: mockTenant.id,
                ownerId: mockOwner.id,
            })

            await db.save('project', [mockProject2])

            const mockWorkflow = createMockWorkflow({
                projectId: mockProject.id,
            })
            await db.save('workflow', [mockWorkflow])

            const mockWorkflowVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
            })
            await db.save('workflow_version', [mockWorkflowVersion])

            const mockToken = await generateMockToken({
                id: generateId(),
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
