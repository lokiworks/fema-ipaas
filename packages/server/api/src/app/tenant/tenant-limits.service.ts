import { ApplicationError, ErrorCode, isNil, ProjectId, TenantId } from '@fema-ipaas/core-utils'
import { ProjectType, SYSTEM_LIMITS, Tenant, TenantLimits, UserStatus, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { distributedStore } from '../database/redis-connections'
import { ProjectEntity } from '../project/project-entity'
import { UserEntity } from '../user/user-entity'
import { WorkflowEntity } from '../workflows/workflow/workflow.entity'
import { tenantLimitsUtils } from './tenant-limits.utils'
import { TenantEntity } from './tenant.entity'

const tenantRepo = repoFactory<Tenant & TenantLimits>(TenantEntity)
const userRepo = repoFactory(UserEntity)
const projectRepo = repoFactory(ProjectEntity)
const workflowRepo = repoFactory(WorkflowEntity)

export const tenantLimitsService = (_log: FastifyBaseLogger) => ({
    async getEffective({ tenantId }: TenantParams): Promise<TenantLimits> {
        const row = await tenantRepo().findOne({
            where: { id: tenantId },
            select: ['id', 'usersLimit', 'projectsLimit', 'activeWorkflowsLimit', 'concurrentExecutionsLimit', 'workerGroupId'],
        })
        if (isNil(row)) {
            return SYSTEM_LIMITS
        }
        return tenantLimitsUtils.effective({ row, system: SYSTEM_LIMITS })
    },

    async assertCanAddUser({ tenantId }: TenantParams): Promise<void> {
        const limits = await this.getEffective({ tenantId })
        if (isNil(limits.usersLimit)) {
            return
        }
        const current = await userRepo().countBy({ tenantId, status: UserStatus.ACTIVE })
        assertBelow({ limit: limits.usersLimit, current, message: 'tenantUsersLimitReached' })
    },

    async assertCanAddProject({ tenantId }: TenantParams): Promise<void> {
        const limits = await this.getEffective({ tenantId })
        if (isNil(limits.projectsLimit)) {
            return
        }
        const current = await projectRepo().countBy({ tenantId, type: ProjectType.TEAM })
        assertBelow({ limit: limits.projectsLimit, current, message: 'tenantProjectsLimitReached' })
    },

    async assertCanEnableWorkflow({ projectId }: ProjectParams): Promise<void> {
        const project = await projectRepo().findOne({ where: { id: projectId }, select: ['id', 'tenantId'] })
        if (isNil(project)) {
            return
        }
        const limits = await this.getEffective({ tenantId: project.tenantId })
        if (isNil(limits.activeWorkflowsLimit)) {
            return
        }
        const current = await countActiveWorkflows({ tenantId: project.tenantId })
        assertBelow({ limit: limits.activeWorkflowsLimit, current, message: 'tenantActiveWorkflowsLimitReached' })
    },

    async getConcurrentExecutionsLimit({ tenantId }: TenantParams): Promise<number | null> {
        const cached = await distributedStore.get<number>(concurrencyLimitKey(tenantId))
        if (!isNil(cached)) {
            return cached === NO_LIMIT_SENTINEL ? null : cached
        }
        const limits = await this.getEffective({ tenantId })
        await distributedStore.put(concurrencyLimitKey(tenantId), limits.concurrentExecutionsLimit ?? NO_LIMIT_SENTINEL, CONCURRENCY_LIMIT_TTL_SECONDS)
        return limits.concurrentExecutionsLimit ?? null
    },

    async invalidateConcurrentExecutionsLimit({ tenantId }: TenantParams): Promise<void> {
        await distributedStore.delete(concurrencyLimitKey(tenantId))
    },

    async countActiveWorkflows({ tenantId }: TenantParams): Promise<number> {
        return countActiveWorkflows({ tenantId })
    },
})

async function countActiveWorkflows({ tenantId }: TenantParams): Promise<number> {
    return workflowRepo()
        .createQueryBuilder('workflow')
        .innerJoin('project', 'project', 'project.id = workflow."projectId"')
        .where('project."tenantId" = :tenantId', { tenantId })
        .andWhere('project.deleted IS NULL')
        .andWhere('workflow.status = :status', { status: WorkflowStatus.ENABLED })
        .getCount()
}

function assertBelow({ limit, current, message }: { limit: number, current: number, message: string }): void {
    if (!tenantLimitsUtils.isReached({ limit, current })) {
        return
    }
    throw new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

function concurrencyLimitKey(tenantId: TenantId): string {
    return `tenant-quota:concurrency-limit:v1:${tenantId}`
}

const NO_LIMIT_SENTINEL = -1
const CONCURRENCY_LIMIT_TTL_SECONDS = 60

type TenantParams = {
    tenantId: TenantId
}

type ProjectParams = {
    projectId: ProjectId
}
