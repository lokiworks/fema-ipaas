import { PrincipalType } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { redisConnections } from '../../database/redis-connections'
import { triggerRunStats } from './trigger-run-stats'

export const triggerRunController: FastifyPluginAsyncZod = async (app) => {
    app.get('/status', GetStatusReportSchema, async (request) => {
        const tenantId = request.principal.tenant.id
        return triggerRunStats(app.log, await redisConnections.useExisting()).getStatusReport({ tenantId })
    })
}

const GetStatusReportSchema = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER]),
    },
}