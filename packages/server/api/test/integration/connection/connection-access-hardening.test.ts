import { generateId } from '@fema-ipaas/core-utils'
import { ConnectionSharePermission, DefaultProjectRole, ProjectType, UserStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { encryptUtils } from '../../../src/app/helper/encryption'
import { db } from '../../helpers/db'
import { createMockConnection, createMockProject } from '../../helpers/mocks'
import { createMemberContext, createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

const CONNECTOR_NAME = '@fema-ipaas/connector-slack'

async function createTeamContext(): Promise<TestContext> {
    return createTestContext(app!, { project: { type: ProjectType.TEAM } })
}

async function saveConnection({ ctx, ownerId, displayName, projectIds, projectMembersPermission }: SaveConnectionParams): Promise<string> {
    const mock = createMockConnection({ tenantId: ctx.tenant.id, projectIds: projectIds ?? [ctx.project.id], connectorName: CONNECTOR_NAME, displayName }, ownerId ?? ctx.user.id)
    const connection = {
        ...mock,
        value: await encryptUtils.encryptObject(mock.value),
        projectMembersPermission: projectMembersPermission ?? null,
    }
    await db.save('connection', connection)
    return connection.id
}

async function saveExtraProject({ ctx }: { ctx: TestContext }): Promise<string> {
    const project = createMockProject({ ownerId: ctx.user.id, tenantId: ctx.tenant.id, type: ProjectType.TEAM })
    await db.save('project', project)
    return project.id
}

async function saveMcpService({ projectId, ownerId, externalId }: { projectId: string, ownerId: string, externalId: string }): Promise<string> {
    const id = generateId()
    await databaseConnection().getRepository('mcp_service').save({
        id,
        projectId,
        name: `service-${id}`,
        description: 'test',
        enabled: true,
        tools: [],
        tokenHash: generateId(),
        tokenHint: '1234',
        key: `key-${id.toLowerCase()}`,
        ownerId,
        publishedTools: null,
        releases: [],
        draftChanged: false,
        listed: false,
        credentialMode: 'DEVELOPER',
        fixedConnections: { [CONNECTOR_NAME]: externalId },
        availability: { mode: 'ALL', userIds: [] },
    })
    return id
}

describe('GET /v1/connections/:id/detail references', () => {
    it('shows only the MCP services and project configs of projects the caller belongs to, and counts the rest', async () => {
        const owner = await createTeamContext()
        const hiddenProjectId = await saveExtraProject({ ctx: owner })
        const connection = createMockConnection({ tenantId: owner.tenant.id, projectIds: [owner.project.id, hiddenProjectId], connectorName: CONNECTOR_NAME }, owner.user.id)
        await db.save('connection', { ...connection, projectMembersPermission: ConnectionSharePermission.USE })
        const viewer = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })
        const visibleService = await saveMcpService({ projectId: owner.project.id, ownerId: owner.user.id, externalId: connection.externalId })
        await saveMcpService({ projectId: hiddenProjectId, ownerId: owner.user.id, externalId: connection.externalId })
        const target = createMockConnection({ tenantId: owner.tenant.id, projectIds: [owner.project.id, hiddenProjectId], connectorName: CONNECTOR_NAME }, owner.user.id)
        await db.save('connection', target)
        await databaseConnection().getRepository('connection_replacement').save({ id: generateId(), projectId: owner.project.id, sourceConnectionId: connection.id, targetConnectionId: target.id })
        await databaseConnection().getRepository('connection_replacement').save({ id: generateId(), projectId: hiddenProjectId, sourceConnectionId: connection.id, targetConnectionId: target.id })

        const response = await viewer.get(`/v1/connections/${connection.id}/detail`)

        expect(response.statusCode).toBe(StatusCodes.OK)
        const { references } = response.json()
        expect(references.mcpServices.map((service: { serviceId: string }) => service.serviceId)).toEqual([visibleService])
        expect(references.hiddenMcpServiceCount).toBe(1)
        expect(references.projectConfigs).toHaveLength(1)
        expect(references.projectConfigs[0].projectId).toBe(owner.project.id)
        expect(references.hiddenProjectConfigCount).toBe(1)
    })

    it('still refuses to delete while a hidden project uses the connection', async () => {
        const owner = await createTeamContext()
        const hiddenProjectId = await saveExtraProject({ ctx: owner })
        const connectionId = await saveConnection({ ctx: owner, projectIds: [owner.project.id, hiddenProjectId] })
        const connection = await db.findOneByOrFail<{ externalId: string }>('connection', { id: connectionId })
        await saveMcpService({ projectId: hiddenProjectId, ownerId: owner.user.id, externalId: connection.externalId })

        const response = await owner.delete(`/v1/connections/${connectionId}`)

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(response.json().params.message).toContain('1 MCP services')
        expect(await db.findOneBy('connection', { id: connectionId })).not.toBeNull()
    })
})

