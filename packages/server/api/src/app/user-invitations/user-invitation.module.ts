import { ApplicationError, assertNotNullOrUndefined, ErrorCode, isNil, Permission, SeekPage } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, InvitationStatus, InvitationType, ListUserInvitationsRequest, Principal, PrincipalType, SendUserInvitationRequest, SERVICE_KEY_SECURITY_OPENAPI, UserInvitation, UserInvitationWithLink } from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { tenantGuards } from '../core/security/tenant-guards'
import { projectAccess } from '../project/project-access'
import { projectService } from '../project/project-service'
import { userService } from '../user/user-service'
import { INVITATION_EXPIRY_SECONDS, userInvitationsService } from './user-invitation.service'

export const invitationModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(invitationController, { prefix: '/v1/user-invitations' })
}

const invitationController: FastifyPluginAsyncZod = async (app) => {

    app.post('/', UpsertUserInvitationRequestParams, async (request, reply) => {
        const { email, type } = request.body
        switch (type) {
            case InvitationType.PROJECT:
                await tenantGuards.assertProjectIsTeamType({ projectId: request.body.projectId, log: request.log })
                await assertPrincipalHasPermissionToProject(app, request, reply, request.principal, request.body.projectId, Permission.WRITE_INVITATION)
                break
            case InvitationType.TENANT:
                await tenantGuards.assertPrincipalIsTenantAdmin({ principal: request.principal, log: request.log })
                break
        }
        const tenantId = request.principal.tenant.id
        const status = await shouldAutoAcceptInvitation(request.principal, request.body, tenantId, request.log) ? InvitationStatus.ACCEPTED : InvitationStatus.PENDING
        const projectRole = resolveProjectRoleOrThrow(request.body)

        const invitationRecordParams = {
            email,
            type,
            tenantId,
            tenantRole: type === InvitationType.PROJECT ? null : request.body.tenantRole,
            projectId: type === InvitationType.TENANT ? null : request.body.projectId,
            projectRoleId: type === InvitationType.TENANT ? null : projectRole,
            status,
        }

        const userInvitationRecord = await userInvitationsService(request.log).createInvitationRecord(invitationRecordParams)

        const invitation = await userInvitationsService(request.log).finalizeInvitation({
            userInvitation: userInvitationRecord,
            invitationExpirySeconds: INVITATION_EXPIRY_SECONDS,
        })
        await reply.status(StatusCodes.CREATED).send(invitation)
    })

    app.get('/', ListUserInvitationsRequestParams, async (request, reply) => {
        if (!isNil(request.query.projectId) && request.query.type === InvitationType.PROJECT) {
            await tenantGuards.assertProjectIsTeamType({ projectId: request.query.projectId, log: request.log })
        }
        const projectId = await getProjectIdAndAssertPermission(app, request, reply, request.principal, request.query)
        const invitations = await userInvitationsService(request.log).list({
            tenantId: request.principal.tenant.id,
            projectId: request.query.type === InvitationType.PROJECT ? projectId : null,
            type: request.query.type,
            status: request.query.status,
            cursor: request.query.cursor ?? null,
            limit: request.query.limit ?? 10,
        })
        await reply.status(StatusCodes.OK).send(invitations)
    })

    app.post('/accept', AcceptUserInvitationRequestParams, async (request, reply) => {
        const invitation = await userInvitationsService(request.log).getOneByInvitationTokenOrThrow(request.body.invitationToken)
        const { registered } = await userInvitationsService(request.log).accept({
            invitationId: invitation.id,
            tenantId: invitation.tenantId,
        })
        await reply.status(StatusCodes.OK).send({ ...invitation, registered })
    })

    app.delete('/:id', DeleteInvitationRequestParams, async (request, reply) => {
        const invitation = await userInvitationsService(request.log).getOneOrThrow({
            id: request.params.id,
            tenantId: request.principal.tenant.id,
        })
        switch (invitation.type) {
            case InvitationType.PROJECT: {
                assertNotNullOrUndefined(invitation.projectId, 'projectId')
                await assertPrincipalHasPermissionToProject(app, request, reply, request.principal, invitation.projectId, Permission.WRITE_INVITATION)
                break
            }
            case InvitationType.TENANT:
                await tenantGuards.assertPrincipalIsTenantAdmin({ principal: request.principal, log: request.log })
                break
        }
        await userInvitationsService(request.log).delete({
            id: request.params.id,
            tenantId: request.principal.tenant.id,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}


const resolveProjectRoleOrThrow = (request: SendUserInvitationRequest): DefaultProjectRole | null => {
    if (request.type === InvitationType.TENANT) {
        return null
    }
    const role = Object.values(DefaultProjectRole).find((candidate) => candidate === request.projectRole)
    if (isNil(role)) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: {
                message: `Unknown project role "${request.projectRole}", expected one of ${Object.values(DefaultProjectRole).join(', ')}`,
            },
        })
    }
    return role
}
async function getProjectIdAndAssertPermission<R extends Principal>(
    app: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply,
    principal: R,
    requestQuery: ListUserInvitationsRequest,
): Promise<string | null> {
    if (principal.type === PrincipalType.SERVICE) {
        if (isNil(requestQuery.projectId)) {
            return null
        }
        await assertPrincipalHasPermissionToProject(app, request, reply, principal, requestQuery.projectId, Permission.READ_INVITATION)
        return requestQuery.projectId
    }
    return requestQuery.projectId ?? null
}

async function shouldAutoAcceptInvitation(principal: Principal, request: SendUserInvitationRequest, tenantId: string, log: FastifyBaseLogger): Promise<boolean> {
    if (principal.type === PrincipalType.SERVICE) {
        return true
    }

    if (request.type === InvitationType.TENANT) {
        return false
    }

    const identity = await userIdentityService(log).getIdentityByEmail(request.email)
    if (isNil(identity)) {
        return false
    }

    const user = await userService(log).getOneByIdentityAndTenant({
        identityId: identity.id,
        tenantId,
    })
    return !isNil(user)
}

async function assertPrincipalHasPermissionToProject<R extends Principal & { tenant: { id: string } }>(
    fastify: FastifyInstance,
    request: FastifyRequest, reply: FastifyReply, principal: R,
    projectId: string, _permission: Permission): Promise<void> {
    const project = await projectService(request.log).getOneOrThrow(projectId)
    if (isNil(project) || project.tenantId !== principal.tenant.id) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'user does not have access to the project',
            },
        })
    }
    await projectAccess(request.log).assertPrincipalCanAccessProject({ principal: request.principal, projectId })
}


const ListUserInvitationsRequestParams = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER, PrincipalType.SERVICE], {
            type: ProjectResourceType.QUERY,
            queryKey: 'projectId',
        }),
    },
    schema: {
        tags: ['user-invitations'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: ListUserInvitationsRequest,
        response: {
            [StatusCodes.OK]: SeekPage(UserInvitation),
        },
    },
}

const AcceptUserInvitationRequestParams = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        body: z.object({
            invitationToken: z.string(),
        }),
    },
}

const DeleteInvitationRequestParams = {
    config: {
        security: securityAccess.unscoped([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['user-invitations'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: z.object({
            id: z.string(),
        }),
        response: {
            [StatusCodes.NO_CONTENT]: z.never(),
        },
    },
}

const UpsertUserInvitationRequestParams = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER, PrincipalType.SERVICE], {
            type: ProjectResourceType.BODY,
        }),
    },
    schema: {
        body: SendUserInvitationRequest,
        description: 'Send a user invitation to a user. If the user already has an invitation, the invitation will be updated.',
        tags: ['user-invitations'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        response: {
            [StatusCodes.CREATED]: UserInvitationWithLink,
        },
    },
}
