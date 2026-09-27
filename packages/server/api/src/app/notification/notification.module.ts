import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { notificationController } from './notification.controller'
import { notificationService } from './notification.service'
import { weeklyDigestService } from './weekly-digest.service'

export const notificationModule: FastifyPluginAsyncZod = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.NOTIFICATION_RETENTION, async () => {
        await notificationService(app.log).purgeExpired()
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.NOTIFICATION_RETENTION,
            data: {},
            jobId: SystemJobName.NOTIFICATION_RETENTION,
        },
        schedule: {
            type: 'repeated',
            cron: '17 4 * * *',
        },
    })
    systemJobHandlers.registerJobHandler(SystemJobName.WEEKLY_DIGEST, async () => {
        await weeklyDigestService(app.log).sendAll()
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.WEEKLY_DIGEST,
            data: {},
            jobId: SystemJobName.WEEKLY_DIGEST,
        },
        schedule: {
            type: 'repeated',
            cron: '0 8 * * 1',
        },
    })
    await app.register(notificationController, { prefix: '/v1/notifications' })
}
