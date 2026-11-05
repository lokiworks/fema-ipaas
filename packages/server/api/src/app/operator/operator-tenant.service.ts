import { ApplicationError, ErrorCode, isNil, SeekPage, TenantId } from '@fema-ipaas/core-utils'
import { ListOperatorTenantsRequestQuery, OperatorCreateTenantRequestBody, OperatorCreateTenantResponse, OperatorTenantSummary, ProjectType, Tenant, TenantLimits, TenantLimitsUpdate, TenantStatus, UserStatus, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { Brackets, In } from 'typeorm'
import { userIdentityRepository } from '../authentication/user-identity/user-identity-service'
import { repoFactory } from '../core/db/repo-factory'
import { identityContact } from '../helper/identity-contact'
import { likePatternUtils } from '../helper/like-pattern'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { ProjectEntity } from '../project/project-entity'
import { tenantOwnerService } from '../tenant/tenant-owner.service'
import { TenantEntity } from '../tenant/tenant.entity'
import { tenantRepo, tenantService } from '../tenant/tenant.service'
import { tenantUtils } from '../tenant/tenant.utils'
import { UserEntity } from '../user/user-entity'
import { WorkflowEntity } from '../workflows/workflow/workflow.entity'
import { operatorTenantUtils } from './operator-tenant.utils'

const tenantEntityRepo = repoFactory(TenantEntity)
const userRepo = repoFactory(UserEntity)
const projectRepo = repoFactory(ProjectEntity)
const workflowRepo = repoFactory(WorkflowEntity)

export const operatorTenantService = (log: FastifyBaseLogger) => ({
    async list(query: ListOperatorTenantsRequestQuery): Promise<SeekPage<OperatorTenantSummary>> {
        const decodedCursor = paginationHelper.decodeCursor(query.cursor ?? null)
        const paginator = buildPaginator({
            entity: TenantEntity,
            query: {
                limit: query.limit ?? DEFAULT_PAGE_SIZE,
                order: 'DESC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const builder = tenantEntityRepo().createQueryBuilder('tenant').where('1 = 1')
        if (!isNil(query.status)) {
            builder.andWhere('tenant.status = :status', { status: query.status })
        }
        const search = query.search?.trim()
        if (!isNil(search) && search.length > 0) {
            builder.andWhere(new Brackets((qb) => {
                qb.where('tenant.name ILIKE :pattern', { pattern: `%${likePatternUtils.escape(search)}%` })
                    .orWhere('tenant.slug ILIKE :pattern', { pattern: `%${likePatternUtils.escape(search)}%` })
            }))
        }
        const { data, cursor } = await paginator.paginate(builder)
        const summaries = await summarize({ tenants: data })
        return paginationHelper.createPage<OperatorTenantSummary>(summaries, cursor)
    },

    async getSummaryOrThrow({ tenantId }: TenantParams): Promise<OperatorTenantSummary> {
        const tenant = await tenantRepo().findOneByOrFail({ id: tenantId })
        const [summary] = await summarize({ tenants: [tenant] })
        return summary
    },

    async create({ request }: CreateParams): Promise<OperatorCreateTenantResponse> {
        const { identityId } = await tenantOwnerService(log).ensureIdentity({ owner: request.owner })
        const provisioned = await tenantService(log).provisionTenant({
            identityId,
            name: request.name,
            slug: request.slug,
            limits: request.limits,
        })
        const summary = await this.getSummaryOrThrow({ tenantId: provisioned.tenant.id })
        const loginUrl = await tenantUtils.getPublicTenantUrl({ slug: provisioned.tenant.slug })
        return {
            tenant: summary,
            ownerInvitationUrl: operatorTenantUtils.invitationUrl({ loginUrl, owner: request.owner }),
        }
    },

    async setStatus({ tenantId, status }: { tenantId: TenantId, status: TenantStatus }): Promise<OperatorTenantSummary> {
        await tenantService(log).setStatus({ tenantId, status })
        return this.getSummaryOrThrow({ tenantId })
    },

    async updateLimits({ tenantId, limits }: { tenantId: TenantId, limits: TenantLimitsUpdate }): Promise<OperatorTenantSummary> {
        await tenantService(log).updateLimits({ tenantId, limits })
        return this.getSummaryOrThrow({ tenantId })
    },

    async updateSlug({ tenantId, slug }: { tenantId: TenantId, slug: string }): Promise<OperatorTenantSummary> {
        await tenantService(log).updateSlug({ tenantId, slug })
        return this.getSummaryOrThrow({ tenantId })
    },

    async assertExists({ tenantId }: TenantParams): Promise<void> {
        const exists = await tenantRepo().existsBy({ id: tenantId })
        if (!exists) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'tenant', entityId: tenantId },
            })
        }
    },
})

