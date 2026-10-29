import { ProjectType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { FindOperator } from 'typeorm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectSideEffects } from '../../../../src/app/project/project-side-effects'

const mocks = vi.hoisted(() => ({
    projects: [] as Record<string, unknown>[],
    scheduled: [] as string[],
}))

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => {
        if (value instanceof FindOperator) {
            return row[key] !== null && row[key] !== undefined
        }
        return row[key] === value
    })
}

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({
        findOneByOrFail: async () => ({ id: 'tenant-1', ownerId: 'tenant-owner' }),
    }),
}))
vi.mock('../../../../src/app/project/project-repo', () => ({
    projectRepo: () => ({
        findBy: async (where: Record<string, unknown>) => mocks.projects.filter((row) => isNilDeleted(row) && matches(row, where)),
        update: async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
            mocks.projects = mocks.projects.map((row) => matches(row, where) ? { ...row, ...patch } : row)
        },
        softDelete: async ({ id }: { id: string }) => {
            mocks.projects = mocks.projects.map((row) => row.id === id ? { ...row, deleted: '2026-10-30' } : row)
        },
    }),
}))
vi.mock('../../../../src/app/helper/system-jobs/system-job', () => ({
    systemJobsSchedule: () => ({
        upsertJob: async ({ job }: { job: { data: { projectId: string } } }) => {
            mocks.scheduled.push(job.data.projectId)
        },
    }),
}))
vi.mock('../../../../src/app/workflows/workflow/workflow.repo', () => ({ workflowRepo: () => ({ find: async () => [] }) }))
vi.mock('../../../../src/app/project/project-member.repo', () => ({ projectMemberRepo: () => ({}) }))
vi.mock('../../../../src/app/project/project-service', () => ({ projectService: () => ({ getTenantId: async () => 'tenant-1' }) }))
vi.mock('../../../../src/app/project/project-directory-utils', () => ({ projectDirectoryUtils: {} }))

function isNilDeleted(row: Record<string, unknown>): boolean {
    return row.deleted === null || row.deleted === undefined
}

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger

describe('projectSideEffects.deletePersonalProjectForUser', () => {
    beforeEach(() => {
        mocks.projects = []
        mocks.scheduled = []
    })

    it('hands projects the user already deleted to the tenant owner so the user row can be removed', async () => {
        mocks.projects = [
            { id: 'old-personal', ownerId: 'user-1', tenantId: 'tenant-1', type: ProjectType.PERSONAL, deleted: '2026-10-29' },
            { id: 'old-team', ownerId: 'user-1', tenantId: 'tenant-1', type: ProjectType.TEAM, deleted: '2026-10-28' },
        ]

        await projectSideEffects(log).deletePersonalProjectForUser({ userId: 'user-1', tenantId: 'tenant-1' })

        expect(mocks.projects.map((row) => row.ownerId)).toEqual(['tenant-owner', 'tenant-owner'])
    })

    it('keeps live team projects with the user so removal still asks for a transfer', async () => {
        mocks.projects = [
            { id: 'live-team', ownerId: 'user-1', tenantId: 'tenant-1', type: ProjectType.TEAM, deleted: null },
            { id: 'live-personal', ownerId: 'user-1', tenantId: 'tenant-1', type: ProjectType.PERSONAL, deleted: null },
            { id: 'other-tenant', ownerId: 'user-1', tenantId: 'tenant-2', type: ProjectType.PERSONAL, deleted: '2026-10-29' },
        ]

        await projectSideEffects(log).deletePersonalProjectForUser({ userId: 'user-1', tenantId: 'tenant-1' })

        const byId = Object.fromEntries(mocks.projects.map((row) => [row.id, row]))
        expect(byId['live-team'].ownerId).toBe('user-1')
        expect(byId['live-personal']).toMatchObject({ ownerId: 'tenant-owner', deleted: '2026-10-30' })
        expect(byId['other-tenant'].ownerId).toBe('user-1')
        expect(mocks.scheduled).toEqual(['live-personal'])
    })
})