describe('GET /v1/connections/:id', () => {
    it('does not expose a private connection of someone else to project members', async () => {
        const owner = await createTeamContext()
        const viewer = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })
        const privateId = await saveConnection({ ctx: owner })

        const asOwner = await owner.get(`/v1/connections/${privateId}`)
        const asViewer = await viewer.get(`/v1/connections/${privateId}`)

        expect(asOwner.statusCode).toBe(StatusCodes.OK)
        expect(asViewer.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('lets members read a connection that is shared with all project members', async () => {
        const owner = await createTeamContext()
        const viewer = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })
        const sharedId = await saveConnection({ ctx: owner, projectMembersPermission: ConnectionSharePermission.USE })

        const response = await viewer.get(`/v1/connections/${sharedId}`)

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.json()).not.toHaveProperty('value')
    })
})

describe('POST /v1/connections/replace access', () => {
    it('refuses to repoint workflows onto a connection the caller cannot use', async () => {
        const owner = await createTeamContext()
        const operator = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.OPERATOR })
        const ownSource = await saveConnection({ ctx: owner, ownerId: operator.user.id })
        const someoneElsesPrivate = await saveConnection({ ctx: owner })

        const response = await operator.post('/v1/connections/replace', {
            sourceConnectionId: ownSource,
            targetConnectionId: someoneElsesPrivate,
            projectId: owner.project.id,
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('refuses to replace a connection the caller cannot use', async () => {
        const owner = await createTeamContext()
        const operator = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.OPERATOR })
        const someoneElsesPrivate = await saveConnection({ ctx: owner })
        const ownTarget = await saveConnection({ ctx: owner, ownerId: operator.user.id })

        const response = await operator.post('/v1/connections/replace', {
            sourceConnectionId: someoneElsesPrivate,
            targetConnectionId: ownTarget,
            projectId: owner.project.id,
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('allows replacing between connections the caller can use', async () => {
        const owner = await createTeamContext()
        const operator = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.OPERATOR })
        const shared = await saveConnection({ ctx: owner, projectMembersPermission: ConnectionSharePermission.USE })
        const ownTarget = await saveConnection({ ctx: owner, ownerId: operator.user.id })

        const response = await operator.post('/v1/connections/replace', {
            sourceConnectionId: shared,
            targetConnectionId: ownTarget,
            projectId: owner.project.id,
        })

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
    })
})

describe('connection search', () => {
    it('treats % and _ in the search text literally', async () => {
        const owner = await createTeamContext()
        await saveConnection({ ctx: owner, displayName: '100% prod' })
        await saveConnection({ ctx: owner, displayName: 'plain name' })
        await saveConnection({ ctx: owner, displayName: 'snake_case' })

        const percent = await owner.get('/v1/connections/accessible', { search: '%' })
        const underscore = await owner.get('/v1/connections/accessible', { search: '_' })
        const plain = await owner.get('/v1/connections/accessible', { search: 'plain' })
        const projectList = await owner.get('/v1/connections', { projectId: owner.project.id, displayName: '%' })

        expect(percent.json().data.map((row: { displayName: string }) => row.displayName)).toEqual(['100% prod'])
        expect(underscore.json().data.map((row: { displayName: string }) => row.displayName)).toEqual(['snake_case'])
        expect(plain.json().data).toHaveLength(1)
        expect(projectList.json().data.map((row: { displayName: string }) => row.displayName)).toEqual(['100% prod'])
    })
})

describe('GET /v1/connections/share-candidates', () => {
    it('lets a plain member list the active colleagues of their own tenant, without themselves or other tenants', async () => {
        const owner = await createTeamContext()
        const member = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.OPERATOR })
        const colleague = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })
        const disabled = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })
        await db.update('user', disabled.user.id, { status: UserStatus.INACTIVE })
        const otherTenant = await createTeamContext()

        const response = await member.get('/v1/connections/share-candidates')

        expect(response.statusCode).toBe(StatusCodes.OK)
        const ids = response.json().map((candidate: { id: string }) => candidate.id)
        expect(ids).toContain(colleague.user.id)
        expect(ids).toContain(owner.user.id)
        expect(ids).not.toContain(member.user.id)
        expect(ids).not.toContain(disabled.user.id)
        expect(ids).not.toContain(otherTenant.user.id)
        expect(response.json()[0]).toEqual({ id: expect.any(String), email: expect.any(String), firstName: expect.any(String), lastName: expect.any(String) })
    })

    it('filters by name or email and treats wildcards literally', async () => {
        const owner = await createTeamContext()
        const member = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.OPERATOR })
        const target = await createMemberContext(app!, owner, { projectRole: DefaultProjectRole.VIEWER })

        const byEmail = await member.get('/v1/connections/share-candidates', { search: target.userIdentity.email.toUpperCase() })
        const wildcard = await member.get('/v1/connections/share-candidates', { search: '%' })

        expect(byEmail.json().map((candidate: { id: string }) => candidate.id)).toEqual([target.user.id])
        expect(wildcard.json()).toHaveLength(0)
    })

    it('is not available to anonymous callers', async () => {
        const response = await app!.inject({ method: 'GET', url: '/api/v1/connections/share-candidates' })

        expect([StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN]).toContain(response.statusCode)
    })
})

