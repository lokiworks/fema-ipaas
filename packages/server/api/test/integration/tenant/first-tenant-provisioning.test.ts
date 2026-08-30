import { generateId } from '@fema-ipaas/core-utils'
import { TenantRole, TelemetryEventName, UserStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { authenticationUtils } from '../../../../src/app/authentication/authentication-utils'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { tenantService } from '../../../../src/app/tenant/tenant.service'
import { createMockTenant, createMockUserIdentity } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

const trackProject = vi.fn()

vi.mock('../../../../src/app/helper/telemetry.utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../src/app/helper/telemetry.utils')>()
    return {
        ...actual,
        telemetry: (log: FastifyBaseLogger) => ({ ...actual.telemetry(log), trackProject }),
    }
})

let app: FastifyInstance | null = null

const EMAIL = 'first.tenant@example.com'

async function seedVerifiedIdentity(): Promise<string> {
    const identity = createMockUserIdentity({ email: EMAIL, verified: true })
    await databaseConnection().getRepository('user_identity').save(identity)
    return identity.id
}

async function onboardingToken(identityId: string): Promise<string> {
    const response = await authenticationUtils(app!.log).getOnboardingResponse({ identityId })
    return response.token
}

async function createViaRoute({ token, name }: { token: string, name: string }) {
    return app?.inject({
        method: 'POST',
        url: '/api/v1/tenants',
        headers: { authorization: `Bearer ${token}` },
        body: { name },
    })
}

async function createFirstTenant(identityId: string, callerTokenVersion?: string) {
    const { response } = await tenantService(app!.log).createTenantWithProject({
        identityId,
        name: 'Ahmad',
        invalidatePreviousTokens: true,
        isFirstTenant: true,
        callerTokenVersion,
    })
    return response
}

function provisionFirstTenant(identityId: string) {
    return tenantService(app!.log).createTenantWithProject({
        identityId,
        name: 'Ahmad',
        invalidatePreviousTokens: true,
        isFirstTenant: true,
        callerTokenVersion: undefined,
    })
}

async function tokenVersionOf(identityId: string): Promise<string> {
    const identity = await databaseConnection().getRepository('user_identity').findOneBy({ id: identityId })
    return identity!.tokenVersion
}

async function strandUser(identityId: string): Promise<string> {
    const userId = generateId()
    await databaseConnection().getRepository('user').save({
        id: userId,
        identityId,
        tenantId: null,
        tenantRole: TenantRole.ADMIN,
        status: UserStatus.ACTIVE,
    })
    return userId
}

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    trackProject.mockClear()
    await databaseConnection().getRepository('project').createQueryBuilder().delete().execute()
    await databaseConnection().getRepository('tenant').createQueryBuilder().delete().execute()
    await databaseConnection().getRepository('user').createQueryBuilder().delete().execute()
    await databaseConnection().getRepository('user_identity').createQueryBuilder().delete().execute()
})

