import { Permission, SeekPage } from '@fema-ipaas/core-utils'
import { DedupedEventStats, DedupedEventStatsRequestQuery, DedupedEventWithWorkflow, ListDedupedEventsRequestQuery, PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { dedupedEventService } from './deduped-event.service'

export const dedupedEventController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<SeekPage<DedupedEventWithWorkflow>> => {
        return dedupedEventService(request.log).list({ ...request.query, projectId: request.projectId })
    })

    app.get('/stats', StatsRequest, async (request): Promise<DedupedEventStats> => {
        return dedupedEventService(request.log).stats({ projectId: request.projectId, workflowId: request.query.workflowId })
    })
}

const ListRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_RUN, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['deduped-events'], querystring: ListDedupedEventsRequestQuery },
}

const StatsRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_RUN, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['deduped-events'], querystring: DedupedEventStatsRequestQuery },
}
