import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { verificationRunService } from './verification-run.service'
import { verificationController } from './verification.controller'
import { verificationService } from './verification.service'

export const verificationModule: FastifyPluginAsyncZod = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.VERIFY_RECENT_RESULTS, async () => {
        await verificationService(app.log).runForAllProjects()
    })
    systemJobHandlers.registerJobHandler(SystemJobName.VERIFY_RESULTS_MANUAL, async (data) => {
        await verificationRunService(app.log).execute(data)
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.VERIFY_RECENT_RESULTS,
            data: {},
            jobId: SystemJobName.VERIFY_RECENT_RESULTS,
        },
        schedule: {
            type: 'repeated',
            cron: '37 3 * * *',
        },
    })
    await app.register(verificationController, { prefix: '/v1/verification' })
}
