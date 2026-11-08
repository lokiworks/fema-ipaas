import { WorkflowStatus } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tenantUsageSnapshotService } from '../../../../src/app/platform/tenant-usage-snapshot.service'

const query = vi.fn()
const findOne = vi.fn()

vi.mock('../../../../src/app/database/database-connection', () => ({
    databaseConnection: () => ({ query: (...args: unknown[]) => query(...args) }),
}))

vi.mock('../../../../src/app/project/project-repo', () => ({
    projectRepo: () => ({ findOne: (...args: unknown[]) => findOne(...args) }),
}))

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

describe('tenant usage snapshot service', () => {
    beforeEach(() => {
        query.mockReset()
        findOne.mockReset()
        log.warn.mockReset()
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-11-08T12:00:00Z'))
    })

    it('records every tenant for today in UTC counting only enabled workflows', async () => {
        query.mockResolvedValue([])

        await tenantUsageSnapshotService(log as never).recordAll()

        expect(query).toHaveBeenCalledTimes(1)
        expect(query.mock.calls[0][1]).toEqual(['2026-11-08', WorkflowStatus.ENABLED])
    })

    it('records one tenant after a workflow changes status', async () => {
        query.mockResolvedValue([])
        findOne.mockResolvedValue({ id: 'project-1', tenantId: 'tenant-1' })

        await tenantUsageSnapshotService(log as never).recordForProject({ projectId: 'project-1' })

        expect(query.mock.calls[0][1]).toEqual(['tenant-1', '2026-11-08', WorkflowStatus.ENABLED])
    })

    it('records nothing for a project that no longer exists', async () => {
        findOne.mockResolvedValue(null)

        await tenantUsageSnapshotService(log as never).recordForProject({ projectId: 'gone' })

        expect(query).not.toHaveBeenCalled()
    })

    it('never fails the workflow change when the snapshot cannot be written', async () => {
        findOne.mockResolvedValue({ id: 'project-1', tenantId: 'tenant-1' })
        query.mockRejectedValue(new Error('database down'))

        await expect(tenantUsageSnapshotService(log as never).recordForProject({ projectId: 'project-1' })).resolves.toBeUndefined()
        expect(log.warn).toHaveBeenCalled()
    })
})