async function summarize({ tenants }: { tenants: Array<Tenant & TenantLimits> }): Promise<OperatorTenantSummary[]> {
    if (tenants.length === 0) {
        return []
    }
    const tenantIds = tenants.map((tenant) => tenant.id)
    const [usersCounts, projectsCounts, workflowCounts, owners] = await Promise.all([
        countUsers({ tenantIds }),
        countProjects({ tenantIds }),
        countActiveWorkflows({ tenantIds }),
        loadOwners({ tenants }),
    ])
    return tenants.map((tenant) => operatorTenantUtils.toSummary({
        tenant,
        usersCount: usersCounts.get(tenant.id) ?? 0,
        projectsCount: projectsCounts.get(tenant.id) ?? 0,
        activeWorkflowsCount: workflowCounts.get(tenant.id) ?? 0,
        owner: owners.get(tenant.ownerId) ?? null,
    }))
}

async function countUsers({ tenantIds }: TenantIdsParams): Promise<Map<string, number>> {
    const rows = await userRepo().createQueryBuilder('member')
        .select('member."tenantId"', 'tenantId')
        .addSelect('COUNT(*)::int', 'total')
        .where({ tenantId: In(tenantIds), status: UserStatus.ACTIVE })
        .groupBy('member."tenantId"')
        .getRawMany<CountRow>()
    return toCountMap({ rows })
}

async function countProjects({ tenantIds }: TenantIdsParams): Promise<Map<string, number>> {
    const rows = await projectRepo().createQueryBuilder('project')
        .select('project."tenantId"', 'tenantId')
        .addSelect('COUNT(*)::int', 'total')
        .where({ tenantId: In(tenantIds), type: ProjectType.TEAM })
        .groupBy('project."tenantId"')
        .getRawMany<CountRow>()
    return toCountMap({ rows })
}

async function countActiveWorkflows({ tenantIds }: TenantIdsParams): Promise<Map<string, number>> {
    const rows = await workflowRepo().createQueryBuilder('workflow')
        .innerJoin('project', 'project', 'project.id = workflow."projectId"')
        .select('project."tenantId"', 'tenantId')
        .addSelect('COUNT(*)::int', 'total')
        .where('project."tenantId" IN (:...tenantIds)', { tenantIds })
        .andWhere('project.deleted IS NULL')
        .andWhere('workflow.status = :status', { status: WorkflowStatus.ENABLED })
        .groupBy('project."tenantId"')
        .getRawMany<CountRow>()
    return toCountMap({ rows })
}

async function loadOwners({ tenants }: { tenants: Tenant[] }): Promise<Map<string, OwnerInfo>> {
    const ownerIds = tenants.map((tenant) => tenant.ownerId)
    const users = await userRepo().find({ where: { id: In(ownerIds) }, select: ['id', 'identityId'] })
    const identities = await userIdentityRepository().find({ where: { id: In(users.map((user) => user.identityId)) } })
    const identityById = new Map(identities.map((identity) => [identity.id, identity]))
    return new Map(users.flatMap((user) => {
        const identity = identityById.get(user.identityId)
        if (isNil(identity)) {
            return []
        }
        const contact = identityContact.of(identity)
        return [[user.id, { name: identityContact.fullName(identity), contact: contact.length > 0 ? contact : null }] as const]
    }))
}

function toCountMap({ rows }: { rows: CountRow[] }): Map<string, number> {
    return new Map(rows.map((row) => [row.tenantId, Number(row.total)]))
}

const DEFAULT_PAGE_SIZE = 20

export type OwnerInfo = {
    name: string
    contact: string | null
}

type CountRow = {
    tenantId: string
    total: number
}

type TenantIdsParams = {
    tenantIds: string[]
}

type TenantParams = {
    tenantId: TenantId
}

type CreateParams = {
    request: OperatorCreateTenantRequestBody
}
