import { WorkspaceRole } from '@fema/core-utils'
import { DefaultWorkspaceRole, Platform, PlatformPlan, PlatformRole, PrincipalType, Workspace, User, UserIdentity } from '@fema/shared'
import { FastifyInstance, InjectOptions } from 'fastify'
import { generateMockToken } from './auth'
import { db } from './db'
import {
    createMockApiKey,
    createMockWorkspaceMember,
    mockAndSaveBasicSetup,
    mockBasicUser,
} from './mocks'

export async function createTestContext(app: FastifyInstance, params?: TestContextParams): Promise<TestContext> {
    const { mockUserIdentity, mockOwner, mockPlatform, mockWorkspace } = await mockAndSaveBasicSetup({
        platform: params?.platform,
        plan: params?.plan,
        workspace: params?.workspace,
    })

    const token = await generateMockToken({
        id: mockOwner.id,
        type: PrincipalType.USER,
        platform: { id: mockPlatform.id },
    })

    return buildContext(app, {
        userIdentity: mockUserIdentity,
        user: mockOwner,
        platform: mockPlatform,
        workspace: mockWorkspace,
        token,
    })
}

export async function createMemberContext(
    app: FastifyInstance,
    parentCtx: TestContext,
    params: MemberContextParams,
): Promise<TestContext> {
    const { mockUser, mockUserIdentity } = await mockBasicUser({
        user: {
            platformId: parentCtx.platform.id,
            platformRole: PlatformRole.MEMBER,
        },
    })

    const workspaceRole = await db.findOneByOrFail<WorkspaceRole>('workspace_role', {
        name: params.workspaceRole,
    })

    const mockWorkspaceMember = createMockWorkspaceMember({
        userId: mockUser.id,
        platformId: parentCtx.platform.id,
        workspaceId: parentCtx.workspace.id,
        workspaceRoleId: workspaceRole.id,
    })
    await db.save('workspace_member', mockWorkspaceMember)

    const token = await generateMockToken({
        id: mockUser.id,
        type: PrincipalType.USER,
        platform: { id: parentCtx.platform.id },
    })

    return buildContext(app, {
        userIdentity: mockUserIdentity,
        user: mockUser,
        platform: parentCtx.platform,
        workspace: parentCtx.workspace,
        token,
    })
}

export async function createServiceContext(
    app: FastifyInstance,
    parentCtx: TestContext,
): Promise<TestContext> {
    const mockApiKey = createMockApiKey({
        platformId: parentCtx.platform.id,
    })
    await db.save('api_key', mockApiKey)

    return buildContext(app, {
        userIdentity: parentCtx.userIdentity,
        user: parentCtx.user,
        platform: parentCtx.platform,
        workspace: parentCtx.workspace,
        token: mockApiKey.value,
    })
}

function buildContext(app: FastifyInstance, data: ContextData): TestContext {
    const makeRequest = (method: string) => {
        return (url: string, bodyOrQuery?: Record<string, unknown>, opts?: RequestOptions) => {
            const inject: InjectOptions = {
                method: method as InjectOptions['method'],
                url: `/api${url}`,
                headers: {
                    authorization: `Bearer ${data.token}`,
                },
            }
            if (method === 'GET' || method === 'DELETE') {
                if (bodyOrQuery) {
                    inject.query = bodyOrQuery as Record<string, string>
                }
            }
            else {
                inject.body = bodyOrQuery
            }
            if (opts?.query) {
                inject.query = opts.query as Record<string, string>
            }
            return app.inject(inject)
        }
    }

    return {
        userIdentity: data.userIdentity,
        user: data.user,
        platform: data.platform,
        workspace: data.workspace,
        token: data.token,
        get: makeRequest('GET'),
        post: makeRequest('POST'),
        put: makeRequest('PUT'),
        delete: makeRequest('DELETE'),
        inject: (opts: InjectOptions) => {
            return app.inject({
                ...opts,
                headers: {
                    authorization: `Bearer ${data.token}`,
                    ...opts.headers,
                },
            })
        },
    }
}

export type TestContextParams = {
    platform?: Partial<Platform>
    plan?: Partial<PlatformPlan>
    workspace?: Partial<Workspace>
}

type MemberContextParams = {
    workspaceRole: DefaultWorkspaceRole | string
}

type RequestOptions = {
    query?: Record<string, string>
}

type ContextData = {
    userIdentity: UserIdentity
    user: User
    platform: Platform
    workspace: Workspace
    token: string
}

export type TestContext = {
    userIdentity: UserIdentity
    user: User
    platform: Platform
    workspace: Workspace
    token: string
    get: (url: string, query?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    post: (url: string, body?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    put: (url: string, body?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    delete: (url: string, query?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    inject: (opts: InjectOptions) => ReturnType<FastifyInstance['inject']>
}
