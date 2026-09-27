import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { entitiesMustBeOwnedByCurrentProject } from '../authentication/authorization'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { agentApprovalController, agentApprovalWorkerController } from './agent-approval.controller'
import { agentApprovalService } from './agent-approval.service'

export const agentApprovalModule: FastifyPluginAsyncZod = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.AGENT_APPROVAL_EXPIRY, async () => {
        await agentApprovalService(app.log).expireOverdue()
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.AGENT_APPROVAL_EXPIRY,
            data: {},
            jobId: SystemJobName.AGENT_APPROVAL_EXPIRY,
        },
        schedule: {
            type: 'repeated',
            cron: '* * * * *',
        },
    })
    await app.register(agentApprovalUserModule)
    await app.register(agentApprovalWorkerController, { prefix: '/v1/worker/agent-approvals' })
}

const agentApprovalUserModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentProject)
    await app.register(agentApprovalController, { prefix: '/v1/agent-approvals' })
}
