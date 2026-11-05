import { ExecutionStatus, JobData, WorkerJobType } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InterceptorVerdict } from '../../../../src/app/workers/job-queue/job-interceptor'
import { tenantSuspensionInterceptor, tenantSuspensionUtils } from '../../../../src/app/workers/job-queue/interceptors/tenant-suspension-interceptor'

const update = vi.fn()
const isActive = vi.fn()

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({ update }),
}))

vi.mock('../../../../src/app/tenant/tenant-status-guard', () => ({
    tenantStatusGuard: { isActive: (params: unknown) => isActive(params) },
}))

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

function executeWorkflowJob(): JobData {
    return { jobType: WorkerJobType.EXECUTE_WORKFLOW, tenantId: 'tenant-1', projectId: 'project-1', runId: 'run-1' } as unknown as JobData
}

function job(jobType: WorkerJobType): JobData {
    return { jobType, tenantId: 'tenant-1', projectId: 'project-1' } as unknown as JobData
}

async function preDispatch(jobData: JobData) {
    return tenantSuspensionInterceptor.preDispatch({ jobId: 'job-1', jobData, job: {} as never, log: log as never })
}

describe('tenant suspension interceptor', () => {
    beforeEach(() => {
        update.mockReset()
        isActive.mockReset()
    })

    it('lets the jobs of an active tenant through', async () => {
        isActive.mockResolvedValue(true)

        expect((await preDispatch(executeWorkflowJob())).verdict).toBe(InterceptorVerdict.ALLOW)
        expect(update).not.toHaveBeenCalled()
    })

    it('discards a run of a suspended tenant and cancels its queued run record', async () => {
        isActive.mockResolvedValue(false)

        const result = await preDispatch(executeWorkflowJob())

        expect(result.verdict).toBe(InterceptorVerdict.DISCARD)
        expect(update).toHaveBeenCalledWith({ id: 'run-1', projectId: 'project-1', status: ExecutionStatus.QUEUED }, { status: ExecutionStatus.CANCELED })
    })

    it('discards scheduled polls and webhook runs of a suspended tenant without touching a run record', async () => {
        isActive.mockResolvedValue(false)

        expect((await preDispatch(job(WorkerJobType.EXECUTE_POLLING))).verdict).toBe(InterceptorVerdict.DISCARD)
        expect((await preDispatch(job(WorkerJobType.EXECUTE_WEBHOOK))).verdict).toBe(InterceptorVerdict.DISCARD)
        expect(update).not.toHaveBeenCalled()
    })

    it('does not look at the tenant for jobs that a signed-in user is waiting on', async () => {
        isActive.mockResolvedValue(false)

        expect((await preDispatch(job(WorkerJobType.EXECUTE_PROPERTY))).verdict).toBe(InterceptorVerdict.ALLOW)
        expect(isActive).not.toHaveBeenCalled()
    })

    it('still discards the job when cancelling the run record fails', async () => {
        isActive.mockResolvedValue(false)
        update.mockRejectedValue(new Error('database down'))

        expect((await preDispatch(executeWorkflowJob())).verdict).toBe(InterceptorVerdict.DISCARD)
        expect(log.warn).toHaveBeenCalled()
    })

    it('knows which job types are automation', () => {
        expect(tenantSuspensionUtils.isSuspendable({ jobData: job(WorkerJobType.EXECUTE_WORKFLOW) })).toBe(true)
        expect(tenantSuspensionUtils.isSuspendable({ jobData: job(WorkerJobType.EXECUTE_ACTION) })).toBe(false)
    })
})
