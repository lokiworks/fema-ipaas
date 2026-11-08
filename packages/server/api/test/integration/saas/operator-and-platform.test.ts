import { generateId } from '@fema-ipaas/core-utils'
import { PlatformScope, TenantStatus, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { tenantUsageSnapshotService } from '../../../src/app/platform/tenant-usage-snapshot.service'
import { tenantLimitsService } from '../../../src/app/tenant/tenant-limits.service'
import { db } from '../../helpers/db'
import { createMockWorkflow } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

beforeEach(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createOperator(): Promise<TestContext> {
    const ctx = await createTestContext(app!)
    await db.update('user_identity', ctx.userIdentity.id, { instanceRole: 'OPERATOR' })
    return ctx
}

async function issuePlatformKey({ operator, scopes }: { operator: TestContext, scopes: PlatformScope[] }): Promise<string> {
    const response = await operator.post('/v1/operator/platform-clients', { kind: 'API_KEY', name: 'rental-saas', scopes })
    expect(response.statusCode).toBe(StatusCodes.OK)
    return response.json().secret
}

function platformCall({ key, method, url, body }: { key: string, method: 'GET' | 'POST' | 'DELETE', url: string, body?: Record<string, unknown> }) {
    return app!.inject({
        method,
        url: `/api${url}`,
        headers: { authorization: `Bearer ${key}` },
        ...(body === undefined ? {} : { body }),
    })
}

const PROVISION_BODY = {
    externalRef: { issuer: 'https://iam.example.com', tenantId: 'T-1001' },
    name: 'Northwind Rentals',
    owner: { subject: 'member-owner', email: 'owner@northwind.test', firstName: 'Nora', lastName: 'Wind' },
    oidc: {
        issuer: 'https://iam.example.com',
        clientId: 'ipaas-northwind',
        clientSecret: 'a-very-secret-client-secret',
        extraAuthParams: { tenant: 'T-1001' },
    },
}

describe('instance operator access', () => {
    it('keeps the operator routes away from ordinary tenant admins', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.get('/v1/operator/tenants')

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('tells the web whether the signed-in user is an operator', async () => {
        const ordinary = await createTestContext(app!)
        const operator = await createOperator()

        expect((await ordinary.get('/v1/operator/me')).json()).toEqual({ isOperator: false })
        expect((await operator.get('/v1/operator/me')).json()).toEqual({ isOperator: true })
    })

    it('refuses to remove the last operator', async () => {
        const operator = await createOperator()

        const response = await operator.delete(`/v1/operator/operators/${operator.userIdentity.id}`)

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(response.json().params.message).toBe('lastOperatorCannotBeRevoked')
    })
})

describe('operator tenant management', () => {
    it('creates a tenant for an email owner and returns the login link', async () => {
        const operator = await createOperator()

        const response = await operator.post('/v1/operator/tenants', {
            name: 'Acme Corp',
            owner: { email: 'boss@acme.test' },
            limits: { usersLimit: 5 },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(body.tenant).toMatchObject({ name: 'Acme Corp', slug: 'acme-corp', status: TenantStatus.ACTIVE, usersLimit: 5, usersCount: 1 })
        expect(body.ownerInvitationUrl).toContain('/t/acme-corp?email=boss%40acme.test')
    })

    it('generates a random login address when the name has no latin letters', async () => {
        const operator = await createOperator()

        const response = await operator.post('/v1/operator/tenants', { name: '北森科技', owner: { email: 'boss@beisen.test' } })

        expect(response.json().tenant.slug).toMatch(/^t-[a-z0-9]{6}$/)
    })

    it('serves the public tenant info by slug without signing in', async () => {
        const operator = await createOperator()
        await operator.post('/v1/operator/tenants', { name: 'Acme Corp', owner: { email: 'boss@acme.test' } })

        const response = await app!.inject({ method: 'GET', url: '/api/v1/tenants/public/acme-corp' })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.json()).toMatchObject({ slug: 'acme-corp', name: 'Acme Corp', emailAuthEnabled: true })
    })

    it('rejects a login address that is taken or reserved', async () => {
        const operator = await createOperator()
        await operator.post('/v1/operator/tenants', { name: 'Acme Corp', owner: { email: 'boss@acme.test' } })

        const taken = await operator.post('/v1/operator/tenants', { name: 'Other', slug: 'acme-corp', owner: { email: 'other@acme.test' } })
        const reserved = await operator.post('/v1/operator/tenants', { name: 'Other', slug: 'operator', owner: { email: 'other@acme.test' } })

        expect(taken.json().params.message).toBe('tenantSlugTaken')
        expect(reserved.json().params.message).toBe('tenantSlugInvalid')
    })

    it('suspends and resumes a tenant', async () => {
        const operator = await createOperator()
        const created = (await operator.post('/v1/operator/tenants', { name: 'Acme Corp', owner: { email: 'boss@acme.test' } })).json()

        const suspended = await operator.post(`/v1/operator/tenants/${created.tenant.id}/suspend`)
        const resumed = await operator.post(`/v1/operator/tenants/${created.tenant.id}/resume`)

        expect(suspended.json().status).toBe(TenantStatus.SUSPENDED)
        expect(resumed.json().status).toBe(TenantStatus.ACTIVE)
    })

    it('changes the limits and leaves the ones that are not sent alone', async () => {
        const operator = await createOperator()
        const created = (await operator.post('/v1/operator/tenants', { name: 'Acme Corp', owner: { email: 'boss@acme.test' }, limits: { usersLimit: 5, projectsLimit: 2 } })).json()

        const response = await operator.post(`/v1/operator/tenants/${created.tenant.id}/limits`, { projectsLimit: null, concurrentExecutionsLimit: 3 })

        expect(response.json()).toMatchObject({ usersLimit: 5, projectsLimit: null, concurrentExecutionsLimit: 3 })
    })

    it('changes the login address of a tenant', async () => {
        const operator = await createOperator()
        const created = (await operator.post('/v1/operator/tenants', { name: 'Acme Corp', owner: { email: 'boss@acme.test' } })).json()

        const response = await operator.post(`/v1/operator/tenants/${created.tenant.id}/slug`, { slug: 'acme-hr' })

        expect(response.json().slug).toBe('acme-hr')
        expect((await app!.inject({ method: 'GET', url: '/api/v1/tenants/public/acme-hr' })).statusCode).toBe(StatusCodes.OK)
    })

    it('lists tenants with a search filter', async () => {
        const operator = await createOperator()
        await operator.post('/v1/operator/tenants', { name: 'Acme Corp', owner: { email: 'boss@acme.test' } })
        await operator.post('/v1/operator/tenants', { name: 'Globex', owner: { email: 'boss@globex.test' } })

        const response = await operator.get('/v1/operator/tenants', { search: 'globex' })

        expect(response.json().data.map((tenant: { name: string }) => tenant.name)).toEqual(['Globex'])
    })

    it('records the instance settings and flags them to the web', async () => {
        const operator = await createOperator()

        const updated = await operator.post('/v1/operator/settings', { tenantSelfSignup: true })
        const flags = await app!.inject({ method: 'GET', url: '/api/v1/flags' })

        expect(updated.json().tenantSelfSignup).toBe(true)
        expect(flags.json().TENANT_SELF_SIGNUP_ENABLED).toBe(true)
        expect(flags.json().MULTI_TENANT).toBe(false)
    })
})

describe('tenant resolution', () => {
    it('reports a single tenant instance as not multi tenant and flips once a second tenant exists', async () => {
        const operator = await createOperator()
        const before = await app!.inject({ method: 'GET', url: '/api/v1/flags' })

        await operator.post('/v1/operator/tenants', { name: 'Acme Corp', owner: { email: 'boss@acme.test' } })
        const after = await app!.inject({ method: 'GET', url: '/api/v1/flags' })

        expect(before.json().MULTI_TENANT).toBe(false)
        expect(after.json().MULTI_TENANT).toBe(true)
    })

    it('answers not found for an explicit tenant that does not exist', async () => {
        await createOperator()

        const response = await app!.inject({ method: 'GET', url: '/api/v1/authn/sso/providers', headers: { 'x-fema-tenant': 'no-such-tenant' } })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
})

describe('tenant limits', () => {
    it('refuses to add a project beyond the project limit', async () => {
        const operator = await createOperator()
        await db.update('tenant', operator.tenant.id, { projectsLimit: 0 })

        await expect(tenantLimitsService(app!.log).assertCanAddProject({ tenantId: operator.tenant.id })).rejects.toMatchObject({
            error: { params: { message: 'tenantProjectsLimitReached' } },
        })
    })

    it('refuses to add a member beyond the member limit', async () => {
        const operator = await createOperator()
        await db.update('tenant', operator.tenant.id, { usersLimit: 1 })

        await expect(tenantLimitsService(app!.log).assertCanAddUser({ tenantId: operator.tenant.id })).rejects.toMatchObject({
            error: { params: { message: 'tenantUsersLimitReached' } },
        })
    })

    it('does not limit a tenant that has no limits set', async () => {
        const operator = await createOperator()

        await expect(tenantLimitsService(app!.log).assertCanAddUser({ tenantId: operator.tenant.id })).resolves.toBeUndefined()
        await expect(tenantLimitsService(app!.log).assertCanAddProject({ tenantId: operator.tenant.id })).resolves.toBeUndefined()
    })
})

describe('platform api', () => {
    it('turns away calls without a credential, with a wrong one and with a missing scope', async () => {
        const operator = await createOperator()
        const usageOnly = await issuePlatformKey({ operator, scopes: [PlatformScope.USAGE_READ] })

        const anonymous = await app!.inject({ method: 'POST', url: '/api/v1/platform/tenants', body: PROVISION_BODY })
        const wrong = await platformCall({ key: 'fpk_aaaaaaaaaaaa.not-the-secret', method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })
        const noScope = await platformCall({ key: usageOnly, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })

        expect(anonymous.statusCode).toBe(StatusCodes.UNAUTHORIZED)
        expect(wrong.statusCode).toBe(StatusCodes.UNAUTHORIZED)
        expect(noScope.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('stops honouring a key once the operator revokes it', async () => {
        const operator = await createOperator()
        const created = await operator.post('/v1/operator/platform-clients', { kind: 'API_KEY', name: 'rental-saas', scopes: [PlatformScope.USAGE_READ] })
        const key = created.json().secret

        await operator.post(`/v1/operator/platform-clients/${created.json().client.id}/revoke`)
        const response = await platformCall({ key, method: 'GET', url: '/v1/platform/usage?from=2026-11-01&to=2026-11-02' })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('never shows the secret hash when the operator lists the callers', async () => {
        const operator = await createOperator()
        await issuePlatformKey({ operator, scopes: [PlatformScope.USAGE_READ] })

        const response = await operator.get('/v1/operator/platform-clients')

        expect(response.json()[0]).not.toHaveProperty('secretHash')
        expect(response.json()[0].keyPrefix).toHaveLength(12)
    })

    it('provisions a tenant with its owner, sign-in configuration and no member subscription when none is asked for', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION, PlatformScope.TENANT_MEMBERS] })

        const response = await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(body.created).toBe(true)
        expect(body.slug).toMatch(/^northwind-rentals$/)
        expect(body.memberEvents).toBeNull()
        expect(body).not.toHaveProperty('eventsEndpoint')
        expect(body.ssoStartUrl).toContain('tenant=northwind-rentals')

        const tenant = await databaseConnection().getRepository('tenant').findOneByOrFail({ id: body.tenantId })
        expect(tenant).toMatchObject({ externalIssuer: 'https://iam.example.com', externalTenantId: 'T-1001' })
        const binding = await databaseConnection().getRepository('external_identity').findOneByOrFail({ issuer: 'https://iam.example.com', subject: 'member-owner' })
        expect(binding.tenantId).toBe(body.tenantId)
        expect(binding.userId).toBe(tenant.ownerId)
    })

    it('stores the session recheck interval of the sign-in configuration and rejects one that is out of range', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION] })

        const tooShort = await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: { ...PROVISION_BODY, oidc: { ...PROVISION_BODY.oidc, sessionRecheckMinutes: 3 } } })
        const accepted = await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: { ...PROVISION_BODY, oidc: { ...PROVISION_BODY.oidc, sessionRecheckMinutes: 30 } } })

        expect(tooShort.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(accepted.statusCode).toBe(StatusCodes.OK)
        const raw = await databaseConnection().query<{ minutes: number | null }[]>('select ("federatedAuthProviders" -> \'oidc\' ->> \'sessionRecheckMinutes\')::int as minutes from tenant where id = $1', [accepted.json().tenantId])
        expect(raw[0]?.minutes).toBe(30)
    })

    it('provisions the same external tenant only once however often it is called', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION] })

        const first = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })).json()
        const second = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: { ...PROVISION_BODY, oidc: { ...PROVISION_BODY.oidc, clientSecret: 'a-rotated-client-secret' } } })).json()

        expect(second.created).toBe(false)
        expect(second.tenantId).toBe(first.tenantId)
        expect(second.projectId).toBe(first.projectId)
        expect(await databaseConnection().getRepository('tenant').countBy({ externalTenantId: 'T-1001' })).toBe(1)
    })

    it('refuses member events without the sign-in configuration they belong to', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION] })

        const response = await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: { ...PROVISION_BODY, oidc: undefined, memberEvents: { connectionExternalId: 'fema-iam', apiUrl: 'https://fema.example.com' } } })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(response.json().params.message).toBe('memberEventsRequireOidc')
    })

    it('reads, updates, suspends and resumes a provisioned tenant', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION] })
        const { tenantId } = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })).json()

        const updated = await platformCall({ key, method: 'POST', url: `/v1/platform/tenants/${tenantId}`, body: { name: 'Northwind Group', limits: { usersLimit: 20 } } })
        const suspended = await platformCall({ key, method: 'POST', url: `/v1/platform/tenants/${tenantId}/suspend` })
        const resumed = await platformCall({ key, method: 'POST', url: `/v1/platform/tenants/${tenantId}/resume` })
        const byRef = await platformCall({ key, method: 'GET', url: '/v1/platform/tenants/by-external-ref?issuer=https%3A%2F%2Fiam.example.com&tenantId=T-1001' })

        expect(updated.json()).toMatchObject({ name: 'Northwind Group', usersLimit: 20 })
        expect(suspended.json().status).toBe(TenantStatus.SUSPENDED)
        expect(resumed.json().status).toBe(TenantStatus.ACTIVE)
        expect(byRef.json().id).toBe(tenantId)
    })

    it('adds a member by subject as pending, lists them and deactivates them on removal', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION, PlatformScope.TENANT_MEMBERS] })
        const { tenantId } = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })).json()

        const added = await platformCall({ key, method: 'POST', url: `/v1/platform/tenants/${tenantId}/members`, body: { subject: 'member-2', email: 'two@northwind.test', role: 'MEMBER' } })
        const pending = added.json().find((member: { subject: string | null }) => member.subject === 'member-2')
        const removed = await platformCall({ key, method: 'DELETE', url: `/v1/platform/tenants/${tenantId}/members?subject=member-2` })
        const afterwards = await platformCall({ key, method: 'GET', url: `/v1/platform/tenants/${tenantId}/members` })

        expect(pending).toMatchObject({ status: 'PENDING_BINDING', role: 'MEMBER' })
        expect(removed.statusCode).toBe(StatusCodes.NO_CONTENT)
        expect(afterwards.json().find((member: { subject: string | null }) => member.subject === 'member-2').status).toBe('INACTIVE')
    })

    it('never removes the tenant owner', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION, PlatformScope.TENANT_MEMBERS] })
        const { tenantId } = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })).json()

        const response = await platformCall({ key, method: 'DELETE', url: `/v1/platform/tenants/${tenantId}/members?subject=member-owner` })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('adds a member by email as an invited tenant member who can then be removed by user id', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION, PlatformScope.TENANT_MEMBERS] })
        const { tenantId } = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })).json()

        const added = await platformCall({ key, method: 'POST', url: `/v1/platform/tenants/${tenantId}/members`, body: { email: 'three@northwind.test', role: 'MEMBER' } })
        const member = added.json().find((entry: { email: string | null }) => entry.email === 'three@northwind.test')
        const removed = await platformCall({ key, method: 'DELETE', url: `/v1/platform/tenants/${tenantId}/members?userId=${member.userId}` })

        expect(member).toMatchObject({ role: 'MEMBER', status: 'ACTIVE' })
        expect(removed.statusCode).toBe(StatusCodes.NO_CONTENT)
    })

    it('reports daily usage per tenant in one call', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION, PlatformScope.USAGE_READ] })
        const { tenantId } = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })).json()

        const response = await platformCall({ key, method: 'GET', url: `/v1/platform/usage?tenantId=${tenantId}&from=2026-11-01&to=2026-11-03` })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.json().data).toEqual([
            { tenantId, date: '2026-11-01', executions: 0, failedExecutions: 0, activeWorkflows: 0, activeWorkflowsExact: false },
            { tenantId, date: '2026-11-02', executions: 0, failedExecutions: 0, activeWorkflows: 0, activeWorkflowsExact: false },
            { tenantId, date: '2026-11-03', executions: 0, failedExecutions: 0, activeWorkflows: 0, activeWorkflowsExact: false },
        ])
    })

    it('uses the stored snapshots for the days they cover and says which values are exact', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION, PlatformScope.USAGE_READ] })
        const { tenantId } = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })).json()
        await db.save('tenant_usage_snapshot', { id: generateId(), tenantId, date: '2026-11-02', activeWorkflows: 3 })
        await db.save('tenant_usage_snapshot', { id: generateId(), tenantId, date: '2026-11-04', activeWorkflows: 5 })

        const response = await platformCall({ key, method: 'GET', url: `/v1/platform/usage?tenantId=${tenantId}&from=2026-11-01&to=2026-11-05` })

        expect(response.json().data.map((day: { date: string, activeWorkflows: number, activeWorkflowsExact: boolean }) => [day.date, day.activeWorkflows, day.activeWorkflowsExact])).toEqual([
            ['2026-11-01', 0, false],
            ['2026-11-02', 3, true],
            ['2026-11-03', 3, true],
            ['2026-11-04', 5, true],
            ['2026-11-05', 5, true],
        ])
    })

    it('counts the enabled workflows live for today', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION, PlatformScope.USAGE_READ] })
        const { tenantId, projectId } = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })).json()
        await db.save('workflow', createMockWorkflow({ projectId, status: WorkflowStatus.ENABLED, folderId: null, publishedVersionId: null }))
        await db.save('workflow', createMockWorkflow({ projectId, status: WorkflowStatus.DISABLED, folderId: null, publishedVersionId: null }))
        const today = new Date().toISOString().slice(0, 10)

        const response = await platformCall({ key, method: 'GET', url: `/v1/platform/usage?tenantId=${tenantId}&from=${today}&to=${today}` })

        expect(response.json().data).toEqual([
            { tenantId, date: today, executions: 0, failedExecutions: 0, activeWorkflows: 1, activeWorkflowsExact: true },
        ])
    })

    it('writes a snapshot for every tenant when the daily job runs', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION] })
        const { tenantId, projectId } = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })).json()
        await db.save('workflow', createMockWorkflow({ projectId, status: WorkflowStatus.ENABLED, folderId: null, publishedVersionId: null }))

        await tenantUsageSnapshotService(app!.log).recordAll()
        await tenantUsageSnapshotService(app!.log).recordAll()

        const rows = await databaseConnection().getRepository('tenant_usage_snapshot').findBy({ tenantId })
        expect(rows).toHaveLength(1)
        expect(rows[0].activeWorkflows).toBe(1)
        expect(await databaseConnection().getRepository('tenant_usage_snapshot').count()).toBe(2)
    })

    it('refreshes the snapshot of today after a workflow changes status', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION] })
        const { tenantId, projectId } = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })).json()
        await tenantUsageSnapshotService(app!.log).recordTenant({ tenantId })
        await db.save('workflow', createMockWorkflow({ projectId, status: WorkflowStatus.ENABLED, folderId: null, publishedVersionId: null }))

        await tenantUsageSnapshotService(app!.log).recordForProject({ projectId })

        const rows = await databaseConnection().getRepository('tenant_usage_snapshot').findBy({ tenantId })
        expect(rows.map((row) => row.activeWorkflows)).toEqual([1])
    })

    it('rejects a usage range that is too long', async () => {
        const operator = await createOperator()
        const key = await issuePlatformKey({ operator, scopes: [PlatformScope.USAGE_READ] })

        const response = await platformCall({ key, method: 'GET', url: '/v1/platform/usage?from=2026-01-01&to=2026-12-31' })

        expect(response.json().params.message).toBe('usageRangeTooLong')
    })
})

