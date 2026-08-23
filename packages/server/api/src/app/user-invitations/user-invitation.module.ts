import { ApplicationError, assertNotNullOrUndefined, ErrorCode, isNil, Permission, SeekPage, WorkspaceRole } from '@fema/core-utils'
import { InvitationStatus, InvitationType, ListUserInvitationsRequest, Principal, PrincipalType, SendUserInvitationRequest, SERVICE_KEY_SECURITY_OPENAPI, UserInvitation, UserInvitationWithLink } from '@fema/shared'
import { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { WorkspaceResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { tenantGuards } from '../core/security/tenant-guards'
import { userService } from '../user/user-service'
import { workspaceAccess } from '../workspace/workspace-access'
import { workspaceService } from '../workspace/workspace-service'
import { INVITATION_EXPIRY_SECONDS, userInvitationsService } from './user-invitation.service'

export const invitationModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(invitationController, { prefix: '/v1/user-invitations' })
}

const invitationController: FastifyPluginAsyncZod = async (app) => {

    app.post('/', UpsertUserInvitationRequestParams, async (request, reply) => {
        const { email, type } = request.body
        switch (type) {
            case InvitationType.WORKSPACE:
                await tenantGuards.assertWorkspaceIsTeamType({ workspaceId: request.body.workspaceId, log: request.log })
                await assertPrincipalHasPermissionToWorkspace(app, request, reply, request.principal, request.body.workspaceId, Permission.WRITE_INVITATION)
                break
            case InvitationType.TENANT:
                await tenantGuards.assertPrincipalIsTenantAdmin({ principal: request.principal, log: request.log })
                break
        }
        const tenantId = request.principal.tenant.id
        const status = await shouldAutoAcceptInvitation(request.principal, request.body, tenantId, request.log) ? InvitationStatus.ACCEPTED : InvitationStatus.PENDING
        const workspaceRole = await getWorkspaceRoleAndAssertIfFound(tenantId, request.body)

        const invitationRecordParams = {
            email,
            type,
            tenantId,
            tenantRole: type === InvitationType.WORKSPACE ? null : request.body.tenantRole,
            workspaceId: type === InvitationType.TENANT ? null : request.body.workspaceId,
            workspaceRoleId: type === InvitationType.TENANT ? null : workspaceRole?.id ?? null,
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
        if (!isNil(request.query.workspaceId) && request.query.type === InvitationType.WORKSPACE) {
            await tenantGuards.assertWorkspaceIsTeamType({ workspaceId: request.query.workspaceId, log: request.log })
        }
        const workspaceId = await getWorkspaceIdAndAssertPermission(app, request, reply, request.principal, request.query)
        const invitations = await userInvitationsService(request.log).list({
            tenantId: request.principal.tenant.id,
            workspaceId: request.query.type === InvitationType.WORKSPACE ? workspaceId : null,
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
            case InvitationType.WORKSPACE: {
                assertNotNullOrUndefined(invitation.workspaceId, 'workspaceId')
                await assertPrincipalHasPermissionToWorkspace(app, request, reply, request.principal, invitation.workspaceId, Permission.WRITE_INVITATION)
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


const getWorkspaceRoleAndAssertIfFound = async (tenantId: string, request: SendUserInvitationRequest): Promise<WorkspaceRole | null> => {
    const { type } = request
    if (type === InvitationType.TENANT) {
        return null
    }
    return null
}
async function getWorkspaceIdAndAssertPermission<R extends Principal>(
    app: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply,
    principal: R,
    requestQuery: ListUserInvitationsRequest,
): Promise<string | null> {
    if (principal.type === PrincipalType.SERVICE) {
        if (isNil(requestQuery.workspaceId)) {
            return null
        }
        await assertPrincipalHasPermissionToWorkspace(app, request, reply, principal, requestQuery.workspaceId, Permission.READ_INVITATION)
        return requestQuery.workspaceId
    }
    return requestQuery.workspaceId ?? null
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

async function assertPrincipalHasPermissionToWorkspace<R extends Principal & { tenant: { id: string } }>(
    fastify: FastifyInstance,
    request: FastifyRequest, reply: FastifyReply, principal: R,
    workspaceId: string, _permission: Permission): Promise<void> {
    const workspace = await workspaceService(request.log).getOneOrThrow(workspaceId)
    if (isNil(workspace) || workspace.tenantId !== principal.tenant.id) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'user does not have access to the workspace',
            },
        })
    }
    await workspaceAccess(request.log).assertPrincipalCanAccessWorkspace({ principal: request.principal, workspaceId })
}


const ListUserInvitationsRequestParams = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER, PrincipalType.SERVICE], {
            type: WorkspaceResourceType.QUERY,
            queryKey: 'workspaceId',
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
            type: WorkspaceResourceType.BODY,
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
