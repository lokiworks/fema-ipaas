import { generateId } from '@fema-ipaas/core-utils'
import { InvitationStatus, InvitationType, PersonalAccessTokenExpiry, PlatformScope, PrincipalType, ProjectType, TenantRole, TenantStatus, UserStatus, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { SystemJobName } from '../../../src/app/helper/system-jobs/common'
import { systemJobsQueue } from '../../../src/app/helper/system-jobs/system-job'
import { projectPurgeService } from '../../../src/app/project/project-purge.service'
import { tenantStatusGuard } from '../../../src/app/tenant/tenant-status-guard'
import { tenantBackgroundJobs } from '../../../src/app/tenant/tenant.jobs'
import { webhookTenantGate } from '../../../src/app/webhooks/webhook-tenant-gate'
import { generateMockToken } from '../../helpers/auth'
import { db } from '../../helpers/db'
import { createMockConnection, createMockExecution, createMockFile, createMockFolder, createMockProject, createMockUser, createMockUserIdentity, createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null
let ipCounter = 0

beforeAll(async () => {
    app = await setupTestEnvironment()
})

beforeEach(async () => {
    app = await setupTestEnvironment()
    tenantStatusGuard.clear()
    await systemJobsQueue.pause()
})

afterEach(async () => {
    const jobs = await systemJobsQueue.getJobs()
    await Promise.all(jobs.filter((job) => job.name === SystemJobName.HARD_DELETE_TENANT).map((job) => job.remove()))
    await systemJobsQueue.resume()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('deleting a tenant through the platform api', () => {
    it('answers 202 with the tenant marked as deleting, queues one purge job and accepts the same call again', async () => {
        const world = await seedWorld()

        const first = await platformCall({ key: world.key, method: 'DELETE', url: `/v1/platform/tenants/${world.tenantId}` })
        const second = await platformCall({ key: world.key, method: 'DELETE', url: `/v1/platform/tenants/${world.tenantId}` })

        expect(first.statusCode).toBe(StatusCodes.ACCEPTED)
        expect(first.json()).toMatchObject({ id: world.tenantId, status: TenantStatus.DELETING })
        expect(second.statusCode).toBe(StatusCodes.ACCEPTED)
        const queued = (await systemJobsQueue.getJobs()).filter((job) => job.name === SystemJobName.HARD_DELETE_TENANT)
        expect(queued.map((job) => job.data)).toEqual([{ tenantId: world.tenantId }])
    })

    it('answers 404 for a tenant that does not exist, 401 without a key and 403 without the provision scope', async () => {
        const operator = await createOperator()
        const usageOnly = await issuePlatformKey({ operator, scopes: [PlatformScope.USAGE_READ] })
        const provisioning = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION] })
        const unknownId = generateId()

        const missing = await platformCall({ key: provisioning, method: 'DELETE', url: `/v1/platform/tenants/${unknownId}` })
        const anonymous = await app!.inject({ method: 'DELETE', url: `/api/v1/platform/tenants/${unknownId}` })
        const noScope = await platformCall({ key: usageOnly, method: 'DELETE', url: `/v1/platform/tenants/${unknownId}` })

        expect(missing.statusCode).toBe(StatusCodes.NOT_FOUND)
        expect(missing.json().code).toBe('ENTITY_NOT_FOUND')
        expect(anonymous.statusCode).toBe(StatusCodes.UNAUTHORIZED)
        expect(noScope.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('turns away sign-in, session tokens, personal access tokens, webhooks and queued runs from the moment it is accepted', async () => {
        const world = await seedWorld()
        const beforeSignIn = await signIn({ slug: world.slug, email: world.memberEmail })
        const beforeSession = await app!.inject({ method: 'GET', url: '/api/v1/account/access-tokens', headers: { authorization: `Bearer ${world.ownerToken}` } })
        const beforePat = await app!.inject({ method: 'GET', url: '/api/v1/account/access-tokens', headers: { authorization: `Bearer ${world.personalAccessToken}` } })

        const accepted = await platformCall({ key: world.key, method: 'DELETE', url: `/v1/platform/tenants/${world.tenantId}` })

        const afterSignIn = await signIn({ slug: world.slug, email: world.memberEmail })
        const afterSession = await app!.inject({ method: 'GET', url: '/api/v1/account/access-tokens', headers: { authorization: `Bearer ${world.ownerToken}` } })
        const afterPat = await app!.inject({ method: 'GET', url: '/api/v1/account/access-tokens', headers: { authorization: `Bearer ${world.personalAccessToken}` } })
        const webhook = await webhookTenantGate.refusalFor({ tenantId: world.tenantId, webhookHeader: 'x-webhook-id', webhookRequestId: 'req-1' })
        const runsAllowed = await tenantStatusGuard.isActive({ tenantId: world.tenantId })
        expect([beforeSignIn.statusCode, beforeSession.statusCode, beforePat.statusCode]).toEqual([StatusCodes.OK, StatusCodes.OK, StatusCodes.OK])
        expect(accepted.statusCode).toBe(StatusCodes.ACCEPTED)
        expect(afterSignIn.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(afterSignIn.json().code).toBe('TENANT_SUSPENDED')
        expect(afterSession.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(afterPat.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(webhook).toMatchObject({ status: StatusCodes.FORBIDDEN, body: { code: 'TENANT_SUSPENDED' } })
        expect(runsAllowed).toBe(false)
    })

    it('cannot be resumed, suspended or provisioned again while it is being deleted', async () => {
        const world = await seedWorld()
        const operator = await createOperator()
        await platformCall({ key: world.key, method: 'DELETE', url: `/v1/platform/tenants/${world.tenantId}` })

        const resumed = await platformCall({ key: world.key, method: 'POST', url: `/v1/platform/tenants/${world.tenantId}/resume` })
        const suspended = await platformCall({ key: world.key, method: 'POST', url: `/v1/platform/tenants/${world.tenantId}/suspend` })
        const operatorResumed = await operator.post(`/v1/operator/tenants/${world.tenantId}/resume`)
        const provisioned = await platformCall({ key: world.key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })
        const read = await platformCall({ key: world.key, method: 'GET', url: `/v1/platform/tenants/${world.tenantId}` })

        expect(resumed.statusCode).toBe(StatusCodes.CONFLICT)
        expect(resumed.json().params.message).toBe('tenantIsBeingDeleted')
        expect(suspended.statusCode).toBe(StatusCodes.CONFLICT)
        expect(operatorResumed.statusCode).toBe(StatusCodes.CONFLICT)
        expect(provisioned.statusCode).toBe(StatusCodes.CONFLICT)
        expect(provisioned.json().params.message).toBe('tenantIsBeingDeleted')
        expect(read.json().status).toBe(TenantStatus.DELETING)
    })
})

describe('purging a deleted tenant', () => {
    it('removes every row of the tenant, keeps the other tenant and the identity it shares, and is a no-op the second time', async () => {
        await assertFullPurge({ withoutForeignKeys: false })
    })

    it('picks up where an interrupted run stopped', async () => {
        const world = await seedWorld()
        await platformCall({ key: world.key, method: 'DELETE', url: `/v1/platform/tenants/${world.tenantId}` })
        await projectPurgeService(app!.log).purge({ projectId: world.projectId })
        expect(await countRows({ table: 'project', column: 'id', values: [world.projectId] })).toBe(0)
        expect(await countRows({ table: 'tenant', column: 'id', values: [world.tenantId] })).toBe(1)

        await tenantBackgroundJobs(app!.log).hardDeleteTenantHandler({ tenantId: world.tenantId })

        expect(await footprintOf({ tenantId: world.tenantId, projectIds: world.projectIds })).toEqual({})
        expect(await countRows({ table: 'tenant', column: 'id', values: [world.tenantId] })).toBe(0)
    })

    it('lets the platform provision the same external tenant afresh once it has been purged', async () => {
        const world = await seedWorld()
        await platformCall({ key: world.key, method: 'DELETE', url: `/v1/platform/tenants/${world.tenantId}` })
        await tenantBackgroundJobs(app!.log).hardDeleteTenantHandler({ tenantId: world.tenantId })

        const again = await platformCall({ key: world.key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })

        expect(again.statusCode).toBe(StatusCodes.OK)
        expect(again.json().created).toBe(true)
        expect(again.json().tenantId).not.toBe(world.tenantId)
    })

    it('deletes explicitly, without foreign key cascades, a row in every table that carries a tenant or project', async () => {
        await assertFullPurge({ withoutForeignKeys: true })
    })
})

async function assertFullPurge({ withoutForeignKeys }: { withoutForeignKeys: boolean }): Promise<void> {
    const world = await seedWorld()
    if (withoutForeignKeys) {
        await dropForeignKeys()
        await seedSyntheticRows({ tenantId: world.tenantId, projectId: world.projectId })
    }
    const bystander = await seedBystander()
    const bystanderBefore = await footprintOf({ tenantId: bystander.tenantId, projectIds: bystander.projectIds })
    const tenantBefore = await footprintOf({ tenantId: world.tenantId, projectIds: world.projectIds })
    await platformCall({ key: world.key, method: 'DELETE', url: `/v1/platform/tenants/${world.tenantId}` })

    await tenantBackgroundJobs(app!.log).hardDeleteTenantHandler({ tenantId: world.tenantId })

    const tenantAfter = await footprintOf({ tenantId: world.tenantId, projectIds: world.projectIds })
    expect(Object.keys(tenantBefore)).toEqual(expect.arrayContaining(withoutForeignKeys ? await everyOwnedColumnKey() : SEEDED_FOOTPRINT_KEYS))
    expect(tenantAfter).toEqual({})
    expect(await countRows({ table: 'tenant', column: 'id', values: [world.tenantId] })).toBe(0)
    expect(await countRows({ table: 'workflow_version', column: 'workflowId', values: world.workflowIds })).toBe(0)
    expect(await countRows({ table: 'file', column: 'id', values: world.fileIds })).toBe(0)
    expect(await countRows({ table: 'connection', column: 'id', values: world.connectionIds })).toBe(0)
    expect(await countRows({ table: 'user', column: 'id', values: world.userIds })).toBe(0)
    expect(await countRows({ table: 'user_identity', column: 'id', values: world.exclusiveIdentityIds })).toBe(0)
    expect(await countRows({ table: 'user_identity', column: 'id', values: [world.sharedIdentityId] })).toBe(1)
    expect(await countRows({ table: 'user', column: 'id', values: [world.sharedUserInOtherTenantId] })).toBe(1)
    expect(await footprintOf({ tenantId: bystander.tenantId, projectIds: bystander.projectIds })).toEqual(bystanderBefore)
    expect(await countRows({ table: 'tenant', column: 'id', values: [bystander.tenantId] })).toBe(1)

    await tenantBackgroundJobs(app!.log).hardDeleteTenantHandler({ tenantId: world.tenantId })

    expect(await footprintOf({ tenantId: world.tenantId, projectIds: world.projectIds })).toEqual({})
    expect(await footprintOf({ tenantId: bystander.tenantId, projectIds: bystander.projectIds })).toEqual(bystanderBefore)
    expect(await countRows({ table: 'user_identity', column: 'id', values: [world.sharedIdentityId] })).toBe(1)
    const gone = await platformCall({ key: world.key, method: 'GET', url: `/v1/platform/tenants/${world.tenantId}` })
    expect(gone.statusCode).toBe(StatusCodes.NOT_FOUND)
}

async function everyOwnedColumnKey(): Promise<string[]> {
    const rows = await databaseConnection().query<Array<{ table_name: string, column_name: string }>>(
        'select table_name, column_name from information_schema.columns where table_schema = \'public\' and column_name in (\'tenantId\', \'projectId\')',
    )
    return rows.map((row) => `${row.table_name}.${row.column_name}`)
}

async function seedSyntheticRows({ tenantId, projectId }: { tenantId: string, projectId: string }): Promise<void> {
    const connection = databaseConnection()
    const owned = await everyOwnedColumnKey()
    const tables = [...new Set(owned.map((key) => key.split('.')[0]))]
    const columns = await connection.query<SyntheticColumn[]>(
        'select table_name, column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns where table_schema = \'public\' and table_name = any($1) order by table_name, ordinal_position',
        [tables],
    )
    const enumLabels = await connection.query<Array<{ type_name: string, label: string }>>(
        'select t.typname as type_name, e.enumlabel as label from pg_enum e join pg_type t on t.oid = e.enumtypid order by e.enumsortorder',
    )
    for (const table of tables) {
        const required = columns.filter((column) => column.table_name === table && (OWNER_COLUMNS.includes(column.column_name) || (column.is_nullable === 'NO' && column.column_default === null)))
        const names = required.map((column) => `"${column.column_name}"`).join(', ')
        const values = required.map((column) => syntheticLiteral({ column, tenantId, projectId, enumLabels })).join(', ')
        await connection.query(`insert into "${table}" (${names}) values (${values})`)
    }
}

function syntheticLiteral({ column, tenantId, projectId, enumLabels }: { column: SyntheticColumn, tenantId: string, projectId: string, enumLabels: Array<{ type_name: string, label: string }> }): string {
    if (column.column_name === 'tenantId') {
        return `'${tenantId}'`
    }
    if (column.column_name === 'projectId') {
        return `'${projectId}'`
    }
    if (column.column_name === 'id') {
        return `'${generateId()}'`
    }
    if (column.data_type === 'USER-DEFINED') {
        return `'${enumLabels.find((entry) => entry.type_name === column.udt_name)?.label ?? 'synthetic'}'`
    }
    if (column.data_type === 'ARRAY' || column.data_type === 'json' || column.data_type === 'jsonb') {
        return '\'{}\''
    }
    if (column.data_type === 'boolean') {
        return '\'false\''
    }
    if (column.data_type === 'bytea') {
        return '\'\\x00\''
    }
    if (column.data_type.startsWith('timestamp') || column.data_type === 'date') {
        return '\'2026-11-08T00:00:00Z\''
    }
    if (NUMERIC_TYPES.includes(column.data_type)) {
        return '\'0\''
    }
    return '\'x\''
}

async function dropForeignKeys(): Promise<void> {
    const constraints = await databaseConnection().query<Array<{ table_name: string, constraint_name: string }>>(
        'select conrelid::regclass::text as table_name, conname as constraint_name from pg_constraint where contype = \'f\' and connamespace = \'public\'::regnamespace',
    )
    for (const constraint of constraints) {
        await databaseConnection().query(`alter table ${constraint.table_name} drop constraint "${constraint.constraint_name}"`)
    }
}

async function seedWorld(): Promise<World> {
    const operator = await createOperator()
    const key = await issuePlatformKey({ operator, scopes: [PlatformScope.TENANT_PROVISION, PlatformScope.TENANT_MEMBERS] })
    const provisioned = (await platformCall({ key, method: 'POST', url: '/v1/platform/tenants', body: PROVISION_BODY })).json()
    const tenantId: string = provisioned.tenantId
    const projectId: string = provisioned.projectId
    const tenant = await db.findOneByOrFail<{ ownerId: string, slug: string }>('tenant', { id: tenantId })
    const ownerUserId = tenant.ownerId
    await platformCall({ key, method: 'POST', url: `/v1/platform/tenants/${tenantId}/members`, body: { subject: 'member-2', email: 'two@northwind.test', role: 'MEMBER' } })
    await platformCall({ key, method: 'POST', url: `/v1/platform/tenants/${tenantId}/members`, body: { email: 'three@northwind.test', role: 'MEMBER' } })

    const secondProject = createMockProject({ tenantId, ownerId: ownerUserId, displayName: 'Second', type: ProjectType.TEAM })
    const archivedProject = createMockProject({ tenantId, ownerId: ownerUserId, displayName: 'Archived', type: ProjectType.TEAM, deleted: new Date().toISOString() })
    await db.save('project', [secondProject, archivedProject])
    const projectIds = [projectId, secondProject.id, archivedProject.id]

    const seededWorkflows = await Promise.all(projectIds.map((id) => seedWorkflowWithRuns({ projectId: id })))
    const workflowIds = seededWorkflows.map((seeded) => seeded.workflowId)
    await db.save('folder', createMockFolder({ projectId }))

    const projectConnection = createMockConnection({ tenantId, projectIds: [projectId] }, ownerUserId)
    const tenantConnection = createMockConnection({ tenantId, projectIds: [] }, ownerUserId)
    await db.save('connection', [projectConnection, tenantConnection])

    const projectFile = createMockFile({ tenantId, projectId, fileName: 'project.bin' })
    const tenantFile = createMockFile({ tenantId, projectId: null, fileName: 'tenant.bin' })
    const projectOnlyFile = createMockFile({ tenantId: null, projectId: secondProject.id, fileName: 'second.bin' })
    await db.save('file', [projectFile, tenantFile, projectOnlyFile])
    await db.update('execution', seededWorkflows[0].executionIds[0], { logsFileId: projectFile.id })

    await db.save('tenant_domain', { id: generateId(), tenantId, domain: 'northwind.test', purpose: 'LOGIN_DISCOVERY', verificationRecord: { type: 'TXT', name: '_ipaas-verification.northwind.test', value: 'proof' }, verifiedAt: null })
    await db.save('tenant_usage_snapshot', { id: generateId(), tenantId, date: '2026-11-02', activeWorkflows: 3 })
    await db.save('user_invitation', [
        { id: generateId(), tenantId, type: InvitationType.TENANT, tenantRole: TenantRole.MEMBER, email: 'tenant-invitee@northwind.test', status: InvitationStatus.PENDING, projectId: null },
        { id: generateId(), tenantId, type: InvitationType.PROJECT, tenantRole: TenantRole.MEMBER, email: 'project-invitee@northwind.test', status: InvitationStatus.PENDING, projectId: secondProject.id },
    ])

    const member = await seedPasswordMember({ tenantId, projectOwnerOf: true })
    const shared = await seedPasswordMember({ tenantId, projectOwnerOf: false })
    const other = await createTestContext(app!)
    const sharedUserInOtherTenant = createMockUser({ identityId: shared.identityId, tenantId: other.tenant.id, tenantRole: TenantRole.MEMBER, status: UserStatus.ACTIVE })
    await db.save('user', sharedUserInOtherTenant)

    const ownerToken = await tokenFor({ userId: ownerUserId, tenantId })
    const created = await app!.inject({
        method: 'POST',
        url: '/api/v1/account/access-tokens',
        headers: { authorization: `Bearer ${ownerToken}` },
        body: { name: 'northwind', expiry: PersonalAccessTokenExpiry.DAYS_30 },
    })
    const personalAccessToken: string = created.json().value

    const userIds = (await databaseConnection().query<Array<{ id: string }>>('select id from "user" where "tenantId" = $1', [tenantId])).map((row) => row.id)
    const identityRows = await databaseConnection().query<Array<{ identityId: string }>>('select "identityId" from "user" where "tenantId" = $1', [tenantId])
    return {
        key,
        tenantId,
        slug: tenant.slug,
        projectId,
        projectIds,
        workflowIds,
        fileIds: [projectFile.id, tenantFile.id, projectOnlyFile.id],
        connectionIds: [projectConnection.id, tenantConnection.id],
        userIds,
        exclusiveIdentityIds: identityRows.map((row) => row.identityId).filter((id) => id !== shared.identityId),
        sharedIdentityId: shared.identityId,
        sharedUserInOtherTenantId: sharedUserInOtherTenant.id,
        memberEmail: member.email,
        ownerToken,
        personalAccessToken,
    }
}

async function seedBystander(): Promise<Bystander> {
    const ctx = await createTestContext(app!)
    const seeded = await seedWorkflowWithRuns({ projectId: ctx.project.id })
    await db.save('file', createMockFile({ tenantId: ctx.tenant.id, projectId: ctx.project.id }))
    await db.save('connection', createMockConnection({ tenantId: ctx.tenant.id, projectIds: [ctx.project.id] }, ctx.user.id))
    await db.save('tenant_usage_snapshot', { id: generateId(), tenantId: ctx.tenant.id, date: '2026-11-02', activeWorkflows: 1 })
    expect(seeded.executionIds).toHaveLength(2)
    return { tenantId: ctx.tenant.id, projectIds: [ctx.project.id] }
}

async function seedWorkflowWithRuns({ projectId }: { projectId: string }): Promise<{ workflowId: string, executionIds: string[] }> {
    const workflow = createMockWorkflow({ projectId, status: WorkflowStatus.DISABLED, folderId: null, publishedVersionId: null })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id })
    await db.save('workflow_version', version)
    const executions = [1, 2].map(() => createMockExecution({ projectId, workflowId: workflow.id, workflowVersionId: version.id }))
    await db.save('execution', executions)
    return { workflowId: workflow.id, executionIds: executions.map((execution) => execution.id) }
}

async function seedPasswordMember({ tenantId, projectOwnerOf }: { tenantId: string, projectOwnerOf: boolean }): Promise<{ identityId: string, userId: string, email: string }> {
    const email = `member-${generateId().toLowerCase()}@example.com`
    const identity = createMockUserIdentity({ email, password: PASSWORD, verified: true, tokenVersion: generateId() })
    await db.save('user_identity', identity)
    const user = createMockUser({ identityId: identity.id, tenantId, tenantRole: TenantRole.MEMBER, status: UserStatus.ACTIVE })
    await db.save('user', user)
    if (projectOwnerOf) {
        await db.save('project', createMockProject({ tenantId, ownerId: user.id, type: ProjectType.PERSONAL }))
    }
    return { identityId: identity.id, userId: user.id, email }
}

async function footprintOf({ tenantId, projectIds }: { tenantId: string, projectIds: string[] }): Promise<Record<string, number>> {
    const connection = databaseConnection()
    const tablesWith = async (column: string): Promise<string[]> => {
        const rows = await connection.query<Array<{ table_name: string }>>('select table_name from information_schema.columns where table_schema = \'public\' and column_name = $1', [column])
        return rows.map((row) => row.table_name)
    }
    const tenantTables = await tablesWith('tenantId')
    const projectTables = await tablesWith('projectId')
    const byTenant = await Promise.all(tenantTables.map(async (table) => ({ key: `${table}.tenantId`, count: await countRows({ table, column: 'tenantId', values: [tenantId] }) })))
    const byProject = await Promise.all(projectTables.map(async (table) => ({ key: `${table}.projectId`, count: await countRows({ table, column: 'projectId', values: projectIds }) })))
    return Object.fromEntries([...byTenant, ...byProject].filter((entry) => entry.count > 0).map((entry) => [entry.key, entry.count]))
}

async function countRows({ table, column, values }: { table: string, column: string, values: string[] }): Promise<number> {
    if (values.length === 0) {
        return 0
    }
    const rows = await databaseConnection().query<Array<{ total: number }>>(`select count(*)::int as total from "${table}" where "${column}" = any($1)`, [values])
    return rows[0]?.total ?? 0
}

async function tokenFor({ userId, tenantId }: { userId: string, tenantId: string }): Promise<string> {
    const user = await db.findOneBy<{ identityId: string }>('user', { id: userId })
    const identity = await db.findOneBy<{ tokenVersion: string }>('user_identity', { id: user?.identityId ?? '' })
    return generateMockToken({ id: userId, type: PrincipalType.USER, tenant: { id: tenantId }, tokenVersion: identity?.tokenVersion })
}

function signIn({ slug, email }: { slug: string, email: string }) {
    ipCounter += 1
    return app!.inject({
        method: 'POST',
        url: '/api/v1/authentication/sign-in',
        headers: { 'x-real-ip': `10.8.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`, 'x-fema-tenant': slug },
        body: { email, password: PASSWORD },
    })
}

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

const OWNER_COLUMNS = ['tenantId', 'projectId']
const NUMERIC_TYPES = ['integer', 'bigint', 'smallint', 'numeric', 'double precision', 'real']
const PASSWORD = 'a-long-enough-password'

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

const SEEDED_FOOTPRINT_KEYS = [
    'project.tenantId',
    'connection.tenantId',
    'file.tenantId',
    'file.projectId',
    'user.tenantId',
    'external_identity.tenantId',
    'user_invitation.tenantId',
    'tenant_domain.tenantId',
    'tenant_usage_snapshot.tenantId',
    'workflow.projectId',
    'execution.projectId',
    'folder.projectId',
]

type World = {
    key: string
    tenantId: string
    slug: string
    projectId: string
    projectIds: string[]
    workflowIds: string[]
    fileIds: string[]
    connectionIds: string[]
    userIds: string[]
    exclusiveIdentityIds: string[]
    sharedIdentityId: string
    sharedUserInOtherTenantId: string
    memberEmail: string
    ownerToken: string
    personalAccessToken: string
}

type SyntheticColumn = {
    table_name: string
    column_name: string
    data_type: string
    udt_name: string
    is_nullable: string
    column_default: string | null
}

type Bystander = {
    tenantId: string
    projectIds: string[]
}
