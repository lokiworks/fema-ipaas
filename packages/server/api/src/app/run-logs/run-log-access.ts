import { isNil, Permission } from '@fema-ipaas/core-utils'
import { rolePermissions, TenantRole } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { connectionAccessService } from '../connection/connection-access.service'
import { getEffectiveExecutionDataRetentionDays } from '../file/file.service'
import { privacyService } from '../privacy/privacy.service'
import { projectMemberRepo } from '../project/project-member.repo'
import { projectRepo } from '../project/project-repo'
import { userRepo } from '../user/user-service'

export const runLogAccess = (log: FastifyBaseLogger) => ({
    async resolve({ userId, tenantId }: UserRef): Promise<RunLogAccess> {
        const [user, projectIds, privacy] = await Promise.all([
            userRepo().findOneBy({ id: userId, tenantId }),
            connectionAccessService(log).memberProjectIds({ userId, tenantId }),
            privacyService(log).get({ tenantId }),
        ])
        const tenantRetentionDays = getEffectiveExecutionDataRetentionDays(privacy.logRetentionDays)
        if (isNil(user) || projectIds.length === 0) {
            return { isTenantAdmin: false, tenantRetentionDays, projects: [] }
        }
        const isTenantAdmin = user.tenantRole === TenantRole.ADMIN
        const [projects, memberships] = await Promise.all([
            projectRepo().find({
                where: { id: In(projectIds), tenantId },
                select: ['id', 'displayName', 'ownerId', 'executionDataRetentionDays'],
            }),
            projectMemberRepo().find({ where: { userId, projectId: In(projectIds) }, select: ['projectId', 'role'] }),
        ])
        const roleByProject = new Map(memberships.map((membership) => [membership.projectId, membership.role]))
        return {
            isTenantAdmin,
            tenantRetentionDays,
            projects: projects.map((project) => {
                const role = roleByProject.get(project.id)
                const projectDays = isNil(project.executionDataRetentionDays)
                    ? privacy.logRetentionDays
                    : Math.min(privacy.logRetentionDays, project.executionDataRetentionDays)
                return {
                    id: project.id,
                    displayName: project.displayName,
                    retentionDays: getEffectiveExecutionDataRetentionDays(projectDays),
                    canRerun: isTenantAdmin || project.ownerId === userId || (!isNil(role) && rolePermissions[role].includes(Permission.WRITE_RUN)),
                }
            }),
        }
    },
})

type UserRef = {
    userId: string
    tenantId: string
}

export type RunLogAccessProject = {
    id: string
    displayName: string
    retentionDays: number
    canRerun: boolean
}

export type RunLogAccess = {
    isTenantAdmin: boolean
    tenantRetentionDays: number
    projects: RunLogAccessProject[]
}
