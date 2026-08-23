import { isNil } from '@fema-ipaas/core-utils'
import { JobData, PollingJobData, RenewWebhookJobData, WorkerJobType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { triggerSourceRepo } from '../../../trigger/trigger-source/trigger-source-service'
import { InterceptorResult, InterceptorVerdict, JobInterceptor } from '../job-interceptor'
import { jobQueue } from '../job-queue'

const ZOMBIE_REPEATING_JOB_TYPES = [WorkerJobType.EXECUTE_POLLING, WorkerJobType.RENEW_WEBHOOK]

export const zombiePollingInterceptor: JobInterceptor = {
    async preDispatch({ jobData, log }): Promise<InterceptorResult> {
        if (!ZOMBIE_REPEATING_JOB_TYPES.includes(jobData.jobType)) {
            return { verdict: InterceptorVerdict.ALLOW }
        }
        const { workflowVersionId } = jobData as PollingJobData | RenewWebhookJobData
        // An active trigger source exists only when the workflow is enabled and this exact version is current.
        // If soft-deleted (disabled or re-published to a new version), findOneBy returns null.
        const activeTriggerSource = await triggerSourceRepo().findOneBy({ workflowVersionId })
        if (!isNil(activeTriggerSource)) {
            return { verdict: InterceptorVerdict.ALLOW }
        }
        log.warn({ workflowVersion: { id: workflowVersionId } }, '[zombiePollingInterceptor] No active trigger source — discarding repeat job (workflow disabled, re-published, or deleted)')
        await jobQueue(log).removeRepeatingJob({ workflowVersionId })
        return { verdict: InterceptorVerdict.DISCARD }
    },

    async onJobFinished(_params: { jobId: string, jobData: JobData, failed: boolean, log: FastifyBaseLogger }): Promise<void> {
        // Nothing to release
    },
}
