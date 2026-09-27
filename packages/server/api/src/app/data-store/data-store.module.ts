import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { entitiesMustBeOwnedByCurrentProject } from '../authentication/authorization'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { dataStoreRecordService } from './data-store-record.service'
import { dataStoreController } from './data-store.controller'

export const dataStoreModule: FastifyPluginAsyncZod = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.DATA_STORE_EXPIRY_PURGE, async () => {
        await dataStoreRecordService(app.log).purgeExpired()
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.DATA_STORE_EXPIRY_PURGE,
            data: {},
            jobId: SystemJobName.DATA_STORE_EXPIRY_PURGE,
        },
        schedule: {
            type: 'repeated',
            cron: '41 * * * *',
        },
    })
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentProject)
    await app.register(dataStoreController, { prefix: '/v1/data-stores' })
}