describe('tenant domains', () => {
    it('adds a login domain with a verification record and refuses to verify it without DNS proof', async () => {
        const ctx = await createTestContext(app!)

        const added = await ctx.post('/v1/tenant-domains', { domain: 'Acme.Test', purpose: 'LOGIN_DISCOVERY' })
        const verified = await ctx.post(`/v1/tenant-domains/${added.json().id}/verify`)

        expect(added.json()).toMatchObject({ domain: 'acme.test', verifiedAt: null })
        expect(added.json().verificationRecord.name).toBe('_ipaas-verification.acme.test')
        expect(verified.statusCode).toBe(StatusCodes.CONFLICT)
        expect(verified.json().params.message).toBe('domainVerificationFailed')
    })

    it('does not discover a tenant through a domain that is not verified', async () => {
        const ctx = await createTestContext(app!)
        await ctx.post('/v1/tenant-domains', { domain: 'acme.test', purpose: 'LOGIN_DISCOVERY' })

        const response = await app!.inject({ method: 'POST', url: '/api/v1/tenants/discover', body: { email: 'someone@acme.test' } })

        expect(response.json()).toEqual({ tenants: [] })
    })

    it('discovers a tenant through a verified login domain', async () => {
        const ctx = await createTestContext(app!)
        const added = await ctx.post('/v1/tenant-domains', { domain: 'acme.test', purpose: 'LOGIN_DISCOVERY' })
        await db.update('tenant_domain', added.json().id, { verifiedAt: new Date().toISOString() })

        const response = await app!.inject({ method: 'POST', url: '/api/v1/tenants/discover', body: { email: 'someone@acme.test' } })

        expect(response.json().tenants.map((tenant: { id: string }) => tenant.id)).toEqual([ctx.tenant.id])
    })

    it('does not let a second tenant claim a domain that another tenant has verified', async () => {
        const first = await createTestContext(app!)
        const second = await createTestContext(app!)
        const added = await first.post('/v1/tenant-domains', { domain: 'acme.test', purpose: 'LOGIN_DISCOVERY' })
        await db.update('tenant_domain', added.json().id, { verifiedAt: new Date().toISOString() })

        const response = await second.post('/v1/tenant-domains', { domain: 'acme.test', purpose: 'LOGIN_DISCOVERY' })

        expect(response.json().params.message).toBe('domainAlreadyClaimed')
    })

    it('lets a tenant admin change the login address of its own tenant only', async () => {
        const ctx = await createTestContext(app!)
        const other = await createTestContext(app!)

        const own = await ctx.post(`/v1/tenants/${ctx.tenant.id}/slug`, { slug: 'my-company' })
        const foreign = await ctx.post(`/v1/tenants/${other.tenant.id}/slug`, { slug: 'not-mine' })

        expect(own.json().slug).toBe('my-company')
        expect(foreign.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
})
