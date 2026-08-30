import { ProjectRole } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, Tenant, TenantPlan, TenantRole, PrincipalType, Project, User, UserIdentity } from '@fema-ipaas/shared'
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
        plan: params?.plan,
        project: params?.project,
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
        project: mockProject,
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

    const projectRole = await db.findOneByOrFail<ProjectRole>('project_role', {
        name: params.projectRole,
    })

    const mockProjectMember = createMockProjectMember({
        userId: mockUser.id,
        tenantId: parentCtx.tenant.id,
        projectId: parentCtx.project.id,
        projectRoleId: projectRole.id,
    })
    await db.save('project_member', mockProjectMember)

    const token = await generateMockToken({
        id: mockUser.id,
        type: PrincipalType.USER,
        tenant: { id: parentCtx.tenant.id },
    })

    return buildContext(app, {
        userIdentity: mockUserIdentity,
        user: mockUser,
        tenant: parentCtx.tenant,
        project: parentCtx.project,
        token,
    })
}

export type TestContextParams = {
    tenant?: Partial<Tenant>
    plan?: Partial<TenantPlan>
    project?: Partial<Project>
}

type MemberContextParams = {
    projectRole: DefaultProjectRole | string
}

type RequestOptions = {
    query?: Record<string, string>
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
