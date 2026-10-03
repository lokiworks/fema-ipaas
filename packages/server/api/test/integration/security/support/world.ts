import { generateId } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, PrincipalType, Project, ProjectType, Tenant, TenantRole, User } from '@fema-ipaas/shared'
import { FastifyInstance, InjectOptions } from 'fastify'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import { createMockProject, createMockProjectMember, mockBasicUser } from '../../../helpers/mocks'
import { createTestContext, TestContext } from '../../../helpers/test-context'

const API_PREFIX = '/api'

const ROLE_BY_IDENTITY: Partial<Record<Identity, DefaultProjectRole>> = {
    projectAdmin: DefaultProjectRole.ADMIN,
    developer: DefaultProjectRole.DEVELOPER,
    operator: DefaultProjectRole.OPERATOR,
    viewer: DefaultProjectRole.VIEWER,
}

async function createTenantMember({ tenantId }: { tenantId: string }): Promise<User> {
    const { mockUser } = await mockBasicUser({ user: { tenantId, tenantRole: TenantRole.MEMBER } })
    return mockUser
}

async function addMember({ userId, projectId, role }: { userId: string, projectId: string, role: DefaultProjectRole }): Promise<void> {
    await db.save('project_member', createMockProjectMember({ userId, projectId, role }))
}

async function tokenFor({ user, tenantId }: { user: User, tenantId: string }): Promise<string> {
    return generateMockToken({ id: user.id, type: PrincipalType.USER, tenant: { id: tenantId } })
}

async function buildActor({ identity, user, tenantId }: { identity: Identity, user: User | null, tenantId: string | null }): Promise<Actor> {
    if (user === null || tenantId === null) {
        return { identity, userId: null, token: null }
    }
    return { identity, userId: user.id, token: await tokenFor({ user, tenantId }) }
}

async function buildWorld({ app }: { app: FastifyInstance }): Promise<World> {
    const tenantAdminContext = await createTestContext(app, { project: { type: ProjectType.TEAM }, tenant: { emailAuthEnabled: true } })
    const foreignTenantContext = await createTestContext(app, { project: { type: ProjectType.TEAM }, tenant: { emailAuthEnabled: true } })

    const projectB: Project = createMockProject({ tenantId: tenantAdminContext.tenant.id, ownerId: tenantAdminContext.user.id, type: ProjectType.TEAM })
    await db.save('project', projectB)

    const roleHolders = await Promise.all(
        (Object.keys(ROLE_BY_IDENTITY) as Identity[]).map(async (identity) => {
            const user = await createTenantMember({ tenantId: tenantAdminContext.tenant.id })
            await addMember({ userId: user.id, projectId: tenantAdminContext.project.id, role: ROLE_BY_IDENTITY[identity] as DefaultProjectRole })
            return buildActor({ identity, user, tenantId: tenantAdminContext.tenant.id })
        }),
    )
    const nonMemberUser = await createTenantMember({ tenantId: tenantAdminContext.tenant.id })
    const foreignProjectAdminUser = await createTenantMember({ tenantId: tenantAdminContext.tenant.id })
    await addMember({ userId: foreignProjectAdminUser.id, projectId: projectB.id, role: DefaultProjectRole.ADMIN })

    const actorList: Actor[] = [
        ...roleHolders,
        await buildActor({ identity: 'tenantAdmin', user: tenantAdminContext.user, tenantId: tenantAdminContext.tenant.id }),
        await buildActor({ identity: 'nonMember', user: nonMemberUser, tenantId: tenantAdminContext.tenant.id }),
        await buildActor({ identity: 'foreignProjectAdmin', user: foreignProjectAdminUser, tenantId: tenantAdminContext.tenant.id }),
        await buildActor({ identity: 'otherTenantAdmin', user: foreignTenantContext.user, tenantId: foreignTenantContext.tenant.id }),
        await buildActor({ identity: 'anonymous', user: null, tenantId: null }),
    ]
    const actors = Object.fromEntries(actorList.map((actor) => [actor.identity, actor])) as Record<Identity, Actor>

    const scopes: Record<Scope, ScopeInfo> = {
        A: { scope: 'A', tenant: tenantAdminContext.tenant, project: tenantAdminContext.project, ownerId: tenantAdminContext.user.id, actor: actors.projectAdmin },
        B: { scope: 'B', tenant: tenantAdminContext.tenant, project: projectB, ownerId: tenantAdminContext.user.id, actor: actors.foreignProjectAdmin },
        T2: { scope: 'T2', tenant: foreignTenantContext.tenant, project: foreignTenantContext.project, ownerId: foreignTenantContext.user.id, actor: actors.otherTenantAdmin },
    }

    async function inject({ token, request }: { token: string | null, request: WorldRequest }): Promise<WorldResponse> {
        const response = await app.inject({
            method: request.method,
            url: `${API_PREFIX}${request.url}`,
            headers: { ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...request.headers },
            ...(request.query === undefined ? {} : { query: toQuery({ query: request.query }) }),
            ...(request.body === undefined || request.body === null || typeof request.body !== 'object' ? {} : { payload: request.body }),
        })
        return { status: response.statusCode, text: response.body, headers: response.headers, json: () => safeJson(response.body) }
    }

    return {
        app,
        actors,
        scopes,
        tenantAdminContext,
        foreignTenantContext,
        send: ({ identity, request }) => inject({ token: actors[identity].token, request }),
        sendAsToken: inject,
        newId: generateId,
    }
}

function toQuery({ query }: { query: Record<string, unknown> }): Record<string, string | string[]> {
    return Object.fromEntries(
        Object.entries(query)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : String(value)]),
    )
}

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text)
    }
    catch {
        return null
    }
}

export const securityWorld = {
    build: buildWorld,
    createTenantMember,
    addMember,
    tokenFor,
}

export type Identity = 'projectAdmin' | 'developer' | 'operator' | 'viewer' | 'tenantAdmin' | 'nonMember' | 'foreignProjectAdmin' | 'otherTenantAdmin' | 'anonymous'

export type Scope = 'A' | 'B' | 'T2'

export type Actor = {
    identity: Identity
    userId: string | null
    token: string | null
}

export type ScopeInfo = {
    scope: Scope
    tenant: Tenant
    project: Project
    ownerId: string
    actor: Actor
}

export type WorldRequest = {
    method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'
    url: string
    query?: Record<string, unknown>
    body?: unknown
    headers?: Record<string, string>
}

export type WorldResponse = {
    status: number
    text: string
    headers: Record<string, unknown>
    json: () => unknown
}

export type World = {
    app: FastifyInstance
    actors: Record<Identity, Actor>
    scopes: Record<Scope, ScopeInfo>
    tenantAdminContext: TestContext
    foreignTenantContext: TestContext
    send: (params: { identity: Identity, request: WorldRequest }) => Promise<WorldResponse>
    sendAsToken: (params: { token: string | null, request: WorldRequest }) => Promise<WorldResponse>
    newId: () => string
}

export const ALL_IDENTITIES: readonly Identity[] = ['projectAdmin', 'developer', 'operator', 'viewer', 'tenantAdmin', 'nonMember', 'foreignProjectAdmin', 'otherTenantAdmin', 'anonymous']
