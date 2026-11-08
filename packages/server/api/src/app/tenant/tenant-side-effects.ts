import { TenantId } from '@fema-ipaas/core-utils'
import { dayjsDuration, dayjsUtil } from '@fema-ipaas/server-utils'
import { FastifyBaseLogger } from 'fastify'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'

export const tenantSideEffects = (log: FastifyBaseLogger) => ({
    async scheduleHardDelete({ tenantId }: { tenantId: TenantId }): Promise<void> {
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.HARD_DELETE_TENANT,
                data: { tenantId },
                jobId: hardDeleteJobId({ tenantId }),
            },
            schedule: {
                type: 'one-time',
                date: dayjsUtil(),
            },
            customConfig: {
                attempts: HARD_DELETE_ATTEMPTS,
                backoff: { type: 'exponential', delay: HARD_DELETE_BACKOFF_MS },
            },
        })
    },
})

function hardDeleteJobId({ tenantId }: { tenantId: TenantId }): string {
    return `hard-delete-tenant-${tenantId}`
}

const HARD_DELETE_ATTEMPTS = 5
const HARD_DELETE_BACKOFF_MS = dayjsDuration(1, 'minute').asMilliseconds()
