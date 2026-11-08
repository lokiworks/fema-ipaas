import { FastifyBaseLogger } from 'fastify'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { tenantUsageSnapshotService } from './tenant-usage-snapshot.service'

async function register({ log }: { log: FastifyBaseLogger }): Promise<void> {
    systemJobHandlers.registerJobHandler(SystemJobName.TENANT_USAGE_SNAPSHOT, async () => {
        await tenantUsageSnapshotService(log).recordAll()
    })
    await systemJobsSchedule(log).upsertJob({
        job: {
            name: SystemJobName.TENANT_USAGE_SNAPSHOT,
            data: {},
            jobId: SystemJobName.TENANT_USAGE_SNAPSHOT,
        },
        schedule: {
            type: 'repeated',
            cron: '5 0 * * *',
        },
    })
}

export const platformJobs = {
    register,
}
