import { ProjectId, TenantId, UserId } from '@fema-ipaas/core-utils'
import { ProjectDirectoryItem, ProjectResourceCounts, ProjectType, TenantRole, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { dataStoreService } from '../data-store/data-store.service'
import { mappingTableRepo } from '../mapping-table/mapping-table.service'
import { userService } from '../user/user-service'
import { variableRepo } from '../variable/variable.service'
import { folderRepo } from '../workflows/folder/folder.service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { projectDirectoryUtils } from './project-directory-utils'
import { projectMemberRepo } from './project-member.repo'
import { projectRepo } from './project-repo'

export const projectDirectoryService = (log: FastifyBaseLogger) => ({
    async list({ tenantId, userId }: ListParams): Promise<ProjectDirectoryItem[]> {
        const user = await userService(log).getOneOrFail({ id: userId })
        const projects = await projectRepo()
            .createQueryBuilder('project')
            .where('project."tenantId" = :tenantId', { tenantId })
            .andWhere('project.deleted IS NULL')
            .andWhere('(project.type = :teamType OR (project.type = :personalType AND project."ownerId" = :userId))', {
                teamType: ProjectType.TEAM,
                personalType: ProjectType.PERSONAL,
                userId,
            })
            .orderBy('project.type', 'ASC')
            .addOrderBy('project.displayName', 'ASC')
            .getMany()
        if (projects.length === 0) {
            return []
        }
        const projectIds = projects.map((project) => project.id)
        const ownerIds = [...new Set(projects.map((project) => project.ownerId))]
        const [workflowCounts, memberRows, owners] = await Promise.all([
            workflowRepo().createQueryBuilder('workflow')
                .select('workflow."projectId"', 'projectId')
                .addSelect('COUNT(*)::int', 'total')
                .addSelect('COUNT(*) FILTER (WHERE workflow.status = :enabled)::int', 'running')
                .where('workflow."projectId" IN (:...projectIds)', { projectIds })
                .setParameter('enabled', WorkflowStatus.ENABLED)
                .groupBy('workflow."projectId"')
                .getRawMany<WorkflowCountRow>(),
            projectMemberRepo().createQueryBuilder('member')
                .select(['member.projectId', 'member.userId', 'member.role'])
                .where('member."projectId" IN (:...projectIds)', { projectIds })
                .getMany(),
            ownerNames({ ownerIds }),
        ])
        const counts = new Map(workflowCounts.map((row) => [row.projectId, row]))
        const isTenantAdmin = user.tenantRole === TenantRole.ADMIN
        return projects.map((project) => {
            const members = memberRows.filter((member) => member.projectId === project.id)
            const count = counts.get(project.id)
            return {
                id: project.id,
                displayName: project.displayName,
                description: project.description ?? null,
                icon: project.icon,
                ownerId: project.ownerId,
                ownerName: owners.get(project.ownerId) ?? null,
                created: new Date(project.created).toISOString(),
                updated: new Date(project.updated).toISOString(),
                myRole: projectDirectoryUtils.resolveRole({
                    userId,
                    ownerId: project.ownerId,
                    isTenantAdmin,
                    membershipRole: members.find((member) => member.userId === userId)?.role ?? null,
                }),
                workflowCount: count?.total ?? 0,
                runningCount: count?.running ?? 0,
                memberCount: projectDirectoryUtils.memberCount({ ownerId: project.ownerId, memberUserIds: members.map((member) => member.userId) }),
                workflowsLimit: project.workflowsLimit ?? null,
                monthlyRunsLimit: project.monthlyRunsLimit ?? null,
                releasesEnabled: project.releasesEnabled,
            }
        })
    },

    async resourceCounts({ projectId }: { projectId: ProjectId }): Promise<ProjectResourceCounts> {
        const project = await projectRepo().findOneByOrFail({ id: projectId })
        const [workflows, folders, variables, mappingTables, dataStores, memberUserIds] = await Promise.all([
            workflowRepo().countBy({ projectId }),
            folderRepo().countBy({ projectId }),
            variableRepo().countBy({ projectId }),
            mappingTableRepo().countBy({ projectId }),
            dataStoreService(log).countByProject({ projectId }),
            projectMemberRepo().find({ where: { projectId }, select: ['userId'] }).then((rows) => rows.map((row) => row.userId)),
        ])
        return {
            workflows,
            folders,
            variables,
            mappingTables,
            dataStores,
            members: projectDirectoryUtils.memberCount({ ownerId: project.ownerId, memberUserIds }),
        }
    },
})

async function ownerNames({ ownerIds }: { ownerIds: UserId[] }): Promise<Map<string, string>> {
    if (ownerIds.length === 0) {
        return new Map()
    }
    const rows: OwnerRow[] = await projectRepo().query(
        `SELECT u.id AS "id", ui."firstName" AS "firstName", ui."lastName" AS "lastName", ui.email AS "email"
         FROM "user" u
         INNER JOIN user_identity ui ON ui.id = u."identityId"
         WHERE u.id = ANY($1)`,
        [ownerIds],
    )
    return new Map(rows.map((row) => [row.id, projectDirectoryUtils.displayName(row)]))
}

type ListParams = {
    tenantId: TenantId
    userId: UserId
}

type WorkflowCountRow = {
    projectId: string
    total: number
    running: number
}

type OwnerRow = {
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
}
