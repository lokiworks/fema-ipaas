import { apId, ApplicationError, ErrorCode, isNil, SeekPage } from '@fema-ipaas/core-utils'
import { DefaultWorkspaceRole, Principal, PrincipalType, WorkspaceMember } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { Order } from '../helper/pagination/paginator'
import { workspaceAccess } from './workspace-access'
import { WorkspaceMemberEntity } from './workspace-member.entity'
import { workspaceMemberRepo } from './workspace-member.repo'

export const workspaceMemberService = (log: FastifyBaseLogger) => ({
    async resolveMyRole({ principal, workspaceId }: ResolveMyRoleParams): Promise<MyRoleResponse> {
        if (principal.type !== PrincipalType.USER) {
            return { role: null, permissions: [] }
        }
        const role = await workspaceAccess(log).resolveRole({ userId: principal.id, workspaceId })
        if (isNil(role)) {
            return { role: null, permissions: [] }
        }
        return { role: role.name as DefaultWorkspaceRole, permissions: role.permissions }
    },

    async list({ workspaceId, cursor, limit }: ListParams): Promise<SeekPage<WorkspaceMember>> {
        const decodedCursor = paginationHelper.decodeCursor(cursor)
        const paginator = buildPaginator({
            entity: WorkspaceMemberEntity,
            query: {
                limit,
                order: Order.ASC,
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const query = workspaceMemberRepo().createQueryBuilder('workspace_member').where({ workspaceId })
        const { data, cursor: newCursor } = await paginator.paginate(query)
        return paginationHelper.createPage<WorkspaceMember>(data, newCursor)
    },

    async upsert({ workspaceId, userId, role }: UpsertParams): Promise<WorkspaceMember> {
        const existing = await workspaceMemberRepo().findOneBy({ workspaceId, userId })
        if (!isNil(existing)) {
            return workspaceMemberRepo().save({ ...existing, role })
        }
        return workspaceMemberRepo().save({ id: apId(), workspaceId, userId, role })
    },

    async delete({ id, workspaceId }: DeleteParams): Promise<WorkspaceMember> {
        const member = await workspaceMemberRepo().findOneBy({ id, workspaceId })
        if (isNil(member)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'workspace_member', entityId: id },
            })
        }
        await workspaceMemberRepo().delete({ id, workspaceId })
        return member
    },
})

type MyRoleResponse = {
    role: DefaultWorkspaceRole | null
    permissions: string[]
}

type ResolveMyRoleParams = {
    principal: Principal
    workspaceId: string
}

type ListParams = {
    workspaceId: string
    cursor: string | null
    limit: number
}

type UpsertParams = {
    workspaceId: string
    userId: string
    role: DefaultWorkspaceRole
}

type DeleteParams = {
    id: string
    workspaceId: string
}