describe('connection display name length', () => {
    it('applies the same 30 character limit to creating and renaming', async () => {
        const owner = await createTeamContext()
        const connectionId = await saveConnection({ ctx: owner })
        const tooLong = 'x'.repeat(31)
        const atLimit = 'y'.repeat(30)

        const renameTooLong = await owner.post(`/v1/connections/${connectionId}`, { displayName: tooLong })
        const renameAtLimit = await owner.post(`/v1/connections/${connectionId}`, { displayName: atLimit })
        const createTooLong = await owner.post('/v1/connections', {
            projectId: owner.project.id,
            externalId: 'long-name',
            displayName: tooLong,
            connectorName: CONNECTOR_NAME,
            type: 'PLACEHOLDER',
        })

        expect(renameTooLong.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(renameAtLimit.statusCode).toBe(StatusCodes.OK)
        expect(createTooLong.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect((await db.findOneByOrFail<{ displayName: string }>('connection', { id: connectionId })).displayName).toBe(atLimit)
    })
})

describe('POST /v1/global-connections/:id', () => {
    it('answers 404 for a connection that does not exist or belongs to another tenant', async () => {
        const admin = await createTeamContext()
        const other = await createTeamContext()
        const foreign = await saveConnection({ ctx: other })

        const missing = await admin.post(`/v1/global-connections/${generateId()}`, { displayName: 'x' })
        const foreignResponse = await admin.post(`/v1/global-connections/${foreign}`, { displayName: 'x' })

        expect(missing.statusCode).toBe(StatusCodes.NOT_FOUND)
        expect(foreignResponse.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
})

type SaveConnectionParams = {
    ctx: TestContext
    ownerId?: string
    displayName?: string
    projectIds?: string[]
    projectMembersPermission?: ConnectionSharePermission
}
