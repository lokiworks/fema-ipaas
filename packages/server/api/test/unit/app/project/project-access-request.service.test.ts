import { DefaultProjectRole, ProjectAccessRequestStatus, ProjectType, rolePermissions } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectAccessRequestService } from '../../../../src/app/project/project-access-request.service'

const mocks = vi.hoisted(() => ({
    requests: [] as Record<string, unknown>[],
    projects: [] as Record<string, unknown>[],
    users: [] as Record<string, unknown>[],
    members: [] as Record<string, unknown>[],
    roles: new Map<string, string>(),
    upsert: vi.fn(),
}))

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => {
        if (value !== null && typeof value === 'object') {
            return row[key] === null || row[key] === undefined
        }
        return row[key] === value
    })
}

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({
        findOneBy: async (where: Record<string, unknown>) => mocks.requests.find((row) => matches(row, where)) ?? null,
        find: async ({ where }: { where: Record<string, unknown> }) => mocks.requests.filter((row) => matches(row, where)),
        save: async (row: Record<string, unknown>) => {
            mocks.requests.push(row)
            return row
        },
        update: async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
            mocks.requests = mocks.requests.map((row) => matches(row, where) ? { ...row, ...patch } : row)
        },
    }),
}))
vi.mock('../../../../src/app/project/project-repo', () => ({
    projectRepo: () => ({
        findOneBy: async (where: Record<string, unknown>) => mocks.projects.find((row) => matches(row, where)) ?? null,
    }),
}))
vi.mock('../../../../src/app/project/project-member.repo', () => ({
    projectMemberRepo: () => ({
        findOneBy: async (where: Record<string, unknown>) => mocks.members.find((row) => matches(row, where)) ?? null,
    }),
}))
vi.mock('../../../../src/app/project/project-member.service', () => ({
    projectMemberService: () => ({ upsert: mocks.upsert }),
}))
vi.mock('../../../../src/app/user/user-service', () => ({
    userRepo: () => ({
        findOne: async ({ where }: { where: Record<string, unknown> }) => mocks.users.find((row) => matches(row, where)) ?? null,
        find: async () => mocks.users,
    }),
}))
vi.mock('../../../../src/app/project/project-access', () => ({
    projectAccess: () => ({
        resolveRole: async ({ userId, projectId }: { userId: string, projectId: string }) => {
            const project = mocks.projects.find((row) => row.id === projectId)
            if (project?.ownerId === userId) {
                return { name: DefaultProjectRole.ADMIN, permissions: rolePermissions[DefaultProjectRole.ADMIN] }
            }
            const role = mocks.roles.get(`${projectId}:${userId}`)
            if (role === undefined) {
                return null
            }
            const known = Object.values(DefaultProjectRole).find((candidate) => candidate === role) ?? DefaultProjectRole.VIEWER
            return { name: known, permissions: rolePermissions[known] }
        },
        projectsWithPermission: async () => [],
    }),
}))

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as FastifyBaseLogger

