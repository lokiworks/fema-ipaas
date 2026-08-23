import { SeekPage } from '@fema-ipaas/core-utils'
import { ListWorkflowVersionRequest, PrincipalType, WorkflowVersionMetadata } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { WorkspaceResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { workflowVersionService } from '../workflow-version/workflow-version.service'
import { WorkflowEntity } from './workflow.entity'
import { workflowService } from './workflow.service'

const DEFAULT_PAGE_SIZE = 10

export const workflowVersionController: FastifyPluginAsyncZod = async (fastify) => {

    fastify.get('/:workflowId/versions', ListVersionParams, async (request) => {
        const workflow = await workflowService(request.log).getOneOrThrow({
            id: request.params.workflowId,
            workspaceId: request.workspaceId,
        })
        return workflowVersionService(request.log).list({
            workflowId: workflow.id,
            limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
            cursorRequest: request.query.cursor ?? null,
        })
    },
    )
}

const ListVersionParams = {
    config: {
        security: securityAccess.workspace([PrincipalType.USER], undefined, {
            type: WorkspaceResourceType.TABLE,
            tableName: WorkflowEntity,
            lookup: {
                paramKey: 'workflowId',
                entityField: 'id',
            },
        }),
    },
    schema: {
        params: z.object({
            workflowId: z.string(),
        }),
        querystring: ListWorkflowVersionRequest,
        response: {
            [StatusCodes.OK]: SeekPage(WorkflowVersionMetadata),
        },
    },
}
