import { ApId, OptionalBooleanFromQuery } from '@fema/core-utils'
import { USE_DRAFT_QUERY_PARAM_NAME } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { humanInputService } from './human-input.service'

export const formController: FastifyPluginAsyncZod = async (app) => {
    app.get('/form/:workflowId', GetFormRequest, async (request) => {
        return humanInputService(request.log).getFormByWorkflowIdOrThrow(request.params.workflowId, request.query.useDraft ?? false)
    })
}

const GetFormRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        description: 'Get a form by workflow id',
        params: z.object({
            workflowId: ApId,
        }),
        querystring: z.object({
            [USE_DRAFT_QUERY_PARAM_NAME]: OptionalBooleanFromQuery,
        }),
    },
} 