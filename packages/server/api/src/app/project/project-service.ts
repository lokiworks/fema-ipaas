import { ApplicationError, assertNotNullOrUndefined, EntityId, ErrorCode, generateId, isNil, Metadata, ProjectId, spreadIfDefined, spreadIfNotUndefined, UserId } from '@fema-ipaas/core-utils'
import { ColorName, Project, ProjectIcon, ProjectType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { Brackets, EntityManager, IsNull, Not, ObjectLiteral, SelectQueryBuilder } from 'typeorm'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { userService } from '../user/user-service'
import { projectHooks, ProjectPostCreateContext } from './project-hooks'
import { projectRepo } from './project-repo'
import { projectWorkerGroupService } from './project-worker-group.service'

export { projectRepo }

export const projectService = (log: FastifyBaseLogger) => ({
    async create(params: CreateParams): Promise<Project> {
        const { callPostCreateHooks = true, entityManager, postCreateContext, ...rest } = params
        const icon = this.createProjectIcon()
        const newProject: NewProject = {
            id: generateId(),
            ...rest,
            icon,
            releasesEnabled: false,
            notifyWorkflowOwnerOnFailure: false,
        }
        const savedProject = await projectRepo(entityManager).save(newProject)
        if (callPostCreateHooks) {
            await this.callProjectPostCreateHooks(savedProject, postCreateContext)
        }
        return savedProject
    },
    async getOneByOwnerAndTenant(params: GetOneByOwnerAndTenantParams): Promise<Project | null> {
        return projectRepo().findOneBy({
            ownerId: params.ownerId,
            tenantId: params.tenantId,
        })
    },

    async getOne(projectId: ProjectId | undefined): Promise<Project | null> {
        if (isNil(projectId)) {
            return null
        }

        return projectRepo().findOneBy({
            id: projectId,
        })
    },

    async getProjectIdsByTenant(tenantId: string): Promise<string[]> {
        const projects = await projectRepo()
            .createQueryBuilder('project')
            .select('project.id')
            .where({ tenantId })
            .orderBy('project.type', 'ASC')
            .addOrderBy('project.displayName', 'ASC')
            .addOrderBy('project.id', 'ASC')
            .getMany()

        return projects.map((project) => project.id)
    },

    async countByTenantIdAndType(tenantId: string, type: ProjectType): Promise<number> {
        return projectRepo().countBy({
            tenantId,
            type,
        })
    },

    async update(projectId: ProjectId, request: UpdateParams, entityManager?: EntityManager): Promise<Project> {
        const externalId = request.externalId?.trim() !== '' ? request.externalId : undefined
        await assertExternalIdIsUnique(externalId, projectId)
        assertRetentionDaysWithinInstanceBounds(request.executionDataRetentionDays)

        const baseUpdate = {
            ...spreadIfDefined('externalId', externalId),
            ...spreadIfDefined('releasesEnabled', request.releasesEnabled),
            ...spreadIfDefined('notifyWorkflowOwnerOnFailure', request.notifyWorkflowOwnerOnFailure),
            ...spreadIfDefined('metadata', request.metadata),
            ...(request.poolId !== undefined ? { poolId: request.poolId } : {}),
            ...(request.maxConcurrentJobs !== undefined ? { maxConcurrentJobs: request.maxConcurrentJobs } : {}),
            ...(request.workerGroupId !== undefined ? { workerGroupId: request.workerGroupId } : {}),
            ...spreadIfNotUndefined('executionDataRetentionDays', request.executionDataRetentionDays),
        }

        const teamUpdate = request.type === ProjectType.TEAM ? {
            ...spreadIfDefined('displayName', request.displayName),
            ...spreadIfDefined('icon', request.icon),
        } : {}

        await projectRepo(entityManager).update({ id: projectId }, { ...baseUpdate, ...teamUpdate })
        if (request.workerGroupId !== undefined) {
            await projectWorkerGroupService(log).invalidate({ projectId })
        }
        return this.getOneOrThrow(projectId)
    },

    async getTenantId(projectId: ProjectId): Promise<string> {
        const result = await projectRepo().createQueryBuilder('project').withDeleted().select('"tenantId"').where({
            id: projectId,
        }).getRawOne()
        const tenantId = result?.tenantId
        if (isNil(tenantId)) {
            throw new Error(`Tenant ID for project ${projectId} is undefined in webhook.`)
        }
        return tenantId
    },
    async getOneOrThrow(projectId: ProjectId): Promise<Project> {
        const project = await this.getOne(projectId)

        if (isNil(project)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: projectId,
                    entityType: 'project',
                },
            })
        }

        return project
    },
    async exists({ projectId, isSoftDeleted }: ExistsParams): Promise<boolean> {
        const project = await projectRepo().findOne({
            where: {
                id: projectId,
                deleted: isSoftDeleted ? Not(IsNull()) : IsNull(),
            },
            withDeleted: true,
        })
        return !isNil(project)
    },
    async getUserProjectOrThrow(userId: UserId): Promise<Project> {
        const user = await userService(log).getOneOrFail({ id: userId })
        assertNotNullOrUndefined(user.tenantId, 'tenantId is undefined')
        const projects = await this.getAllForUser({
            tenantId: user.tenantId,
            userId,
            isPrivileged: userService(log).isUserPrivileged(user),
        })
        if (isNil(projects) || projects.length === 0) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: userId,
                    entityType: 'user',
                },
            })
        }
        return projects.find((p) => p.ownerId === userId && p.type === ProjectType.PERSONAL) ?? projects[0]
    },

    async getAllForUser(params: GetAllForUserParams): Promise<Project[]> {
        assertNotNullOrUndefined(params.tenantId, 'tenantId is undefined')

        const queryBuilder = projectRepo()
            .createQueryBuilder('project')
            .where('project."tenantId" = :tenantId', { tenantId: params.tenantId })
            .andWhere('project.deleted IS NULL')
            .orderBy('project.type', 'ASC')
            .addOrderBy('project.displayName', 'ASC')
            .addOrderBy('project.id', 'ASC')

        if (params.displayName) {
            queryBuilder.andWhere('project."displayName" ILIKE :displayName', { displayName: `%${params.displayName}%` })
        }

        await applyProjectsAccessFilters(queryBuilder, params)

        return queryBuilder.getMany()
    },
    async userHasProjects(params: GetAllForUserParams): Promise<boolean> {
        assertNotNullOrUndefined(params.tenantId, 'tenantId is undefined')

        const queryBuilder = projectRepo()
            .createQueryBuilder('project')
            .where('project."tenantId" = :tenantId', { tenantId: params.tenantId })

        await applyProjectsAccessFilters(queryBuilder, params)

        return queryBuilder.getExists()
    },
    async addProjectToTenant({ projectId, tenantId }: AddProjectToTenantParams): Promise<void> {
        const query = {
            id: projectId,
        }

        const update = {
            tenantId,
        }

        await projectRepo().update(query, update)
    },

    async getByTenantIdAndExternalId({
        tenantId,
        externalId,
    }: GetByTenantIdAndExternalIdParams): Promise<Project | null> {
        return projectRepo().findOneBy({
            tenantId,
            externalId,
        })
    },
    createProjectIcon: ()=>{
        const colors = Object.values(ColorName)
        const icon: ProjectIcon = {
            color: colors[Math.floor(Math.random() * colors.length)],
        }
        return icon
    },
    callProjectPostCreateHooks: async (savedProject: Project, context?: ProjectPostCreateContext)=>{
        await projectHooks.get(log).postCreate(savedProject, context)
    },
})


