import { Permission, SeekPage } from '@fema-ipaas/core-utils'
import { DebugVerification, ListWorkflowVersionRequest, PrincipalType, WorkflowVersionMetadata } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { workflowVersionService } from '../workflow-version/workflow-version.service'
import { workflowDebugVerification } from './workflow-debug-verification'
import { WorkflowEntity } from './workflow.entity'
import { workflowService } from './workflow.service'

const DEFAULT_PAGE_SIZE = 10

export const workflowVersionController: FastifyPluginAsyncZod = async (fastify) => {

    fastify.get('/:workflowId/versions', ListVersionParams, async (request) => {
        const workflow = await workflowService(request.log).getOneOrThrow({
            id: request.params.workflowId,
            projectId: request.projectId,
        })
        return workflowVersionService(request.log).list({
            workflowId: workflow.id,
            limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
            cursorRequest: request.query.cursor ?? null,
        })
    },
    )

    fastify.get('/:workflowId/versions/:versionId/debug-verification', DebugVerificationParams, async (request) => {
        const workflow = await workflowService(request.log).getOneOrThrow({
            id: request.params.workflowId,
            projectId: request.projectId,
        })
        return workflowDebugVerification(request.log).verify({
            workflowId: workflow.id,
            versionId: request.params.versionId,
            projectId: request.projectId,
        })
    })
}

const ListVersionParams = {
    config: {
        security: securityAccess.project([PrincipalType.USER], undefined, {
            type: ProjectResourceType.TABLE,
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

const DebugVerificationParams = {
    config: {
        security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, {
            type: ProjectResourceType.TABLE,
            tableName: WorkflowEntity,
            lookup: {
                paramKey: 'workflowId',
                entityField: 'id',
            },
        }),
    },
    schema: {
        tags: ['workflows'],
        description: 'Whether this workflow version was debugged successfully after its last edit, and which steps ran',
        params: z.object({
            workflowId: z.string(),
            versionId: z.string(),
        }),
        response: {
            [StatusCodes.OK]: DebugVerification,
        },
    },
}
