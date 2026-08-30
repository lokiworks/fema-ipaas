import { isNil, spreadIfDefined } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, Tenant, TenantRole, PrincipalType, Project, User, UserIdentity } from '@fema-ipaas/shared'
import { FastifyInstance, InjectOptions } from 'fastify'
import { generateMockToken } from './auth'
import { db } from './db'
import {
    createMockProjectMember,
    mockAndSaveBasicSetup,
    mockBasicUser,
} from './mocks'

export async function createTestContext(app: FastifyInstance, params?: TestContextParams): Promise<TestContext> {
    const { mockUserIdentity, mockOwner, mockTenant, mockProject } = await mockAndSaveBasicSetup({
        tenant: params?.tenant,
        project: params?.project,
    })

    const token = await generateMockToken({
        id: mockOwner.id,
        type: PrincipalType.USER,
        tenant: { id: mockTenant.id },
    })

    return buildContext({
        app,
        data: {
            userIdentity: mockUserIdentity,
            user: mockOwner,
            tenant: mockTenant,
            project: mockProject,
            token,
        },
    })
}

export async function createMemberContext(
    app: FastifyInstance,
    parentCtx: TestContext,
    params: MemberContextParams,
): Promise<TestContext> {
    const { mockUser, mockUserIdentity } = await mockBasicUser({
        user: {
            tenantId: parentCtx.tenant.id,
            tenantRole: TenantRole.MEMBER,
        },
    })

    const mockProjectMember = createMockProjectMember({
        userId: mockUser.id,
        projectId: parentCtx.project.id,
        role: params.projectRole,
    })
    await db.save('project_member', mockProjectMember)

    const token = await generateMockToken({
        id: mockUser.id,
        type: PrincipalType.USER,
        tenant: { id: parentCtx.tenant.id },
    })

    return buildContext({
        app,
        data: {
            userIdentity: mockUserIdentity,
            user: mockUser,
            tenant: parentCtx.tenant,
            project: parentCtx.project,
            token,
        },
    })
}

function toQueryString(params: Record<string, unknown>): string | undefined {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
        if (isNil(value)) {
            continue
        }
        if (Array.isArray(value)) {
            value.filter((item) => !isNil(item)).forEach((item) => search.append(key, String(item)))
            continue
        }
        search.append(key, String(value))
    }
    const serialized = search.toString()
    return serialized.length === 0 ? undefined : serialized
}

function buildRequest({ app, token, method }: BuildRequestParams) {
    const carriesBody = method === 'POST' || method === 'PUT'
    return (url: string, payload?: Record<string, unknown>, opts?: RequestOptions) => {
        const query = opts?.query ?? (carriesBody || isNil(payload) ? undefined : payload)
        return app.inject({
            method,
            url: `${API_PREFIX}${url}`,
            headers: { authorization: `Bearer ${token}` },
            ...spreadIfDefined('query', isNil(query) ? undefined : toQueryString(query)),
            ...spreadIfDefined('body', carriesBody ? payload : undefined),
        })
    }
}

function buildContext({ app, data }: BuildContextParams): TestContext {
    return {
        ...data,
        get: buildRequest({ app, token: data.token, method: 'GET' }),
        post: buildRequest({ app, token: data.token, method: 'POST' }),
        put: buildRequest({ app, token: data.token, method: 'PUT' }),
        delete: buildRequest({ app, token: data.token, method: 'DELETE' }),
        inject: (opts: InjectOptions) => app.inject({
            ...opts,
            headers: {
                authorization: `Bearer ${data.token}`,
                ...opts.headers,
            },
        }),
    }
}

const API_PREFIX = '/api'

export type TestContextParams = {
    tenant?: Partial<Tenant>
    project?: Partial<Project>
}

type MemberContextParams = {
    projectRole: DefaultProjectRole
}

type RequestOptions = {
    query?: Record<string, string>
}

type BuildRequestParams = {
    app: FastifyInstance
    token: string
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
}

type BuildContextParams = {
    app: FastifyInstance
    data: ContextData
}

type ContextData = {
    userIdentity: UserIdentity
    user: User
    tenant: Tenant
    project: Project
    token: string
}

export type TestContext = {
    userIdentity: UserIdentity
    user: User
    tenant: Tenant
    project: Project
    token: string
    get: (url: string, query?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    post: (url: string, body?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    put: (url: string, body?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    delete: (url: string, query?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    inject: (opts: InjectOptions) => ReturnType<FastifyInstance['inject']>
}
