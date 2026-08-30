import { EntityId, Permission, SeekPage } from '@fema-ipaas/core-utils'
import { ApplicationEventName, DefaultProjectRole, PrincipalType, ProjectMember, ProjectMemberWithUser } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { projectMemberService } from './project-member.service'

export const projectMemberController: FastifyPluginAsyncZod = async (app) => {
    app.get('/me', GetMyRoleRequest, async (request) => {
        return projectMemberService(request.log).resolveMyRole({
            principal: request.principal,
            projectId: request.query.projectId,
        })
    })

    app.get('/', ListMembersRequest, async (request): Promise<SeekPage<ProjectMemberWithUser>> => {
        return projectMemberService(request.log).list({
            projectId: request.query.projectId,
            cursor: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_LIMIT,
        })
    })

    app.post('/', UpsertMemberRequest, async (request): Promise<ProjectMember> => {
        const member = await projectMemberService(request.log).upsert({
            projectId: request.body.projectId,
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
        const removed = await projectMemberService(request.log).delete({
            id: request.params.id,
            projectId: request.query.projectId,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.MEMBER_REMOVED,
            data: { member: { userId: removed.userId, role: removed.role } },
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const DEFAULT_LIMIT = 50

const ProjectQuery = z.object({ projectId: EntityId })

const GetMyRoleRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER], undefined, {
            type: ProjectResourceType.QUERY,
        }),
    },
    schema: {
        querystring: ProjectQuery,
        response: {
            [StatusCodes.OK]: z.object({
                role: z.enum(DefaultProjectRole).nullable(),
                permissions: z.array(z.string()),
            }),
        },
    },
}

const ListMembersRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.READ_PROJECT_MEMBER, {
            type: ProjectResourceType.QUERY,
        }),
    },
    schema: {
        tags: ['project-members'],
        description: 'List the members of a project.',
        querystring: ProjectQuery.extend({
            cursor: z.string().optional(),
            limit: z.coerce.number().optional(),
        }),
    },
}

const UpsertMemberRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.WRITE_PROJECT_MEMBER, {
            type: ProjectResourceType.BODY,
        }),
    },
    schema: {
        body: z.object({
            projectId: EntityId,
            userId: EntityId,
            role: z.enum(DefaultProjectRole),
        }),
    },
}

const DeleteMemberRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.WRITE_PROJECT_MEMBER, {
            type: ProjectResourceType.QUERY,
        }),
    },
    schema: {
        tags: ['project-members'],
        description: 'Remove a member from a project.',
        params: z.object({ id: EntityId }),
        querystring: ProjectQuery,
    },
}
