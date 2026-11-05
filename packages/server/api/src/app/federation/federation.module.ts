import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { federationSessionRecheck } from './federation-session-recheck.service'
import { federationController } from './federation.controller'

export const federationModule: FastifyPluginAsyncZod = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.FEDERATION_SESSION_RECHECK, async () => {
        await federationSessionRecheck(app.log).runDue()
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.FEDERATION_SESSION_RECHECK,
            data: {},
            jobId: SystemJobName.FEDERATION_SESSION_RECHECK,
        },
        schedule: {
            type: 'repeated',
            cron: RECHECK_CRON,
        },
    })
    await app.register(federationController, { prefix: '/v1/federation' })
}

const RECHECK_CRON = '*/5 * * * *'
