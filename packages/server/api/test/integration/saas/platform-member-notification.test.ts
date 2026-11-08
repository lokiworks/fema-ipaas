import { InvitationStatus, InvitationType, PlatformScope, TenantRole } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { db } from '../../helpers/db'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

const mail = vi.hoisted(() => ({ configured: true, sendInvitation: vi.fn() }))

vi.mock('../../../src/app/helper/email/email-service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/app/helper/email/email-service')>()
    return {
        ...actual,
        emailService: (log: Parameters<typeof actual.emailService>[0]) => ({
            ...actual.emailService(log),
            isConfigured: () => mail.configured,
            sendInvitation: (...args: unknown[]) => mail.sendInvitation(...args),
        }),
    }
})

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment({ fresh: true })
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    app = await setupTestEnvironment()
    mail.configured = true
    mail.sendInvitation.mockReset()
})

const PROVISION_BODY = {
    externalRef: { issuer: 'https://iam.example.com', tenantId: 'T-2001' },
    name: 'Contoso Rentals',
    owner: { subject: 'member-owner', email: 'owner@contoso.test' },
    oidc: { issuer: 'https://iam.example.com', clientId: 'ipaas-contoso', clientSecret: 'a-very-secret-client-secret' },
}

async function provisionTenant(): Promise<{ key: string, tenantId: string }> {
    const operator = await createOperator()
    const created = await operator.post('/v1/operator/platform-clients', {
        kind: 'API_KEY',
        name: 'rental-saas',
        scopes: [PlatformScope.TENANT_PROVISION, PlatformScope.TENANT_MEMBERS],
    })
    const key: string = created.json().secret
    const tenant = await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })
    expect(tenant.statusCode).toBe(StatusCodes.OK)
    return { key, tenantId: tenant.json().tenantId }
}

async function createOperator(): Promise<TestContext> {
    const ctx = await createTestContext(app!)
    await db.update('user_identity', ctx.userIdentity.id, { instanceRole: 'OPERATOR' })
    return ctx
}

function platformCall({ key, method, url, body }: { key: string, method: 'GET' | 'POST' | 'DELETE', url: string, body?: Record<string, unknown> }) {
    return app!.inject({
        method,
        url: `/api${url}`,
        headers: { authorization: `Bearer ${key}` },
        ...(body === undefined ? {} : { body }),
    })
}

async function addMember({ key, tenantId, body }: { key: string, tenantId: string, body: Record<string, unknown> }) {
    const response = await platformCall({ key, method: 'POST', url: `/v1/platform/tenants/${tenantId}/members`, body })
    expect(response.statusCode).toBe(StatusCodes.OK)
    return response.json() as Array<{ email: string | null, phone: string | null, subject: string | null, status: string, role: string, notified: boolean }>
}

describe('notifying members added through the platform api', () => {
    it('sends an invitation email to a member with an email address and lets them join after accepting', async () => {
        const { key, tenantId } = await provisionTenant()

        const members = await addMember({ key, tenantId, body: { email: 'new@contoso.test', role: TenantRole.MEMBER } })

        const invited = members.find((member) => member.email === 'new@contoso.test')
        expect(invited).toMatchObject({ status: 'INVITED', role: TenantRole.MEMBER, notified: true })
        expect(mail.sendInvitation).toHaveBeenCalledTimes(1)
        const invitation = await databaseConnection().getRepository('user_invitation').findOneByOrFail({ tenantId, email: 'new@contoso.test' })
        expect(invitation).toMatchObject({ type: InvitationType.TENANT, status: InvitationStatus.PENDING, tenantRole: TenantRole.MEMBER })
        expect(await databaseConnection().getRepository('user_identity').countBy({ email: 'new@contoso.test' })).toBe(0)
    })

    it('creates the account straight away and says nothing was sent when mail is not configured', async () => {
        mail.configured = false
        const { key, tenantId } = await provisionTenant()

        const members = await addMember({ key, tenantId, body: { email: 'new@contoso.test', role: TenantRole.MEMBER } })

        expect(members.find((member) => member.email === 'new@contoso.test')).toMatchObject({ status: 'ACTIVE', notified: false })
        expect(mail.sendInvitation).not.toHaveBeenCalled()
    })

    it('does not message a member who only has a phone number', async () => {
        const { key, tenantId } = await provisionTenant()

        const members = await addMember({ key, tenantId, body: { phone: '+8613800138000', role: TenantRole.MEMBER } })

        expect(members.find((member) => member.phone === '+8613800138000')).toMatchObject({ status: 'ACTIVE', notified: false })
        expect(mail.sendInvitation).not.toHaveBeenCalled()
    })

    it('does not message a federated member even when an email address is given', async () => {
        const { key, tenantId } = await provisionTenant()

        const members = await addMember({ key, tenantId, body: { subject: 'member-2', email: 'two@contoso.test', role: TenantRole.MEMBER } })

        expect(members.find((member) => member.subject === 'member-2')).toMatchObject({ status: 'PENDING_BINDING', notified: false })
        expect(mail.sendInvitation).not.toHaveBeenCalled()
    })

    it('does not invite someone who is already a member, it only updates the role', async () => {
        mail.configured = false
        const { key, tenantId } = await provisionTenant()
        await addMember({ key, tenantId, body: { email: 'new@contoso.test', role: TenantRole.MEMBER } })
        mail.configured = true

        const members = await addMember({ key, tenantId, body: { email: 'new@contoso.test', role: TenantRole.ADMIN } })

        expect(members.filter((member) => member.email === 'new@contoso.test')).toEqual([expect.objectContaining({ status: 'ACTIVE', role: TenantRole.ADMIN, notified: false })])
        expect(mail.sendInvitation).not.toHaveBeenCalled()
    })

    it('shows the invitation again when the members are listed, and drops it once the person has an account', async () => {
        const { key, tenantId } = await provisionTenant()
        await addMember({ key, tenantId, body: { email: 'new@contoso.test', role: TenantRole.MEMBER } })

        const listed = await platformCall({ key, method: 'GET', url: `/v1/platform/tenants/${tenantId}/members` })

        expect(listed.json().filter((member: { status: string }) => member.status === 'INVITED')).toHaveLength(1)
    })
})
