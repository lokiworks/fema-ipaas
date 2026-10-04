import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { backupController } from './backup.controller'
import { backupService } from './backup.service'

export const backupModule: FastifyPluginAsyncZod = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.BACKUP_TICK, async () => {
        await backupService(app.log).runDue()
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.BACKUP_TICK,
            data: {},
            jobId: SystemJobName.BACKUP_TICK,
        },
        schedule: {
            type: 'repeated',
            cron: '*/15 * * * *',
        },
    })
    await app.register(backupController, { prefix: '/v1/backups' })
}
