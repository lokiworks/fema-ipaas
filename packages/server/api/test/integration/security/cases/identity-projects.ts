import { generateId, Permission } from '@fema-ipaas/core-utils'
import { DefaultProjectRole } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { createMockProjectMember } from '../../../helpers/mocks'
import { identitySeed } from '../support/identity-seed'
import { MatrixCase } from '../support/matrix'

export const identityProjectCases: MatrixCase[] = [
    {
        id: 'GET /v1/projects',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => {
            if (identity === 'nonMember') {
                return [world.scopes.A.project.id, world.scopes.B.project.id, world.scopes.T2.project.id]
            }
            if (identity === 'projectAdmin' || identity === 'developer' || identity === 'operator' || identity === 'viewer') {
                return [world.scopes.B.project.id, world.scopes.T2.project.id]
            }
            if (identity === 'foreignProjectAdmin') {
                return [world.scopes.A.project.id, world.scopes.T2.project.id]
            }
            if (identity === 'otherTenantAdmin') {
                return [world.scopes.A.project.id, world.scopes.B.project.id, world.scopes.A.tenant.id]
            }
            return [world.scopes.T2.project.id]
        },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/projects' } }),
    },
    {
        id: 'POST /v1/projects',
        label: 'any tenant member can create a project and becomes its admin',
        access: { type: 'authenticated' },
        expectOk: [201],
        prepare: async () => ({ request: { method: 'POST', url: '/v1/projects', body: { displayName: `sec-${generateId()}`.slice(0, 30), externalId: null, metadata: null, maxConcurrentJobs: null } } }),
    },
    {
        id: 'POST /v1/projects/:id',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const project = await identitySeed.freshTeamProject({ world, scope })
            return { request: { method: 'POST', url: `/v1/projects/${project.id}`, body: { description: 'changed' } }, state: { projectId: project.id } }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ description: string | null }>('project', { id: String(prepared.state?.projectId) })
            expect(row?.description ?? null).not.toBe('changed')
        },
    },
    {
        id: 'DELETE /v1/projects/:id',
        access: { type: 'project', permission: Permission.WRITE_PROJECT },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const project = await identitySeed.freshTeamProject({ world, scope })
            return { request: { method: 'DELETE', url: `/v1/projects/${project.id}` }, state: { projectId: project.id } }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ deleted: string | null }>('project', { id: String(prepared.state?.projectId) })
            expect(row?.deleted ?? null).toBeNull()
        },
    },
    {
        id: 'POST /v1/projects/:id/info',
        label: 'renaming a project is a project-admin action',
        access: { type: 'project', permission: Permission.WRITE_PROJECT },
        prepare: async ({ world, scope }) => {
            const project = await identitySeed.freshTeamProject({ world, scope })
            return {
                request: { method: 'POST', url: `/v1/projects/${project.id}/info`, body: { displayName: `renamed-${generateId()}`.slice(0, 30), description: 'x', icon: { color: 'BLUE' } } },
                state: { projectId: project.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ displayName: string }>('project', { id: String(prepared.state?.projectId) })
            expect(row?.displayName.startsWith('renamed-')).toBe(false)
        },
    },
    {
        id: 'POST /v1/projects/:id/copy',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [201],
        prepare: async ({ world, scope }) => ({
            request: { method: 'POST', url: `/v1/projects/${world.scopes[scope].project.id}/copy`, body: { displayName: `copy-${generateId()}`.slice(0, 30) } },
        }),
    },
    {
        id: 'GET /v1/projects/:id/resource-counts',
        access: { type: 'project', permission: Permission.READ_PROJECT },
        prepare: async ({ world, scope }) => ({ request: { method: 'GET', url: `/v1/projects/${world.scopes[scope].project.id}/resource-counts` } }),
    },
    {
        id: 'GET /v1/projects/directory',
        label: 'team project directory is visible to every tenant member',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => (identity === 'otherTenantAdmin' ? [world.scopes.A.project.id, world.scopes.B.project.id] : [world.scopes.T2.project.id]),
        prepare: async () => ({ request: { method: 'GET', url: '/v1/projects/directory' } }),
    },
    {
        id: 'GET /v1/project-members',
        access: { type: 'project', permission: Permission.READ_PROJECT_MEMBER },
        scopedRead: true,
        prepare: async ({ world, scope }) => ({ request: { method: 'GET', url: '/v1/project-members', query: { projectId: world.scopes[scope].project.id } } }),
    },
    {
        id: 'GET /v1/project-members/me',
        access: { type: 'project', permission: undefined },
        prepare: async ({ world, scope }) => ({ request: { method: 'GET', url: '/v1/project-members/me', query: { projectId: world.scopes[scope].project.id } } }),
    },
    {
        id: 'POST /v1/project-members',
        access: { type: 'project', permission: Permission.WRITE_PROJECT_MEMBER },
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            return {
                request: { method: 'POST', url: '/v1/project-members', body: { projectId: world.scopes[scope].project.id, userId: user.id, role: DefaultProjectRole.VIEWER } },
                state: { userId: user.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const membership = await db.findOneBy('project_member', { userId: String(prepared.state?.userId) })
            expect(membership).toBeNull()
        },
    },
    {
        id: 'DELETE /v1/project-members/:id',
        access: { type: 'project', permission: Permission.WRITE_PROJECT_MEMBER },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            const member = createMockProjectMember({ userId: user.id, projectId: world.scopes[scope].project.id, role: DefaultProjectRole.VIEWER })
            await db.save('project_member', member)
            const memberId = member.id
            return { request: { method: 'DELETE', url: `/v1/project-members/${memberId}`, query: { projectId: world.scopes[scope].project.id } }, state: { memberId } }
        },
        afterDenied: async ({ prepared }) => {
            const membership = await db.findOneBy('project_member', { id: String(prepared.state?.memberId) })
            expect(membership).not.toBeNull()
        },
    },
]