describe('projectAccessRequestService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.requests = []
        mocks.members = []
        mocks.roles.clear()
        mocks.projects = [
            { id: 'p1', tenantId: 't1', ownerId: 'owner', type: ProjectType.TEAM, displayName: '北森同步', deleted: null },
            { id: 'p2', tenantId: 't2', ownerId: 'other-owner', type: ProjectType.TEAM, displayName: '别家项目', deleted: null },
        ]
        mocks.users = [
            { id: 'asker', tenantId: 't1', identity: { email: 'asker@corp.test', firstName: '三', lastName: '张' } },
            { id: 'owner', tenantId: 't1', identity: { email: 'owner@corp.test', firstName: '四', lastName: '李' } },
        ]
        mocks.upsert.mockImplementation(async ({ projectId, userId, role }: { projectId: string, userId: string, role: DefaultProjectRole }) => {
            const member = { id: 'm1', created: '2026-10-30T00:00:00.000Z', updated: '2026-10-30T00:00:00.000Z', projectId, userId, role }
            mocks.members.push(member)
            mocks.roles.set(`${projectId}:${userId}`, role)
            return member
        })
    })

    it('treats a project of another tenant as not found', async () => {
        await expect(projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p2' })).rejects.toMatchObject({
            error: { code: 'ENTITY_NOT_FOUND' },
        })
        expect(mocks.requests).toHaveLength(0)
    })

    it('refuses people who are already members', async () => {
        mocks.roles.set('p1:asker', DefaultProjectRole.DEVELOPER)
        await expect(projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p1' })).rejects.toMatchObject({
            error: { params: { messageKey: 'projectAccessAlreadyMember' } },
        })
    })

    it('returns the pending request instead of creating a second one', async () => {
        const first = await projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p1', reason: '  需要看同步日志 ' })
        const second = await projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p1', reason: '再申请一次' })
        expect(first.created).toBe(true)
        expect(first.request.reason).toBe('需要看同步日志')
        expect(second.created).toBe(false)
        expect(second.request.id).toBe(first.request.id)
        expect(mocks.requests).toHaveLength(1)
    })

    it('stores an empty reason as null', async () => {
        const result = await projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p1', reason: '   ' })
        expect(result.request.reason).toBeNull()
    })

    it('does not let a non-approver decide', async () => {
        const { request } = await projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p1' })
        mocks.roles.set('p1:dev', DefaultProjectRole.DEVELOPER)
        await expect(projectAccessRequestService(log).decide({ tenantId: 't1', requestId: request.id, actorId: 'dev', approve: true })).rejects.toMatchObject({
            error: { code: 'AUTHORIZATION' },
        })
        expect(mocks.upsert).not.toHaveBeenCalled()
        expect(mocks.requests[0].status).toBe(ProjectAccessRequestStatus.PENDING)
    })

    it('does not find requests of another tenant', async () => {
        const { request } = await projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p1' })
        await expect(projectAccessRequestService(log).decide({ tenantId: 't2', requestId: request.id, actorId: 'other-owner', approve: true })).rejects.toMatchObject({
            error: { code: 'ENTITY_NOT_FOUND' },
        })
    })

    it('adds the requester with the lowest role by default when approved', async () => {
        const { request } = await projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p1' })
        const result = await projectAccessRequestService(log).decide({ tenantId: 't1', requestId: request.id, actorId: 'owner', approve: true })
        expect(mocks.upsert).toHaveBeenCalledWith({ projectId: 'p1', userId: 'asker', role: DefaultProjectRole.VIEWER })
        expect(result.request.status).toBe(ProjectAccessRequestStatus.APPROVED)
        expect(result.request.grantedRole).toBe(DefaultProjectRole.VIEWER)
        expect(result.alreadyMember).toBe(false)
        expect(result.requesterEmail).toBe('asker@corp.test')
        expect(mocks.requests[0]).toMatchObject({ status: ProjectAccessRequestStatus.APPROVED, decidedBy: 'owner', grantedRole: DefaultProjectRole.VIEWER })
    })

    it('lets a project admin approve with a chosen role', async () => {
        mocks.roles.set('p1:admin', DefaultProjectRole.ADMIN)
        const { request } = await projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p1' })
        await projectAccessRequestService(log).decide({ tenantId: 't1', requestId: request.id, actorId: 'admin', approve: true, role: DefaultProjectRole.DEVELOPER })
        expect(mocks.members).toEqual([expect.objectContaining({ projectId: 'p1', userId: 'asker', role: DefaultProjectRole.DEVELOPER })])
    })

    it('only changes the status when rejected', async () => {
        const { request } = await projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p1' })
        const result = await projectAccessRequestService(log).decide({ tenantId: 't1', requestId: request.id, actorId: 'owner', approve: false })
        expect(mocks.upsert).not.toHaveBeenCalled()
        expect(mocks.members).toHaveLength(0)
        expect(result.request.status).toBe(ProjectAccessRequestStatus.REJECTED)
        expect(result.request.grantedRole).toBeNull()
        expect(mocks.requests[0]).toMatchObject({ status: ProjectAccessRequestStatus.REJECTED, decidedBy: 'owner' })
    })

    it('refuses to decide a request twice', async () => {
        const { request } = await projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p1' })
        await projectAccessRequestService(log).decide({ tenantId: 't1', requestId: request.id, actorId: 'owner', approve: false })
        await expect(projectAccessRequestService(log).decide({ tenantId: 't1', requestId: request.id, actorId: 'owner', approve: true })).rejects.toMatchObject({
            error: { params: { messageKey: 'projectAccessAlreadyDecided' } },
        })
    })

    it('lists only the pending requests of the asked project with requester names', async () => {
        await projectAccessRequestService(log).create({ tenantId: 't1', userId: 'asker', projectId: 'p1', reason: '看日志' })
        const listed = await projectAccessRequestService(log).listPending({ tenantId: 't1', projectId: 'p1' })
        expect(listed).toEqual([expect.objectContaining({ userEmail: 'asker@corp.test', userFirstName: '三', userLastName: '张', reason: '看日志' })])
        expect(await projectAccessRequestService(log).listPending({ tenantId: 't2', projectId: 'p1' })).toEqual([])
    })
})
