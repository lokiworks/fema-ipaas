import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { alertDispatcher } from './alert-dispatcher'
import { alertController } from './alert.controller'

export const alertModule: FastifyPluginAsyncZod = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.ALERT_SWEEP, async () => {
        await alertDispatcher(app.log).runScheduledWork()
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.ALERT_SWEEP,
            data: {},
            jobId: SystemJobName.ALERT_SWEEP,
        },
        schedule: {
            type: 'repeated',
            cron: '* * * * *',
        },
    })
    await app.register(alertController, { prefix: '/v1/alerts' })
}
