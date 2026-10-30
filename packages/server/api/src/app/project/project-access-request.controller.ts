import { EntityId, isNil, Permission } from '@fema-ipaas/core-utils'
import {
    ApproveProjectAccessRequestBody,
    CreateProjectAccessRequestBody,
    ListProjectAccessRequestsQuery,
    NotificationType,
    PrincipalType,
    ProjectAccessRequest,
    ProjectAccessRequestToReview,
    ProjectAccessRequestWithUser,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { userService } from '../user/user-service'
import { projectAccessRequestAuditEvents } from './project-access-request-audit-events'
import { projectAccessRequestSideEffects } from './project-access-request-side-effects'
import { ProjectAccessRequestEntity } from './project-access-request.entity'
import { projectAccessRequestService } from './project-access-request.service'
import { projectMemberSideEffects } from './project-member-side-effects'

export const projectAccessRequestController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', CreateRequest, async (request, reply) => {
        const result = await projectAccessRequestService(request.log).create({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            projectId: request.body.projectId,
            reason: request.body.reason,
        })
        if (result.created) {
            const requester = await userService(request.log).getMetaInformation({ id: request.principal.id })
            applicationEvents(request.log).sendUserEvent(request, projectAccessRequestAuditEvents.requested({ request: result.request, email: requester.email }), { projectId: result.project.id })
            await projectAccessRequestSideEffects(request.log).onRequested({ request: result.request, project: result.project })
        }
        await reply.status(result.created ? StatusCodes.CREATED : StatusCodes.OK).send(result.request)
    })

    app.get('/me', MyPendingRequest, async (request): Promise<ProjectAccessRequest[]> => {
        return projectAccessRequestService(request.log).listMyPending({ tenantId: request.principal.tenant.id, userId: request.principal.id })
    })

    app.get('/to-review', ToReviewRequest, async (request): Promise<ProjectAccessRequestToReview[]> => {
        return projectAccessRequestService(request.log).listPendingForApprover({ tenantId: request.principal.tenant.id, userId: request.principal.id })
    })

    app.post('/:id/withdraw', WithdrawRequest, async (request): Promise<ProjectAccessRequest> => {
        const withdrawn = await projectAccessRequestService(request.log).withdraw({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            requestId: request.params.id,
        })
        const requester = await userService(request.log).getMetaInformation({ id: request.principal.id })
        applicationEvents(request.log).sendUserEvent(request, projectAccessRequestAuditEvents.withdrawn({ request: withdrawn, email: requester.email }), { projectId: withdrawn.projectId })
        await projectAccessRequestSideEffects(request.log).onWithdrawn({ request: withdrawn })
        return withdrawn
    })

    app.get('/', ListPendingRequest, async (request): Promise<ProjectAccessRequestWithUser[]> => {
        return projectAccessRequestService(request.log).listPending({ tenantId: request.principal.tenant.id, projectId: request.query.projectId })
    })

    app.post('/:id/approve', ApproveRequest, async (request): Promise<ProjectAccessRequest> => {
        const result = await projectAccessRequestService(request.log).decide({
            tenantId: request.principal.tenant.id,
            requestId: request.params.id,
            actorId: request.principal.id,
            approve: true,
            role: request.body.role,
        })
        applicationEvents(request.log).sendUserEvent(request, projectAccessRequestAuditEvents.decided({ request: result.request, email: result.requesterEmail }), { projectId: result.project.id })
        await projectAccessRequestSideEffects(request.log).onDecided({ request: result.request, project: result.project, actorId: request.principal.id })
        if (!isNil(result.member) && !result.alreadyMember) {
            await projectMemberSideEffects(request.log).recordMemberUpserted({
                request,
                member: result.member,
                email: result.requesterEmail ?? undefined,
                alreadyMember: false,
                notificationType: NotificationType.PROJECT_ACCESS_APPROVED,
            })
        }
        return result.request
    })

    app.post('/:id/reject', RejectRequest, async (request): Promise<ProjectAccessRequest> => {
        const result = await projectAccessRequestService(request.log).decide({
            tenantId: request.principal.tenant.id,
            requestId: request.params.id,
            actorId: request.principal.id,
            approve: false,
        })
        applicationEvents(request.log).sendUserEvent(request, projectAccessRequestAuditEvents.decided({ request: result.request, email: result.requesterEmail }), { projectId: result.project.id })
        await projectAccessRequestSideEffects(request.log).onDecided({ request: result.request, project: result.project, actorId: request.principal.id })
        return result.request
    })
}

const IdParams = z.object({ id: EntityId })

const reviewerSecurity = securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT_MEMBER, {
    type: ProjectResourceType.TABLE,
    tableName: ProjectAccessRequestEntity,
})

const CreateRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: {
        tags: ['project-access-requests'],
        body: CreateProjectAccessRequestBody,
        response: { [StatusCodes.CREATED]: ProjectAccessRequest, [StatusCodes.OK]: ProjectAccessRequest },
    },
}

const MyPendingRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['project-access-requests'], response: { [StatusCodes.OK]: z.array(ProjectAccessRequest) } },
}

const ToReviewRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['project-access-requests'], response: { [StatusCodes.OK]: z.array(ProjectAccessRequestToReview) } },
}

const WithdrawRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['project-access-requests'], params: IdParams, response: { [StatusCodes.OK]: ProjectAccessRequest } },
}

const ListPendingRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT_MEMBER, {
            type: ProjectResourceType.QUERY,
        }),
    },
    schema: {
        tags: ['project-access-requests'],
        querystring: ListProjectAccessRequestsQuery,
        response: { [StatusCodes.OK]: z.array(ProjectAccessRequestWithUser) },
    },
}

const ApproveRequest = {
    config: { security: reviewerSecurity },
    schema: {
        tags: ['project-access-requests'],
        params: IdParams,
        body: ApproveProjectAccessRequestBody,
        response: { [StatusCodes.OK]: ProjectAccessRequest },
    },
}

const RejectRequest = {
    config: { security: reviewerSecurity },
    schema: { tags: ['project-access-requests'], params: IdParams, response: { [StatusCodes.OK]: ProjectAccessRequest } },
}
