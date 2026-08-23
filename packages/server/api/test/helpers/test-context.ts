import { WorkspaceRole } from '@fema-ipaas/core-utils'
import { DefaultWorkspaceRole, Tenant, TenantPlan, TenantRole, PrincipalType, Workspace, User, UserIdentity } from '@fema-ipaas/shared'
import { FastifyInstance, InjectOptions } from 'fastify'
import { generateMockToken } from './auth'
import { db } from './db'
import {
    createMockWorkspaceMember,
    mockAndSaveBasicSetup,
    mockBasicUser,
} from './mocks'

export async function createTestContext(app: FastifyInstance, params?: TestContextParams): Promise<TestContext> {
    const { mockUserIdentity, mockOwner, mockTenant, mockWorkspace } = await mockAndSaveBasicSetup({
        tenant: params?.tenant,
        plan: params?.plan,
        workspace: params?.workspace,
    })

    const token = await generateMockToken({
        id: mockOwner.id,
        type: PrincipalType.USER,
        tenant: { id: mockTenant.id },
    })

    return buildContext(app, {
        userIdentity: mockUserIdentity,
        user: mockOwner,
        tenant: mockTenant,
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
            tenantId: parentCtx.tenant.id,
            tenantRole: TenantRole.MEMBER,
        },
    })

    const workspaceRole = await db.findOneByOrFail<WorkspaceRole>('workspace_role', {
        name: params.workspaceRole,
    })

    const mockWorkspaceMember = createMockWorkspaceMember({
        userId: mockUser.id,
        tenantId: parentCtx.tenant.id,
        workspaceId: parentCtx.workspace.id,
        workspaceRoleId: workspaceRole.id,
    })
    await db.save('workspace_member', mockWorkspaceMember)

    const token = await generateMockToken({
        id: mockUser.id,
        type: PrincipalType.USER,
        tenant: { id: parentCtx.tenant.id },
    })

    return buildContext(app, {
        userIdentity: mockUserIdentity,
        user: mockUser,
        tenant: parentCtx.tenant,
        workspace: parentCtx.workspace,
        token,
    })
}

export type TestContextParams = {
    tenant?: Partial<Tenant>
    plan?: Partial<TenantPlan>
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
    tenant: Tenant
    workspace: Workspace
    token: string
}

export type TestContext = {
    userIdentity: UserIdentity
    user: User
    tenant: Tenant
    workspace: Workspace
    token: string
    get: (url: string, query?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    post: (url: string, body?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    put: (url: string, body?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    delete: (url: string, query?: Record<string, unknown>, opts?: RequestOptions) => ReturnType<FastifyInstance['inject']>
    inject: (opts: InjectOptions) => ReturnType<FastifyInstance['inject']>
}
