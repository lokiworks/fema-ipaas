import { apId } from '@fema-ipaas/core-utils'
import { InvitationStatus, InvitationType, TenantRole } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { JwtAudience, jwtUtils } from '../../../../src/app/helper/jwt-utils'
import { db } from '../../../helpers/db'
import {
    createMockUserInvitation,
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

describe('Accept User Invitation API', () => {
    it('Reports registered false when no identity claims the email yet', async () => {
        // arrange
        const { mockTenant } = await mockAndSaveBasicSetup()
        const invitationToken = await saveInvitationAndSignToken({
            email: `${apId().toLowerCase()}@example.com`,
            tenantId: mockTenant.id,
        })

        // act
        const response = await app?.inject({
            method: 'POST',
            url: '/api/v1/user-invitations/accept',
            body: { invitationToken },
        })

        // assert
        expect(response?.statusCode).toBe(StatusCodes.OK)
        expect(response?.json()?.registered).toBe(false)
    })

    it('Reports registered true when the email already has an identity', async () => {
        // arrange
        const { mockTenant } = await mockAndSaveBasicSetup()
        const email = `${apId().toLowerCase()}@example.com`
        await mockBasicUser({
            userIdentity: { email },
            user: {
                tenantId: mockTenant.id,
                tenantRole: TenantRole.MEMBER,
            },
        })
        const invitationToken = await saveInvitationAndSignToken({
            email,
            tenantId: mockTenant.id,
        })

        // act
        const response = await app?.inject({
            method: 'POST',
            url: '/api/v1/user-invitations/accept',
            body: { invitationToken },
        })

        // assert
        expect(response?.statusCode).toBe(StatusCodes.OK)
        expect(response?.json()?.registered).toBe(true)
    })
})

async function saveInvitationAndSignToken({ email, tenantId }: { email: string, tenantId: string }): Promise<string> {
    const invitation = createMockUserInvitation({
        email,
        tenantId,
        type: InvitationType.TENANT,
        tenantRole: TenantRole.MEMBER,
        status: InvitationStatus.PENDING,
    })
    await db.save('user_invitation', invitation)
    return jwtUtils.sign({
        payload: { id: invitation.id },
        key: await jwtUtils.getJwtSecret(),
        audience: JwtAudience.USER_INVITATION,
    })
}
