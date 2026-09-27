import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { dataErasureService } from './data-erasure.service'
import { privacyController } from './privacy.controller'
import { rawStatePurgeService } from './raw-state-purge.service'

export const privacyModule: FastifyPluginAsyncZod = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.DATA_ERASURE, async (data) => {
        await dataErasureService(app.log).process({ requestId: data.requestId })
    })
    systemJobHandlers.registerJobHandler(SystemJobName.RAW_STATE_PURGE, async () => {
        await rawStatePurgeService(app.log).run()
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.RAW_STATE_PURGE,
            data: {},
            jobId: SystemJobName.RAW_STATE_PURGE,
        },
        schedule: {
            type: 'repeated',
            cron: '17 * * * *',
        },
    })
    await app.register(privacyController, { prefix: '/v1/privacy-settings' })
}
