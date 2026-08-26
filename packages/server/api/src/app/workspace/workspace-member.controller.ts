import { EntityId, Permission, SeekPage } from '@fema-ipaas/core-utils'
import { ApplicationEventName, DefaultWorkspaceRole, PrincipalType, WorkspaceMember, WorkspaceMemberWithUser } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { WorkspaceResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { workspaceMemberService } from './workspace-member.service'

export const workspaceMemberController: FastifyPluginAsyncZod = async (app) => {
    app.get('/me', GetMyRoleRequest, async (request) => {
        return workspaceMemberService(request.log).resolveMyRole({
            principal: request.principal,
            workspaceId: request.query.workspaceId,
        })
    })

    app.get('/', ListMembersRequest, async (request): Promise<SeekPage<WorkspaceMemberWithUser>> => {
        return workspaceMemberService(request.log).list({
            workspaceId: request.query.workspaceId,
            cursor: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_LIMIT,
        })
    })

    app.post('/', UpsertMemberRequest, async (request): Promise<WorkspaceMember> => {
        const member = await workspaceMemberService(request.log).upsert({
            workspaceId: request.body.workspaceId,
            userId: request.body.userId,
            role: request.body.role,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.MEMBER_ADDED,
            data: { member: { userId: member.userId, role: member.role } },
        })
        return member
    })

    app.delete('/:id', DeleteMemberRequest, async (request, reply) => {
        const removed = await workspaceMemberService(request.log).delete({
            id: request.params.id,
            workspaceId: request.query.workspaceId,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.MEMBER_REMOVED,
            data: { member: { userId: removed.userId, role: removed.role } },
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const DEFAULT_LIMIT = 50

const WorkspaceQuery = z.object({ workspaceId: EntityId })

const GetMyRoleRequest = {
    config: {
        security: securityAccess.workspace([PrincipalType.USER], undefined, {
            type: WorkspaceResourceType.QUERY,
        }),
    },
    schema: {
        querystring: WorkspaceQuery,
        response: {
            [StatusCodes.OK]: z.object({
                role: z.enum(DefaultWorkspaceRole).nullable(),
                permissions: z.array(z.string()),
            }),
        },
    },
}

const ListMembersRequest = {
    config: {
        security: securityAccess.workspace([PrincipalType.USER, PrincipalType.SERVICE], Permission.READ_WORKSPACE_MEMBER, {
            type: WorkspaceResourceType.QUERY,
        }),
    },
    schema: {
        tags: ['workspace-members'],
        description: 'List the members of a workspace.',
        querystring: WorkspaceQuery.extend({
            cursor: z.string().optional(),
            limit: z.coerce.number().optional(),
        }),
    },
}

const UpsertMemberRequest = {
    config: {
        security: securityAccess.workspace([PrincipalType.USER, PrincipalType.SERVICE], Permission.WRITE_WORKSPACE_MEMBER, {
            type: WorkspaceResourceType.BODY,
        }),
    },
    schema: {
        body: z.object({
            workspaceId: EntityId,
            userId: EntityId,
            role: z.enum(DefaultWorkspaceRole),
        }),
    },
}

const DeleteMemberRequest = {
    config: {
        security: securityAccess.workspace([PrincipalType.USER, PrincipalType.SERVICE], Permission.WRITE_WORKSPACE_MEMBER, {
            type: WorkspaceResourceType.QUERY,
        }),
    },
    schema: {
        tags: ['workspace-members'],
        description: 'Remove a member from a workspace.',
        params: z.object({ id: EntityId }),
        querystring: WorkspaceQuery,
    },
}
