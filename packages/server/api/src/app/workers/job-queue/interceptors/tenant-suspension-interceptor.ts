import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { ExecutionStatus, JobData, WorkerJobType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../../core/db/repo-factory'
import { tenantStatusGuard } from '../../../tenant/tenant-status-guard'
import { ExecutionEntity } from '../../../workflows/execution/execution-entity'
import { InterceptorResult, InterceptorVerdict, JobInterceptor } from '../job-interceptor'

const executionRepo = repoFactory(ExecutionEntity)

const SUSPENDABLE_JOB_TYPES: readonly WorkerJobType[] = [
    WorkerJobType.EXECUTE_WORKFLOW,
    WorkerJobType.EXECUTE_WEBHOOK,
    WorkerJobType.EXECUTE_POLLING,
]

function isSuspendable({ jobData }: { jobData: JobData }): boolean {
    return SUSPENDABLE_JOB_TYPES.includes(jobData.jobType)
}

async function cancelQueuedRun({ jobData, log }: { jobData: JobData, log: FastifyBaseLogger }): Promise<void> {
    if (jobData.jobType !== WorkerJobType.EXECUTE_WORKFLOW) {
        return
    }
    const { error } = await tryCatch(() => executionRepo().update(
        { id: jobData.runId, projectId: jobData.projectId, status: ExecutionStatus.QUEUED },
        { status: ExecutionStatus.CANCELED },
    ))
    if (!isNil(error)) {
        log.warn({ execution: { id: jobData.runId }, error: String(error) }, '[tenantSuspensionInterceptor] Could not cancel the queued run of a suspended tenant')
    }
}

export const tenantSuspensionInterceptor: JobInterceptor = {
    async preDispatch({ jobId, jobData, log }): Promise<InterceptorResult> {
        if (!isSuspendable({ jobData })) {
            return { verdict: InterceptorVerdict.ALLOW }
        }
        const active = await tenantStatusGuard.isActive({ tenantId: jobData.tenantId })
        if (active) {
            return { verdict: InterceptorVerdict.ALLOW }
        }
        log.info({ job: { id: jobId, type: jobData.jobType }, tenant: { id: jobData.tenantId }, project: { id: jobData.projectId } }, '[tenantSuspensionInterceptor] Tenant is suspended, discarding the job without retry')
        await cancelQueuedRun({ jobData, log })
        return { verdict: InterceptorVerdict.DISCARD }
    },

    async onJobFinished(): Promise<void> {
        return undefined
    },
}

export const tenantSuspensionUtils = {
    isSuspendable,
}