export async function applyProjectsAccessFilters<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    params: ApplyProjectsAccessFiltersParams,
): Promise<void> {
    const { tenantId, userId, isPrivileged } = params
    if (isPrivileged) {
        return
    }

    queryBuilder.andWhere(new Brackets(qb => {
        qb.where(
            'project."ownerId" = :userId AND project.type = :personalType',
            { userId, personalType: ProjectType.PERSONAL },
        ).orWhere(
            'project.id IN (SELECT "projectId" FROM project_member WHERE "userId" = :userId AND "tenantId" = :tenantId)',
            { userId, tenantId },
        )
    }))
}
async function assertExternalIdIsUnique(externalId: string | undefined | null, projectId: ProjectId): Promise<void> {
    if (!isNil(externalId)) {
        const externalIdAlreadyExists = await projectRepo().existsBy({
            id: Not(projectId),
            externalId,
        })

        if (externalIdAlreadyExists) {
            throw new ApplicationError({
                code: ErrorCode.PROJECT_EXTERNAL_ID_ALREADY_EXISTS,
                params: {
                    externalId,
                },
            })
        }
    }
}

function assertRetentionDaysWithinInstanceBounds(executionDataRetentionDays: number | null | undefined): void {
    if (isNil(executionDataRetentionDays)) {
        return
    }
    const instanceRetentionDays = system.getNumberOrThrow(AppSystemProp.EXECUTION_DATA_RETENTION_DAYS)
    const pausedWorkflowTimeoutDays = system.getNumberOrThrow(AppSystemProp.PAUSED_WORKFLOW_TIMEOUT_DAYS)
    if (executionDataRetentionDays < pausedWorkflowTimeoutDays || executionDataRetentionDays > instanceRetentionDays) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: {
                message: `executionDataRetentionDays must be between FEMA_PAUSED_WORKFLOW_TIMEOUT_DAYS (${pausedWorkflowTimeoutDays}) and FEMA_EXECUTION_DATA_RETENTION_DAYS (${instanceRetentionDays})`,
            },
        })
    }
}

