import { EntityId, Permission, SeekPage } from '@fema-ipaas/core-utils'
import {
    ApproveWorkflowReleaseRequestBody,
    ConnectionReplacement,
    CreateWorkflowReleaseRequestBody,
    DeployToTestRequestBody,
    DeployToTestResponse,
    EnvironmentOverview,
    ListConnectionReplacementsRequestQuery,
    ListWorkflowReleasesRequestQuery,
    PrincipalType,
    RejectWorkflowReleaseRequestBody,
    RollbackWorkflowRequestBody,
    RollbackWorkflowResponse,
    UpdateEnvironmentSettingsRequestBody,
    UpsertConnectionReplacementRequestBody,
    WorkflowRelease,
    WorkflowReleaseDetail,
    WorkflowReleaseWithWorkflow,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { lockService } from '../core/collaborative/lock/lock.service'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { connectionReplacementService } from './connection-replacement.service'
import { ConnectionReplacementEntity, WorkflowReleaseEntity } from './release.entity'
import { workflowReleaseService } from './workflow-release.service'

export const workflowReleaseController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListReleasesRequest, async (request): Promise<SeekPage<WorkflowReleaseWithWorkflow>> => {
        return workflowReleaseService(request.log).list({ query: request.query, currentUserId: request.principal.id })
    })

    app.get('/pending-count', PendingCountRequest, async (request) => {
        const count = await workflowReleaseService(request.log).countPendingForApprover({ projectId: request.projectId, userId: request.principal.id })
        return { count }
    })

    app.post('/', CreateReleaseRequest, async (request, reply) => {
        const release = await workflowReleaseService(request.log).create({
            request: request.body,
            requesterId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
        await reply.status(StatusCodes.CREATED).send(release)
    })

    app.get('/environments', EnvironmentOverviewRequest, async (request): Promise<EnvironmentOverview> => {
        return workflowReleaseService(request.log).overview({ projectId: request.projectId })
    })

    app.post('/environments', UpdateEnvironmentsRequest, async (request): Promise<EnvironmentOverview> => {
        return workflowReleaseService(request.log).updateEnvironmentSettings({ request: request.body })
    })

    app.post('/deploy-to-test', DeployToTestRequest, async (request): Promise<DeployToTestResponse> => {
        await lockService(request.log).assertNotLockedByOther({ resourceId: request.body.workflowId, userId: request.principal.id })
        return workflowReleaseService(request.log).deployToTest({ request: request.body, userId: request.principal.id, tenantId: request.principal.tenant.id })
    })

    app.post('/rollback', RollbackRequest, async (request): Promise<RollbackWorkflowResponse> => {
        return workflowReleaseService(request.log).rollback({ request: request.body, userId: request.principal.id, tenantId: request.principal.tenant.id })
    })

    app.get('/:id', GetReleaseRequest, async (request): Promise<WorkflowReleaseDetail> => {
        return workflowReleaseService(request.log).getDetail({ id: request.params.id, projectId: request.projectId, currentUserId: request.principal.id })
    })

    app.post('/:id/approve', ApproveReleaseRequest, async (request): Promise<WorkflowRelease> => {
        return workflowReleaseService(request.log).approve({
            id: request.params.id,
            projectId: request.projectId,
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
            comment: request.body.comment,
        })
    })

    app.post('/:id/reject', RejectReleaseRequest, async (request): Promise<WorkflowRelease> => {
        return workflowReleaseService(request.log).reject({
            id: request.params.id,
            projectId: request.projectId,
            userId: request.principal.id,
            comment: request.body.comment,
        })
    })

    app.post('/:id/withdraw', WithdrawReleaseRequest, async (request): Promise<WorkflowRelease> => {
        return workflowReleaseService(request.log).withdraw({ id: request.params.id, projectId: request.projectId, userId: request.principal.id })
    })
}

export const connectionReplacementController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListReplacementsRequest, async (request): Promise<ConnectionReplacement[]> => {
        return connectionReplacementService(request.log).list({ projectId: request.projectId })
    })

    app.post('/', UpsertReplacementRequest, async (request): Promise<ConnectionReplacement> => {
        return connectionReplacementService(request.log).upsert({ request: request.body })
    })

    app.delete('/:id', DeleteReplacementRequest, async (request, reply) => {
        await connectionReplacementService(request.log).delete({ id: request.params.id, projectId: request.projectId })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const IdParams = z.object({ id: EntityId })

const ListReleasesRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_PROJECT_RELEASE, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['workflow-releases'], querystring: ListWorkflowReleasesRequestQuery },
}

const PendingCountRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_PROJECT_RELEASE, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['workflow-releases'], querystring: z.object({ projectId: z.string() }) },
}

const CreateReleaseRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT_RELEASE, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['workflow-releases'], body: CreateWorkflowReleaseRequestBody },
}

const GetReleaseRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_PROJECT_RELEASE, { type: ProjectResourceType.TABLE, tableName: WorkflowReleaseEntity }) },
    schema: { tags: ['workflow-releases'], params: IdParams, response: { [StatusCodes.OK]: WorkflowReleaseDetail } },
}

const ApproveReleaseRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT_RELEASE, { type: ProjectResourceType.TABLE, tableName: WorkflowReleaseEntity }) },
    schema: { tags: ['workflow-releases'], params: IdParams, body: ApproveWorkflowReleaseRequestBody },
}

const RejectReleaseRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT_RELEASE, { type: ProjectResourceType.TABLE, tableName: WorkflowReleaseEntity }) },
    schema: { tags: ['workflow-releases'], params: IdParams, body: RejectWorkflowReleaseRequestBody },
}

const WithdrawReleaseRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT_RELEASE, { type: ProjectResourceType.TABLE, tableName: WorkflowReleaseEntity }) },
    schema: { tags: ['workflow-releases'], params: IdParams },
}

const EnvironmentOverviewRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_PROJECT_RELEASE, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['workflow-releases'], querystring: z.object({ projectId: z.string() }), response: { [StatusCodes.OK]: EnvironmentOverview } },
}

const UpdateEnvironmentsRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['workflow-releases'], body: UpdateEnvironmentSettingsRequestBody, response: { [StatusCodes.OK]: EnvironmentOverview } },
}

const DeployToTestRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['workflow-releases'], body: DeployToTestRequestBody, response: { [StatusCodes.OK]: DeployToTestResponse } },
}

const RollbackRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.PUBLISH_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['workflow-releases'], body: RollbackWorkflowRequestBody, response: { [StatusCodes.OK]: RollbackWorkflowResponse } },
}

const ListReplacementsRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_CONNECTION, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['connection-replacements'], querystring: ListConnectionReplacementsRequestQuery },
}

const UpsertReplacementRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['connection-replacements'], body: UpsertConnectionReplacementRequestBody },
}

const DeleteReplacementRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT, { type: ProjectResourceType.TABLE, tableName: ConnectionReplacementEntity }) },
    schema: { tags: ['connection-replacements'], params: IdParams },
}
