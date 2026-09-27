import { ApplicationError, ErrorCode, isNil, ProjectId, TenantId, UserId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import {
    ExecutionStatus,
    isFailedState,
    ProjectLimitsListResponse,
    ProjectLimitsRow,
    ProjectLimitsUsage,
    RunEnvironment,
    UpdateProjectLimitsRequestBody,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { projectDirectoryUtils } from '../project/project-directory-utils'
import { projectMemberRepo } from '../project/project-member.repo'
import { projectRepo } from '../project/project-repo'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { instanceLimits } from './instance-limits'
import { runQuotaUtils } from './run-quota-utils'
import { runQuota } from './run-quota.service'

export const projectLimitsService = (log: FastifyBaseLogger) => ({
    async list({ tenantId }: { tenantId: TenantId }): Promise<ProjectLimitsListResponse> {
        const monthStart = runQuotaUtils.monthStart(dayjsUtil())
        const projects = await projectRepo().find({
            where: { tenantId },
            select: ['id', 'displayName', 'ownerId', 'workflowsLimit', 'monthlyRunsLimit'],
            order: { displayName: 'ASC' },
        })
        const projectIds = projects.map((project) => project.id)
        const [workflowCounts, memberRows, owners, runUsage, outcomes, runsInDeletedProjects] = await Promise.all([
            countWorkflows({ projectIds }),
            projectIds.length === 0 ? Promise.resolve([]) : projectMemberRepo().createQueryBuilder('member')
                .select(['member.projectId', 'member.userId'])
                .where('member."projectId" IN (:...projectIds)', { projectIds })
                .getMany(),
            ownerNames({ ownerIds: [...new Set(projects.map((project) => project.ownerId))] }),
            runQuota(log).usageThisMonth({ projectIds }),
            monthlyOutcomes({ projectIds, since: monthStart }),
            countRunsInDeletedProjects({ tenantId, since: monthStart }),
        ])
        const data: ProjectLimitsRow[] = projects.map((project) => {
            const outcome = outcomes.get(project.id)
            return {
                projectId: project.id,
                displayName: project.displayName,
                ownerName: owners.get(project.ownerId) ?? null,
                memberCount: projectDirectoryUtils.memberCount({
                    ownerId: project.ownerId,
                    memberUserIds: memberRows.filter((member) => member.projectId === project.id).map((member) => member.userId),
                }),
                workflows: {
                    used: workflowCounts.get(project.id) ?? 0,
                    limit: project.workflowsLimit ?? instanceLimits.projectWorkflows(),
                    override: project.workflowsLimit ?? null,
                },
                monthlyRuns: {
                    used: runUsage.get(project.id) ?? 0,
                    limit: project.monthlyRunsLimit ?? instanceLimits.runsPerMonth(),
                    override: project.monthlyRunsLimit ?? null,
                },
                monthStart,
                succeededThisMonth: outcome?.succeeded ?? 0,
                failedThisMonth: outcome?.failed ?? 0,
            }
        })
        return {
            data,
            workflowsCeiling: instanceLimits.projectWorkflows(),
            monthlyRunsCeiling: instanceLimits.runsPerMonth(),
            monthStart,
            runsInDeletedProjects,
        }
    },

    async usage({ projectId }: { projectId: ProjectId }): Promise<ProjectLimitsUsage> {
        const project = await projectRepo().findOneOrFail({ where: { id: projectId }, select: ['id', 'workflowsLimit', 'monthlyRunsLimit'] })
        const [workflows, runs] = await Promise.all([
            workflowRepo().countBy({ projectId }),
            runQuota(log).usageThisMonth({ projectIds: [projectId] }),
        ])
        return {
            projectId,
            workflows: {
                used: workflows,
                limit: project.workflowsLimit ?? instanceLimits.projectWorkflows(),
                override: project.workflowsLimit ?? null,
            },
            monthlyRuns: {
                used: runs.get(projectId) ?? 0,
                limit: project.monthlyRunsLimit ?? instanceLimits.runsPerMonth(),
                override: project.monthlyRunsLimit ?? null,
            },
            monthStart: runQuotaUtils.monthStart(dayjsUtil()),
        }
    },

    async update({ tenantId, projectId, request }: UpdateParams): Promise<ProjectLimitsUsage> {
        const project = await projectRepo().findOneBy({ id: projectId, tenantId })
        if (isNil(project)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'project', entityId: projectId },
            })
        }
        await projectLimitsGuard.assertWithinBounds({ projectId, workflowsLimit: request.workflowsLimit, monthlyRunsLimit: request.monthlyRunsLimit })
        await projectRepo().update({ id: projectId, tenantId }, {
            workflowsLimit: request.workflowsLimit,
            monthlyRunsLimit: request.monthlyRunsLimit,
        })
        await runQuota(log).invalidateProjectLimit({ projectId })
        return this.usage({ projectId })
    },
})

