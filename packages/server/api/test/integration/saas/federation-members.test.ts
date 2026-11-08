import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { federationSignature } from '../../../src/app/federation/federation-signature'
import { encryptUtils } from '../../../src/app/helper/encryption'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null
let ctx: TestContext
let counter = 0

const secret = 'registration-secret-for-member-events'
const issuer = 'https://iam.example.com'

beforeAll(async () => {
    app = await setupTestEnvironment()
})

beforeEach(async () => {
    app = await setupTestEnvironment()
    ctx = await createTestContext(app)
    await databaseConnection().getRepository('tenant').update({ id: ctx.tenant.id }, {
        externalIssuer: issuer,
        externalTenantId: 'T-2001',
        federatedAuthProviders: {
            saml: null,
            oidc: {
                enabled: true,
                displayName: 'Company login',
                allowedDomains: [],
                autoCreateUsers: false,
                defaultRole: 'MEMBER',
                roleMapping: null,
                defaultProject: null,
                verifiedAt: '2026-11-08T00:00:00.000Z',
                lastLoginAt: null,
                issuer,
                clientId: 'client',
                clientSecret: await encryptUtils.encryptString('client-secret'),
                scopes: 'openid',
                emailClaim: 'email',
                requireVerifiedEmail: false,
                matchBy: 'SUBJECT',
                provisioned: true,
                memberSubscription: {
                    subscriptionId: 'sub-1',
                    code: 'ipaas-members-test',
                    plainSecret: await encryptUtils.encryptString(secret),
                    endpoint: `https://ipaas.test/api/v1/federation/members/${ctx.tenant.id}`,
                    apiUrl: 'http://127.0.0.1:1',
                    connectionExternalId: 'fema-iam',
                    projectId: ctx.project.id,
                    createdAt: '2026-11-08T00:00:00.000Z',
                },
            },
        },
    })
})

afterAll(async () => {
    await teardownTestEnvironment()
})

function push({ tenantId, rawBody, signature }: { tenantId: string, rawBody: string, signature?: string }) {
    counter += 1
    return app!.inject({
        method: 'POST',
        url: `/api/v1/federation/members/${tenantId}`,
        headers: { 'content-type': 'application/json', 'x-real-ip': `10.20.${Math.floor(counter / 250)}.${counter % 250 + 1}`, ...(signature === undefined ? {} : { 'x-fema-signature': signature }) },
        body: rawBody,
    })
}

function memberEvent(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({ id: `evt-${counter}`, type: 'iam-identity.member.suspend', tenantId: 'T-2001', occurredAt: '2026-11-08T00:00:00Z', object: { code: 'member', id: 'member-1' }, ...overrides })
}

describe('member events from fema', () => {
    describe('the verification request', () => {
        it('echoes the challenge back, signed or not', async () => {
            const rawBody = JSON.stringify({ id: 'v-1', type: 'webhook.verification', challenge: 'c-123' })

            const response = await push({ tenantId: ctx.tenant.id, rawBody })

            expect(response.statusCode).toBe(StatusCodes.OK)
            expect(response.json().challenge).toBe('c-123')
        })

        it('does not echo for a tenant that does not exist', async () => {
            const response = await push({ tenantId: 'no-such-tenant', rawBody: JSON.stringify({ type: 'webhook.verification', challenge: 'c-123' }) })

            expect(response.statusCode).toBe(StatusCodes.OK)
            expect(response.json().challenge).toBeUndefined()
        })
    })

    describe('what is dropped with a 2xx answer', () => {
        it('a push with a wrong signature', async () => {
            const rawBody = memberEvent()

            const response = await push({ tenantId: ctx.tenant.id, rawBody, signature: federationSignature.sign({ rawBody, secret: 'another-secret-another-secret' }) })

            expect(response.statusCode).toBe(StatusCodes.OK)
            expect(response.json()).toEqual({ received: false })
        })

        it('a push without a signature', async () => {
            const response = await push({ tenantId: ctx.tenant.id, rawBody: memberEvent() })

            expect(response.statusCode).toBe(StatusCodes.OK)
            expect(response.json()).toEqual({ received: false })
        })

        it('a signed push about another external tenant', async () => {
            const rawBody = memberEvent({ tenantId: 'T-9999' })

            const response = await push({ tenantId: ctx.tenant.id, rawBody, signature: federationSignature.sign({ rawBody, secret }) })

            expect(response.statusCode).toBe(StatusCodes.OK)
            expect(response.json()).toEqual({ received: false })
        })

        it('a signed push of an event that is not a member event', async () => {
            const rawBody = memberEvent({ type: 'rental-agreement.contract.activate' })

            const response = await push({ tenantId: ctx.tenant.id, rawBody, signature: federationSignature.sign({ rawBody, secret }) })

            expect(response.statusCode).toBe(StatusCodes.OK)
            expect(response.json()).toEqual({ received: false })
        })

        it('a push to a tenant that has no subscription', async () => {
            const other = await createTestContext(app!)
            const rawBody = memberEvent()

            const response = await push({ tenantId: other.tenant.id, rawBody, signature: federationSignature.sign({ rawBody, secret }) })

            expect(response.statusCode).toBe(StatusCodes.OK)
            expect(response.json()).toEqual({ received: false })
        })
    })

    describe('a valid push whose member cannot be read', () => {
        it('fails with a server error so that fema pushes it again, and can be accepted later', async () => {
            const rawBody = memberEvent({ id: 'evt-retry' })
            const signature = federationSignature.sign({ rawBody, secret })

            const first = await push({ tenantId: ctx.tenant.id, rawBody, signature })
            const second = await push({ tenantId: ctx.tenant.id, rawBody, signature })

            expect(first.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
            expect(second.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
        })
    })
})
