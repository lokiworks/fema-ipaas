import { ApplicationError, ErrorCode, generateId, isNil, SeekPage } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, Principal, PrincipalType, ProjectMember, ProjectMemberWithUser } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { Order } from '../helper/pagination/paginator'
import { userService } from '../user/user-service'
import { projectAccess } from './project-access'
import { ProjectMemberEntity } from './project-member.entity'
import { projectMemberRepo } from './project-member.repo'

export const projectMemberService = (log: FastifyBaseLogger) => ({
    async resolveMyRole({ principal, projectId }: ResolveMyRoleParams): Promise<MyRoleResponse> {
        if (principal.type !== PrincipalType.USER) {
            return { role: null, permissions: [] }
        }
        const role = await projectAccess(log).resolveRole({ userId: principal.id, projectId })
        if (isNil(role)) {
            return { role: null, permissions: [] }
        }
        return { role: role.name as DefaultProjectRole, permissions: role.permissions }
    },

    async list({ projectId, cursor, limit }: ListParams): Promise<SeekPage<ProjectMemberWithUser>> {
        const decodedCursor = paginationHelper.decodeCursor(cursor)
        const paginator = buildPaginator({
            entity: ProjectMemberEntity,
            query: {
                limit,
                order: Order.ASC,
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const query = projectMemberRepo().createQueryBuilder('project_member').where({ projectId })
        const { data, cursor: newCursor } = await paginator.paginate(query)
        const withUsers = await Promise.all(data.map(async (member) => ({
            ...member,
            user: await userService(log).getMetaInformation({ id: member.userId }),
        })))
        return paginationHelper.createPage<ProjectMemberWithUser>(withUsers, newCursor)
    },

    async upsert({ projectId, userId, role }: UpsertParams): Promise<ProjectMember> {
        const existing = await projectMemberRepo().findOneBy({ projectId, userId })
        if (!isNil(existing)) {
            return projectMemberRepo().save({ ...existing, role })
        }
        return projectMemberRepo().save({ id: generateId(), projectId, userId, role })
    },

    async delete({ id, projectId }: DeleteParams): Promise<ProjectMember> {
        const member = await projectMemberRepo().findOneBy({ id, projectId })
        if (isNil(member)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'project_member', entityId: id },
            })
        }
        await projectMemberRepo().delete({ id, projectId })
        return member
    },
})

type MyRoleResponse = {
    role: DefaultProjectRole | null
    permissions: string[]
}

type ResolveMyRoleParams = {
    principal: Principal
    projectId: string
}

type ListParams = {
    projectId: string
    cursor: string | null
    limit: number
}

type UpsertParams = {
    projectId: string
    userId: string
    role: DefaultProjectRole
}

type DeleteParams = {
    id: string
    projectId: string
}
