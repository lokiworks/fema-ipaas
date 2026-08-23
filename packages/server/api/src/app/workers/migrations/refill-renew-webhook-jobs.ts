import { WebhookRenewStrategy } from '@fema/connector-sdk'
import { isNil } from '@fema/core-utils'
import { LATEST_JOB_DATA_SCHEMA_VERSION, TriggerSourceScheduleType, TriggerStrategy, WorkerJobType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { IsNull } from 'typeorm'
import { connectorMetadataService } from '../../connectors/metadata/connector-metadata-service'
import { triggerSourceRepo } from '../../trigger/trigger-source/trigger-source-service'
import { workspaceService } from '../../workspace/workspace-service'
import { jobQueue, JobType } from '../job-queue/job-queue'

export const refillRenewWebhookJobs = (log: FastifyBaseLogger) => ({
    async run(): Promise<void> {
        const triggerSources = await triggerSourceRepo().find({
            where: {
                deleted: IsNull(),
                simulate: false,
                type: TriggerStrategy.WEBHOOK,
            },
        })
        let migratedRenewWebhookJobs = 0

        const batchSize = 100
        for (let i = 0; i < triggerSources.length; i += batchSize) {
            const batch = triggerSources.slice(i, i + batchSize)
            await Promise.all(batch.map(async (triggerSource) => {
                const connectorMetadata = await connectorMetadataService(log).get({
                    name: triggerSource.connectorName,
                    version: triggerSource.connectorVersion,
                    platformId: await workspaceService(log).getPlatformId(triggerSource.workspaceId),
                })
                const connectorTrigger = connectorMetadata?.triggers?.[triggerSource.triggerName]
                if (isNil(connectorTrigger) || isNil(connectorTrigger.renewConfiguration) || connectorTrigger.renewConfiguration.strategy !== WebhookRenewStrategy.CRON) {
                    return
                }
                await jobQueue(log).add({
                    id: triggerSource.flowVersionId,
                    type: JobType.REPEATING,
                    data: {
                        workspaceId: triggerSource.workspaceId,
                        platformId: await workspaceService(log).getPlatformId(triggerSource.workspaceId),
                        schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                        flowVersionId: triggerSource.flowVersionId,
                        flowId: triggerSource.flowId,
                        jobType: WorkerJobType.RENEW_WEBHOOK,
                    },
                    scheduleOptions: {
                        type: TriggerSourceScheduleType.CRON_EXPRESSION,
                        cronExpression: connectorTrigger.renewConfiguration.cronExpression,
                        timezone: 'UTC',
                    },
                })
                migratedRenewWebhookJobs++
            }))
        }

        log.info({
            migratedRenewWebhookJobs,
        }, '[renewWebhookJobsMigration] Migrated renew webhook jobs')
    },
})