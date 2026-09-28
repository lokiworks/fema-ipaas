import { ApplicationError, ErrorCode, isNil, Permission, ProjectRole, RoleType } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, Principal, PrincipalType, rolePermissions, TenantRole } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In, IsNull } from 'typeorm'
import { userService } from '../user/user-service'
import { projectMemberRepo } from './project-member.repo'
import { projectRepo } from './project-repo'
import { projectService } from './project-service'

function buildRole(name: DefaultProjectRole): ProjectRole {
    return {
        id: name,
        created: EPOCH,
        updated: EPOCH,
        name,
        permissions: rolePermissions[name],
        tenantId: null,
        type: RoleType.DEFAULT,
    }
}

const EPOCH = new Date(0).toISOString()

function denied(message: string): never {
    throw new ApplicationError({
        code: ErrorCode.AUTHORIZATION,
        params: { message },
    })
}

export const projectAccess = (log: FastifyBaseLogger) => ({
    async assertPrincipalCanAccessProject({ principal, projectId, permission }: AssertParams): Promise<void> {
        if (isNil(projectId)) {
            denied('Project ID is required')
        }
        const project = await projectService(log).getOne(projectId)
        const tenantId = 'tenant' in principal ? principal.tenant.id : undefined
        if (isNil(project) || isNil(tenantId) || project.tenantId !== tenantId) {
            denied('User not allowed to access this project')
        }
        if (principal.type !== PrincipalType.USER) {
            return
        }
        const role = await this.resolveRole({ userId: principal.id, projectId })
        if (isNil(role)) {
            denied('User not allowed to access this project')
        }
        if (!isNil(permission) && !role.permissions.includes(permission)) {
            denied(`Role ${role.name} is missing permission ${permission}`)
        }
    },

    async resolveRole({ userId, projectId }: ResolveRoleParams): Promise<ProjectRole | null> {
        const project = await projectService(log).getOne(projectId)
        if (isNil(project)) {
            return null
        }
        if (project.ownerId === userId) {
            return buildRole(DefaultProjectRole.ADMIN)
        }
        const user = await userService(log).getOneOrFail({ id: userId })
        if (user.tenantId !== project.tenantId) {
            return null
        }
        if (user.tenantRole === TenantRole.ADMIN) {
            return buildRole(DefaultProjectRole.ADMIN)
        }
        const membership = await projectMemberRepo().findOneBy({ projectId, userId })
        if (isNil(membership)) {
            return null
        }
        return buildRole(membership.role)
    },

    async projectsWithPermission({ userId, tenantId, permission }: ProjectsWithPermissionParams): Promise<AccessibleProject[]> {
        const user = await userService(log).getOneOrFail({ id: userId })
        if (user.tenantId !== tenantId) {
            return []
        }
        const projects = await projectRepo().find({ where: { tenantId, deleted: IsNull() }, select: ['id', 'displayName', 'ownerId'] })
        if (user.tenantRole === TenantRole.ADMIN) {
            return projects.map(toAccessibleProject)
        }
        const memberships = await projectMemberRepo().find({ where: { userId, projectId: In(projects.map((project) => project.id)) }, select: ['projectId', 'role'] })
        const roleByProject = new Map(memberships.map((membership) => [membership.projectId, membership.role]))
        return projects
            .filter((project) => {
                if (project.ownerId === userId) {
                    return true
                }
                const role = roleByProject.get(project.id)
                return !isNil(role) && rolePermissions[role].includes(permission)
            })
            .map(toAccessibleProject)
    },

    async isTenantAdmin({ userId }: { userId: string }): Promise<boolean> {
        const user = await userService(log).getOneOrFail({ id: userId })
        return user.tenantRole === TenantRole.ADMIN
    },
})

function toAccessibleProject(project: { id: string, displayName: string }): AccessibleProject {
    return { id: project.id, displayName: project.displayName }
}

type AssertParams = {
    principal: Principal
    projectId: string | undefined | null
    permission?: Permission
}

type ResolveRoleParams = {
    userId: string
    projectId: string
}

type ProjectsWithPermissionParams = {
    userId: string
    tenantId: string
    permission: Permission
}

export type AccessibleProject = {
    id: string
    displayName: string
}
