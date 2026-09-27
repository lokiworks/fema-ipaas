import { EntityId, Permission } from '@fema-ipaas/core-utils'
import {
    BatchDeleteResponse,
    BatchMoveRequestBody,
    BatchPublishCheckResponse,
    BatchPublishRequestBody,
    BatchPublishResponse,
    CopyWorkflowRequestBody,
    ImportWorkflowFileRequestBody,
    PrincipalType,
    ProjectOverviewStats,
    ProjectTree,
    ProjectWorkspaceQuery,
    WorkflowBatchRequestBody,
    WorkflowExportFile,
    WorkflowTransferResult,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { projectAccess } from '../project/project-access'
import { WorkflowEntity } from '../workflows/workflow/workflow.entity'
import { projectStatsService } from './project-stats.service'
import { projectTreeService } from './project-tree.service'
import { workflowBatchService } from './workflow-batch.service'
import { workflowTransferService } from './workflow-transfer.service'

export const projectWorkspaceController: FastifyPluginAsyncZod = async (app) => {
    app.get('/tree', TreeRequest, async (request): Promise<ProjectTree> => {
        return projectTreeService(request.log).getTree({ projectId: request.projectId })
    })

    app.get('/stats', StatsRequest, async (request): Promise<ProjectOverviewStats> => {
        return projectStatsService(request.log).getStats({ projectId: request.projectId })
    })

    app.post('/batch/publish-check', PublishCheckRequest, async (request): Promise<BatchPublishCheckResponse> => {
        return workflowBatchService(request.log).check({
            projectId: request.projectId,
            workflowIds: request.body.workflowIds,
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
        })
    })

    app.post('/batch/publish', PublishRequest, async (request): Promise<BatchPublishResponse> => {
        return workflowBatchService(request.log).publish({
            projectId: request.projectId,
            workflowIds: request.body.workflowIds,
            description: request.body.description,
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
    })

    app.post('/batch/move', MoveRequest, async (request) => {
        return workflowBatchService(request.log).move({
            projectId: request.projectId,
            workflowIds: request.body.workflowIds,
            folderId: request.body.folderId ?? null,
        })
    })

    app.delete('/batch', DeleteRequest, async (request): Promise<BatchDeleteResponse> => {
        return workflowBatchService(request.log).delete({
            projectId: request.projectId,
            workflowIds: request.body.workflowIds,
            userId: request.principal.id,
        })
    })

    app.get('/workflows/:id/export', ExportRequest, async (request): Promise<WorkflowExportFile> => {
        return workflowTransferService(request.log).exportFile({ projectId: request.projectId, workflowId: request.params.id })
    })

    app.post('/workflows/import', ImportRequest, async (request, reply) => {
        const result: WorkflowTransferResult = await workflowTransferService(request.log).importFile({
            projectId: request.projectId,
            folderId: request.body.folderId,
            file: request.body.file,
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
        await reply.status(StatusCodes.CREATED).send(result)
    })

    app.post('/workflows/:id/copy', CopyRequest, async (request, reply) => {
        await projectAccess(request.log).assertPrincipalCanAccessProject({
            principal: request.principal,
            projectId: request.body.targetProjectId,
            permission: Permission.WRITE_WORKFLOW,
        })
        const result: WorkflowTransferResult = await workflowTransferService(request.log).copy({
            sourceProjectId: request.projectId,
            workflowId: request.params.id,
            targetProjectId: request.body.targetProjectId,
            folderId: request.body.folderId,
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
        await reply.status(StatusCodes.CREATED).send(result)
    })
}

const IdParams = z.object({ id: EntityId })

const TreeRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['project-workspace'], querystring: ProjectWorkspaceQuery },
}

const StatsRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['project-workspace'], querystring: ProjectWorkspaceQuery },
}

const PublishCheckRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.PUBLISH_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['project-workspace'], body: WorkflowBatchRequestBody },
}

const PublishRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.PUBLISH_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['project-workspace'], body: BatchPublishRequestBody },
}

const MoveRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['project-workspace'], body: BatchMoveRequestBody },
}

const DeleteRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.DELETE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['project-workspace'], body: WorkflowBatchRequestBody },
}

const ExportRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.TABLE, tableName: WorkflowEntity }) },
    schema: { tags: ['project-workspace'], params: IdParams },
}

const ImportRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['project-workspace'], body: ImportWorkflowFileRequestBody },
}

const CopyRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.TABLE, tableName: WorkflowEntity }) },
    schema: { tags: ['project-workspace'], params: IdParams, body: CopyWorkflowRequestBody },
}