describe('First tenant provisioning', () => {
    it('gives one identity a single tenant however many times it asks', async () => {
        const identityId = await seedVerifiedIdentity()

        const first = await createFirstTenant(identityId)
        const second = await createFirstTenant(identityId)

        expect(second.tenantId).toBe(first.tenantId)
        expect(await databaseConnection().getRepository('tenant').count()).toBe(1)
        expect(await databaseConnection().getRepository('project').count()).toBe(1)
        expect(await databaseConnection().getRepository('user').count()).toBe(1)
    })

    it('tells exactly one of two racing callers that it provisioned the tenant', async () => {
        const identityId = await seedVerifiedIdentity()

        const results = await Promise.all([
            provisionFirstTenant(identityId),
            provisionFirstTenant(identityId),
        ])

        expect(results.filter((result) => result.provisioned)).toHaveLength(1)
    })

    it('reuses a user left unlinked by an interrupted attempt instead of creating a second one', async () => {
        const identityId = await seedVerifiedIdentity()
        await strandUser(identityId)

        await createFirstTenant(identityId)

        expect(await databaseConnection().getRepository('user').count()).toBe(1)
    })

    it('adopts a tenant whose owner link never landed instead of building a second one', async () => {
        const identityId = await seedVerifiedIdentity()
        const strandedUserId = await strandUser(identityId)
        await databaseConnection().getRepository('tenant').save(
            createMockTenant({ ownerId: strandedUserId }),
        )

        const response = await createFirstTenant(identityId)

        expect(await databaseConnection().getRepository('tenant').count()).toBe(1)
        expect(await databaseConnection().getRepository('user').count()).toBe(1)
        const relinked = await databaseConnection().getRepository('user').findOneBy({ id: strandedUserId })
        expect(relinked?.tenantId).toBe(response.tenantId)
    })

    it('reports the signup it finished for a tenant whose owner link never landed', async () => {
        const identityId = await seedVerifiedIdentity()
        const strandedUserId = await strandUser(identityId)
        await databaseConnection().getRepository('tenant').save(
            createMockTenant({ ownerId: strandedUserId }),
        )

        const response = await createFirstTenant(identityId)

        const signedUp = trackProject.mock.calls.filter(([, event]) => event.name === TelemetryEventName.SIGNED_UP)
        expect(signedUp).toHaveLength(1)
        expect(signedUp[0][0]).toBe(response.projectId)
    })

    it('repairs a tenant left without a project instead of wedging the identity', async () => {
        const identityId = await seedVerifiedIdentity()
        const first = await createFirstTenant(identityId)
        await databaseConnection().getRepository('project').createQueryBuilder().delete().execute()

        const retry = await createFirstTenant(identityId)

        expect(retry.tenantId).toBe(first.tenantId)
        expect(await databaseConnection().getRepository('project').count()).toBe(1)
        expect(await databaseConnection().getRepository('tenant').count()).toBe(1)
    })

    it('finishes the rotation an interrupted attempt never got to', async () => {
        const identityId = await seedVerifiedIdentity()
        const strandedUserId = await strandUser(identityId)
        await databaseConnection().getRepository('tenant').save(
            createMockTenant({ ownerId: strandedUserId }),
        )
        await databaseConnection().getRepository('user')
            .update(strandedUserId, { tenantId: (await databaseConnection().getRepository('tenant').findOneBy({ ownerId: strandedUserId }))!.id })
        const beforeRetry = await tokenVersionOf(identityId)

        await createFirstTenant(identityId, beforeRetry)

        expect(await tokenVersionOf(identityId)).not.toBe(beforeRetry)
    })

    it('leaves the token version alone for a duplicate that carries a spent version', async () => {
        const identityId = await seedVerifiedIdentity()
        await createFirstTenant(identityId, await tokenVersionOf(identityId))
        const afterFirst = await tokenVersionOf(identityId)

        await createFirstTenant(identityId, 'a-version-from-before-the-rotation')

        expect(await tokenVersionOf(identityId)).toBe(afterFirst)
    })

    it('rotates once when two first-tenant creations race, so neither session is stranded', async () => {
        const identityId = await seedVerifiedIdentity()

        const [first, second] = await Promise.all([
            createFirstTenant(identityId),
            createFirstTenant(identityId),
        ])

        const after = await databaseConnection().getRepository('user_identity').findOneBy({ id: identityId })
        const versionOf = (token: string) =>
            JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).tokenVersion
        expect(versionOf(first.token)).toBe(after?.tokenVersion)
        expect(versionOf(second.token)).toBe(after?.tokenVersion)
    })

    it('serves the onboarding route without provisioning a second tenant', async () => {
        const identityId = await seedVerifiedIdentity()
        const token = await onboardingToken(identityId)

        const created = await createViaRoute({ token, name: 'Ahmad' })

        expect(created?.statusCode).toBe(StatusCodes.OK)
        expect(await databaseConnection().getRepository('tenant').count()).toBe(1)
        const identity = await databaseConnection().getRepository('user_identity').findOneBy({ id: identityId })
        expect(identity?.tokenVersion).not.toBe(
            JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).tokenVersion,
        )
    })
})
