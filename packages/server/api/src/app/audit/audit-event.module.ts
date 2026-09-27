import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { auditEventController } from './audit-event.controller'
import { auditEventService } from './audit-event.service'

export const auditEventModule: FastifyPluginAsyncZod = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.AUDIT_EVENT_RETENTION, async () => {
        await auditEventService(app.log).purgeExpired()
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.AUDIT_EVENT_RETENTION,
            data: {},
            jobId: SystemJobName.AUDIT_EVENT_RETENTION,
        },
        schedule: {
            type: 'repeated',
            cron: '41 3 * * *',
        },
    })
    await app.register(auditEventController, { prefix: '/v1/audit-events' })
}