export const projectLimitsGuard = {
    async assertWithinBounds({ projectId, workflowsLimit, monthlyRunsLimit }: AssertBoundsParams): Promise<void> {
        if (!isNil(workflowsLimit)) {
            if (workflowsLimit > instanceLimits.projectWorkflows()) {
                invalid('workflowsLimitAboveInstanceLimit')
            }
            const current = await workflowRepo().countBy({ projectId })
            if (workflowsLimit < current) {
                invalid('workflowsLimitBelowCurrentCount')
            }
        }
        if (!isNil(monthlyRunsLimit) && monthlyRunsLimit > instanceLimits.runsPerMonth()) {
            invalid('monthlyRunsLimitAboveInstanceLimit')
        }
    },
}

function invalid(message: string): never {
    throw new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

async function countWorkflows({ projectIds }: { projectIds: ProjectId[] }): Promise<Map<string, number>> {
    if (projectIds.length === 0) {
        return new Map()
    }
    const rows = await workflowRepo().createQueryBuilder('workflow')
        .select('workflow."projectId"', 'projectId')
        .addSelect('COUNT(*)::int', 'total')
        .where('workflow."projectId" IN (:...projectIds)', { projectIds })
        .groupBy('workflow."projectId"')
        .getRawMany<{ projectId: string, total: number }>()
    return new Map(rows.map((row) => [row.projectId, Number(row.total)]))
}

async function monthlyOutcomes({ projectIds, since }: { projectIds: ProjectId[], since: string }): Promise<Map<string, OutcomeRow>> {
    if (projectIds.length === 0) {
        return new Map()
    }
    const rows: OutcomeRow[] = await projectRepo().query(
        `SELECT e."projectId" AS "projectId",
                COUNT(*) FILTER (WHERE e.status = $3)::int AS "succeeded",
                COUNT(*) FILTER (WHERE e.status = ANY($4))::int AS "failed"
         FROM execution e
         WHERE e."projectId" = ANY($1) AND e.environment = $5 AND e.created >= $2
         GROUP BY e."projectId"`,
        [projectIds, since, ExecutionStatus.SUCCEEDED, FAILED_STATUSES, RunEnvironment.PRODUCTION],
    )
    return new Map(rows.map((row) => [row.projectId, { projectId: row.projectId, succeeded: Number(row.succeeded), failed: Number(row.failed) }]))
}

async function countRunsInDeletedProjects({ tenantId, since }: { tenantId: TenantId, since: string }): Promise<number> {
    const rows: { count: number }[] = await projectRepo().query(
        `SELECT COUNT(*)::int AS "count"
         FROM execution e
         INNER JOIN project p ON p.id = e."projectId"
         WHERE p."tenantId" = $1 AND p.deleted IS NOT NULL AND e.environment = $2 AND e.created >= $3`,
        [tenantId, RunEnvironment.PRODUCTION, since],
    )
    return Number(rows[0]?.count ?? 0)
}

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

const FAILED_STATUSES = Object.values(ExecutionStatus).filter((status) => isFailedState(status))

type UpdateParams = {
    tenantId: TenantId
    projectId: ProjectId
    request: UpdateProjectLimitsRequestBody
}

type AssertBoundsParams = {
    projectId: ProjectId
    workflowsLimit: number | null | undefined
    monthlyRunsLimit: number | null | undefined
}

type OutcomeRow = {
    projectId: string
    succeeded: number
    failed: number
}

type OwnerRow = {
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
}
