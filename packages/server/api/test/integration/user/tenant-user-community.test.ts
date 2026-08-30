import { generateId } from '@fema-ipaas/core-utils'
import { TenantRole, PrincipalType, ProjectType, UserStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { generateMockToken } from '../../../helpers/auth'
import {
    createMockProject,
    createMockUser,
    mockAndSaveBasicSetup,
    mockBasicUser,
} from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})
describe('User API', () => {
    describe('List users endpoint', () => {
        it('Returns a list of users', async () => {
            // arrange
            const { mockTenant: mockTenantOne, mockOwner: mockOwnerOne } = await mockAndSaveBasicSetup()

            // Create Another setup
            await mockAndSaveBasicSetup()

            const testToken = await generateMockToken({
                id: mockOwnerOne.id,
                type: PrincipalType.USER,
                tenant: {
                    id: mockTenantOne.id,
                },
            })

            // act
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/users',
                query: {},
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            // assert
            expect(response?.statusCode).toBe(StatusCodes.OK)
            const responseBody = response?.json()

            expect(Object.keys(responseBody)).toHaveLength(3)
            expect(responseBody.data).toHaveLength(1)
            expect(responseBody.data[0].id).toBe(mockOwnerOne.id)
            expect(responseBody.data[0].password).toBeUndefined()
        })

        it('Requires principal to be tenant owner', async () => {
            // arrange
            const { mockTenant } = await mockAndSaveBasicSetup()


            const { mockUser: normalUser } = await mockBasicUser({
                user: {
                    tenantId: mockTenant.id,
                    tenantRole: TenantRole.MEMBER,
                    status: UserStatus.ACTIVE,
                },
            })
            const testToken = await generateMockToken({
                id: normalUser.id,
                type: PrincipalType.USER,
                tenant: {
                    id: mockTenant.id,
                },
            })

            // act
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/users',
                query: {},
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            // assert
            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
            const responseBody = response?.json()

            expect(responseBody?.code).toBe('AUTHORIZATION')
        })
    })

    describe('Update user endpoint', () => {
        it('Updates user status to be INACTIVE', async () => {
            // arrange
            const { mockOwner, mockTenant } = await mockAndSaveBasicSetup()
            const { mockUser } = await mockBasicUser({
                user: {
                    tenantId: mockTenant.id,
                    status: UserStatus.ACTIVE,
                },
            })
            const testToken = await generateMockToken({
                id: mockOwner.id,
                type: PrincipalType.USER,
                tenant: {
                    id: mockTenant.id,
                },
            })
            // act
            const response = await app?.inject({
                method: 'POST',
                url: `/api/v1/users/${mockUser.id}`,
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
                body: {
                    status: UserStatus.INACTIVE,
                },
            })

            // assert
            expect(response?.statusCode).toBe(StatusCodes.OK)

            const responseJson = response?.json()
            expect(responseJson.id).toBe(mockUser.id)
            expect(responseJson.password).toBeUndefined()
            expect(responseJson.status).toBe(UserStatus.INACTIVE)
        })

        it('Fails if user doesn\'t exist', async () => {
            const { mockTenant } = await mockAndSaveBasicSetup()

            const { mockUser } = await mockBasicUser({
                user: {
                    tenantId: mockTenant.id,
                    tenantRole: TenantRole.ADMIN,
                },
            })
            // arrange
            const nonExistentUserId = generateId()

            const testToken = await generateMockToken({
                type: PrincipalType.USER,
                tenant: {
                    id: mockTenant.id,
                },
                id: mockUser.id,
            })

            // act
            const response = await app?.inject({
                method: 'POST',
                url: `/api/v1/users/${nonExistentUserId}`,
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
                body: {
                    status: UserStatus.INACTIVE,
                },
            })

            // assert
            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })

        it('Requires principal to be tenant owner', async () => {
            // arrange
            const { mockTenant } = await mockAndSaveBasicSetup()

            const { mockUser } = await mockBasicUser({
                user: {
                    tenantId: mockTenant.id,
                    tenantRole: TenantRole.MEMBER,
                },
            })
            const testToken = await generateMockToken({
                id: mockUser.id,
                type: PrincipalType.USER,
                tenant: {
                    id: mockTenant.id,
                },
            })

            // act
            const response = await app?.inject({
                method: 'POST',
                url: `/api/v1/users/${mockUser.id}`,
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
                body: {
                    status: UserStatus.INACTIVE,
                },
            })

            // assert
            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
            const responseBody = response?.json()

            expect(responseBody?.code).toBe('AUTHORIZATION')
        })
    })

    describe('Delete user endpoint', () => {
        it('Removes a user', async () => {
            // arrange
            const { mockOwner, mockTenant } = await mockAndSaveBasicSetup()
            const { mockUser: mockEditor } = await mockBasicUser({
                user: {
                    tenantId: mockTenant.id,
                    tenantRole: TenantRole.MEMBER,
                },
            })

            const mockOwnerToken = await generateMockToken({
                id: mockOwner.id,
                type: PrincipalType.USER,
                tenant: {
                    id: mockTenant.id,
                },
            })

            // act
            const response = await app?.inject({
                method: 'DELETE',
                url: `/api/v1/users/${mockEditor.id}`,
                headers: {
                    authorization: `Bearer ${mockOwnerToken}`,
                },
            })

            // assert
            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        })

        it('Removes a user who owns a personal project on the first attempt', async () => {
            // arrange
            const { mockOwner, mockTenant } = await mockAndSaveBasicSetup()
            const { mockUser: mockMember } = await mockBasicUser({
                user: {
                    tenantId: mockTenant.id,
                    tenantRole: TenantRole.MEMBER,
                },
            })
            const personalProject = createMockProject({
                ownerId: mockMember.id,
                tenantId: mockTenant.id,
                type: ProjectType.PERSONAL,
            })
            await databaseConnection().getRepository('project').save(personalProject)

            const mockOwnerToken = await generateMockToken({
                id: mockOwner.id,
                type: PrincipalType.USER,
                tenant: {
                    id: mockTenant.id,
                },
            })

            // act
            const response = await app?.inject({
                method: 'DELETE',
                url: `/api/v1/users/${mockMember.id}`,
                headers: {
                    authorization: `Bearer ${mockOwnerToken}`,
                },
            })

            // assert
            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        })

        it('Returns 204 when deleting a non-existent user', async () => {
            // arrange
            const { mockOwner, mockTenant } = await mockAndSaveBasicSetup()
            const mockOwnerToken = await generateMockToken({
                id: mockOwner.id,
                type: PrincipalType.USER,
                tenant: {
                    id: mockTenant.id,
                },
            })

            // act
            const response = await app?.inject({
                method: 'DELETE',
                url: `/api/v1/users/${generateId()}`,
                headers: {
                    authorization: `Bearer ${mockOwnerToken}`,
                },
            })

            // assert
            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        })

        it('Deletes the orphaned identity when the deleted user was its only reference', async () => {
            // arrange
            const { mockOwner, mockTenant } = await mockAndSaveBasicSetup()
            const { mockUser: mockMember, mockUserIdentity } = await mockBasicUser({
                user: {
                    tenantId: mockTenant.id,
                    tenantRole: TenantRole.MEMBER,
                },
            })

            const mockOwnerToken = await generateMockToken({
                id: mockOwner.id,
                type: PrincipalType.USER,
                tenant: {
                    id: mockTenant.id,
                },
            })

            // act
            const response = await app?.inject({
                method: 'DELETE',
                url: `/api/v1/users/${mockMember.id}`,
                headers: {
                    authorization: `Bearer ${mockOwnerToken}`,
                },
            })

            // assert
            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
            const identity = await databaseConnection()
                .getRepository('user_identity')
                .findOneBy({ id: mockUserIdentity.id })
            expect(identity).toBeNull()
        })

        it('Keeps the identity when another user still references it', async () => {
            // arrange
            const { mockOwner, mockTenant } = await mockAndSaveBasicSetup()
            const { mockUser: mockMember, mockUserIdentity } = await mockBasicUser({
                user: {
                    tenantId: mockTenant.id,
                    tenantRole: TenantRole.MEMBER,
                },
            })
            const { mockTenant: otherTenant } = await mockAndSaveBasicSetup()
            const sharedUserOnOtherTenant = createMockUser({
                identityId: mockUserIdentity.id,
                tenantId: otherTenant.id,
                tenantRole: TenantRole.MEMBER,
            })
            await databaseConnection()
                .getRepository('user')
                .save(sharedUserOnOtherTenant)

            const mockOwnerToken = await generateMockToken({
                id: mockOwner.id,
                type: PrincipalType.USER,
                tenant: {
                    id: mockTenant.id,
                },
            })

            // act
            const response = await app?.inject({
                method: 'DELETE',
                url: `/api/v1/users/${mockMember.id}`,
                headers: {
                    authorization: `Bearer ${mockOwnerToken}`,
                },
            })

            // assert
            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
            const identity = await databaseConnection()
                .getRepository('user_identity')
                .findOneBy({ id: mockUserIdentity.id })
            expect(identity).not.toBeNull()
        })

        it('Fails if user is not tenant owner', async () => {
            // arrange
            const { mockTenant } = await mockAndSaveBasicSetup()

            const { mockUser } = await mockBasicUser({
                user: {
                    tenantId: mockTenant.id,
                    tenantRole: TenantRole.MEMBER,
                },
            })

            const mockUserToken = await generateMockToken({
                id: mockUser.id,
                type: PrincipalType.USER,
                tenant: {
                    id: mockTenant.id,
                },
            })

            // act
            const response = await app?.inject({
                method: 'DELETE',
                url: `/api/v1/users/${mockUser.id}`,
                headers: {
                    authorization: `Bearer ${mockUserToken}`,
                },
            })

            // assert
            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
            const responseBody = response?.json()
            expect(responseBody?.code).toBe('AUTHORIZATION')
        })
    })
})
