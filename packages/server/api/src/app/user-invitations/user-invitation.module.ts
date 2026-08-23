import { assertNotNullOrUndefined, ErrorCode, isNil, Permission, PlatformError, SeekPage, WorkspaceRole } from '@fema/core-utils'
import { InvitationStatus, InvitationType, ListUserInvitationsRequest, Principal, PrincipalType, SendUserInvitationRequest, SERVICE_KEY_SECURITY_OPENAPI, UserInvitation, UserInvitationWithLink } from '@fema/shared'
import { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { WorkspaceResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { platformGuards } from '../core/security/platform-guards'
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
                await platformGuards.assertWorkspaceIsTeamType({ workspaceId: request.body.workspaceId, log: request.log })
                await assertPrincipalHasPermissionToWorkspace(app, request, reply, request.principal, request.body.workspaceId, Permission.WRITE_INVITATION)
                break
            case InvitationType.PLATFORM:
                await platformGuards.assertPrincipalIsPlatformAdmin({ principal: request.principal, log: request.log })
                break
        }
        const platformId = request.principal.platform.id
        const status = await shouldAutoAcceptInvitation(request.principal, request.body, platformId, request.log) ? InvitationStatus.ACCEPTED : InvitationStatus.PENDING
        const workspaceRole = await getWorkspaceRoleAndAssertIfFound(platformId, request.body)

        const invitationRecordParams = {
            email,
            type,
            platformId,
            platformRole: type === InvitationType.WORKSPACE ? null : request.body.platformRole,
            workspaceId: type === InvitationType.PLATFORM ? null : request.body.workspaceId,
            workspaceRoleId: type === InvitationType.PLATFORM ? null : workspaceRole?.id ?? null,
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
            await platformGuards.assertWorkspaceIsTeamType({ workspaceId: request.query.workspaceId, log: request.log })
        }
        const workspaceId = await getWorkspaceIdAndAssertPermission(app, request, reply, request.principal, request.query)
        const invitations = await userInvitationsService(request.log).list({
            platformId: request.principal.platform.id,
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
            platformId: invitation.platformId,
        })
        await reply.status(StatusCodes.OK).send({ ...invitation, registered })
    })

    app.delete('/:id', DeleteInvitationRequestParams, async (request, reply) => {
        const invitation = await userInvitationsService(request.log).getOneOrThrow({
            id: request.params.id,
            platformId: request.principal.platform.id,
        })
        switch (invitation.type) {
            case InvitationType.WORKSPACE: {
                assertNotNullOrUndefined(invitation.workspaceId, 'workspaceId')
                await assertPrincipalHasPermissionToWorkspace(app, request, reply, request.principal, invitation.workspaceId, Permission.WRITE_INVITATION)
                break
            }
            case InvitationType.PLATFORM:
                await platformGuards.assertPrincipalIsPlatformAdmin({ principal: request.principal, log: request.log })
                break
        }
        await userInvitationsService(request.log).delete({
            id: request.params.id,
            platformId: request.principal.platform.id,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}


const getWorkspaceRoleAndAssertIfFound = async (platformId: string, request: SendUserInvitationRequest): Promise<WorkspaceRole | null> => {
    const { type } = request
    if (type === InvitationType.PLATFORM) {
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

async function shouldAutoAcceptInvitation(principal: Principal, request: SendUserInvitationRequest, platformId: string, log: FastifyBaseLogger): Promise<boolean> {
    if (principal.type === PrincipalType.SERVICE) {
        return true
    }

    if (request.type === InvitationType.PLATFORM) {
        return false
    }

    const identity = await userIdentityService(log).getIdentityByEmail(request.email)
    if (isNil(identity)) {
        return false
    }

    const user = await userService(log).getOneByIdentityAndPlatform({
        identityId: identity.id,
        platformId,
    })
    return !isNil(user)
}

async function assertPrincipalHasPermissionToWorkspace<R extends Principal & { platform: { id: string } }>(
    fastify: FastifyInstance,
    request: FastifyRequest, reply: FastifyReply, principal: R,
    workspaceId: string, _permission: Permission): Promise<void> {
    const workspace = await workspaceService(request.log).getOneOrThrow(workspaceId)
    if (isNil(workspace) || workspace.platformId !== principal.platform.id) {
        throw new PlatformError({
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
        security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE], {
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
        security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE], {
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
