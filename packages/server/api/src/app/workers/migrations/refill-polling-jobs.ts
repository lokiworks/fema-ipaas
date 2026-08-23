import { LATEST_JOB_DATA_SCHEMA_VERSION, TriggerStrategy, WorkerJobType, WorkflowTriggerType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { IsNull } from 'typeorm'
import { triggerSourceRepo } from '../../trigger/trigger-source/trigger-source-service'
import { workspaceService } from '../../workspace/workspace-service'
import { jobQueue, JobType } from '../job-queue/job-queue'

export const refillPollingJobs = (log: FastifyBaseLogger) => ({
    async run(): Promise<void> {
        const triggerSources = await triggerSourceRepo().find({
            where: {
                deleted: IsNull(),
                simulate: false,
                type: TriggerStrategy.POLLING,
            },
        })
        let migratedPollingJobs = 0

        const batchSize = 100
        for (let i = 0; i < triggerSources.length; i += batchSize) {
            const batch = triggerSources.slice(i, i + batchSize)
            await Promise.all(batch.map(async (triggerSource) => {
                if (!triggerSource.schedule) {
                    return
                }
                await jobQueue(log).add({
                    id: triggerSource.workflowVersionId,
                    type: JobType.REPEATING,
                    data: {
                        workspaceId: triggerSource.workspaceId,
                        tenantId: await workspaceService(log).getTenantId(triggerSource.workspaceId),
                        schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                        workflowVersionId: triggerSource.workflowVersionId,
                        workflowId: triggerSource.workflowId,
                        triggerType: WorkflowTriggerType.CONNECTOR,
                        jobType: WorkerJobType.EXECUTE_POLLING,
                    },
                    scheduleOptions: triggerSource.schedule,
                })
                migratedPollingJobs++
            }))
        }

        log.info({
            migratedPollingJobs,
        }, '[pollingJobsMigration] Migrated polling jobs')
    },
})
