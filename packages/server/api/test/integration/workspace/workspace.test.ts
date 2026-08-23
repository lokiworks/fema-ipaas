import { ErrorCode } from '@fema-ipaas/core-utils'
import { PrincipalType, WorkspaceType } from '@fema-ipaas/shared'
import { faker } from '@faker-js/faker'
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

describe('Workspace API (CE)', () => {
    describe('Create Workspace', () => {
        it('should create one team workspace', async () => {
            const { mockOwner, mockTenant } = await mockAndSaveBasicSetup({
                workspace: { type: WorkspaceType.PERSONAL },
                plan: { billedTeamWorkspacesLimit: 1 },
            })

            const testToken = await generateMockToken({
                type: PrincipalType.USER,
                id: mockOwner.id,
                tenant: { id: mockTenant.id },
            })

            const displayName = faker.animal.bird()
            const response = await app?.inject({
                method: 'POST',
                url: '/api/v1/workspaces',
                body: { displayName },
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const responseBody = response?.json()
            expect(responseBody.displayName).toBe(displayName)
            expect(responseBody.ownerId).toBe(mockOwner.id)
            expect(responseBody.tenantId).toBe(mockTenant.id)
        })

        it('should fail to create a second team workspace', async () => {
            const { mockOwner, mockTenant } = await mockAndSaveBasicSetup({
                plan: { billedTeamWorkspacesLimit: 1 },
            })

            const testToken = await generateMockToken({
                type: PrincipalType.USER,
                id: mockOwner.id,
                tenant: { id: mockTenant.id },
            })

            const response = await app?.inject({
                method: 'POST',
                url: '/api/v1/workspaces',
                body: { displayName: faker.animal.bird() },
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.PAYMENT_REQUIRED)
            const responseBody = response?.json()
            expect(responseBody?.code).toBe(ErrorCode.FEATURE_DISABLED)
        })
    })
})