type GetAllForUserParams = {
    tenantId: string
    userId: string
    isPrivileged: boolean
    displayName?: string
}

type GetOneByOwnerAndTenantParams = {
    ownerId: UserId
    tenantId: string
}

type ExistsParams = {
    projectId: ProjectId
    isSoftDeleted?: boolean
}

type UpdateTeamProjectParams = {
    type: ProjectType.TEAM
    displayName?: string
    externalId?: string
    releasesEnabled?: boolean
    notifyWorkflowOwnerOnFailure?: boolean
    metadata?: Metadata
    poolId?: string | null
    maxConcurrentJobs?: number | null
    workerGroupId?: string | null
    executionDataRetentionDays?: number | null
    icon?: ProjectIcon
}

type UpdatePersonalProjectParams = {
    type: ProjectType.PERSONAL
    externalId?: string
    releasesEnabled?: boolean
    notifyWorkflowOwnerOnFailure?: boolean
    metadata?: Metadata
    poolId?: string | null
    maxConcurrentJobs?: number | null
    workerGroupId?: string | null
    executionDataRetentionDays?: number | null
}

type UpdateParams = UpdateTeamProjectParams | UpdatePersonalProjectParams

type CreateParams = {
    ownerId: UserId
    displayName: string
    type: ProjectType
    tenantId: string
    externalId?: string
    metadata?: Metadata
    maxConcurrentJobs?: number
    callPostCreateHooks?: boolean
    postCreateContext?: ProjectPostCreateContext
    entityManager?: EntityManager
}

type GetByTenantIdAndExternalIdParams = {
    tenantId: string
    externalId: string
}

type AddProjectToTenantParams = {
    projectId: ProjectId
    tenantId: EntityId
}

type NewProject = Omit<Project, 'created' | 'updated' | 'deleted'>

type ApplyProjectsAccessFiltersParams = {
    tenantId: string
    userId: string
    isPrivileged: boolean
}
