import { ApId, apId, assertNotNullOrUndefined, ErrorCode, isNil, Metadata, PlatformError, spreadIfDefined, spreadIfNotUndefined, UserId, WorkspaceId } from '@fema/core-utils'
import { ColorName, Workspace, WorkspaceIcon, WorkspaceType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { Brackets, EntityManager, IsNull, Not, ObjectLiteral, SelectQueryBuilder } from 'typeorm'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { userService } from '../user/user-service'
import { workspaceHooks, WorkspacePostCreateContext } from './workspace-hooks'
import { workspaceRepo } from './workspace-repo'
import { workspaceWorkerGroupService } from './workspace-worker-group.service'

export { workspaceRepo }

export const workspaceService = (log: FastifyBaseLogger) => ({
    async create(params: CreateParams): Promise<Workspace> {
        const { callPostCreateHooks = true, entityManager, postCreateContext, ...rest } = params
        const icon = this.createWorkspaceIcon()
        const newWorkspace: NewWorkspace = {
            id: apId(),
            ...rest,
            icon,
            releasesEnabled: false,
            notifyFlowOwnerOnFailure: false,
        }
        const savedWorkspace = await workspaceRepo(entityManager).save(newWorkspace)
        if (callPostCreateHooks) {
            await this.callWorkspacePostCreateHooks(savedWorkspace, postCreateContext)
        }
        return savedWorkspace
    },
    async getOneByOwnerAndPlatform(params: GetOneByOwnerAndPlatformParams): Promise<Workspace | null> {
        return workspaceRepo().findOneBy({
            ownerId: params.ownerId,
            platformId: params.platformId,
        })
    },

    async getOne(workspaceId: WorkspaceId | undefined): Promise<Workspace | null> {
        if (isNil(workspaceId)) {
            return null
        }

        return workspaceRepo().findOneBy({
            id: workspaceId,
        })
    },

    async getWorkspaceIdsByPlatform(platformId: string): Promise<string[]> {
        const workspaces = await workspaceRepo()
            .createQueryBuilder('workspace')
            .select('workspace.id')
            .where({ platformId })
            .orderBy('workspace.type', 'ASC')
            .addOrderBy('workspace.displayName', 'ASC')
            .addOrderBy('workspace.id', 'ASC')
            .getMany()

        return workspaces.map((workspace) => workspace.id)
    },

    async countByPlatformIdAndType(platformId: string, type: WorkspaceType): Promise<number> {
        return workspaceRepo().countBy({
            platformId,
            type,
        })
    },

    async update(workspaceId: WorkspaceId, request: UpdateParams, entityManager?: EntityManager): Promise<Workspace> {
        const externalId = request.externalId?.trim() !== '' ? request.externalId : undefined
        await assertExternalIdIsUnique(externalId, workspaceId)
        assertRetentionDaysWithinInstanceBounds(request.executionDataRetentionDays)

        const baseUpdate = {
            ...spreadIfDefined('externalId', externalId),
            ...spreadIfDefined('releasesEnabled', request.releasesEnabled),
            ...spreadIfDefined('notifyFlowOwnerOnFailure', request.notifyFlowOwnerOnFailure),
            ...spreadIfDefined('metadata', request.metadata),
            ...(request.poolId !== undefined ? { poolId: request.poolId } : {}),
            ...(request.maxConcurrentJobs !== undefined ? { maxConcurrentJobs: request.maxConcurrentJobs } : {}),
            ...(request.workerGroupId !== undefined ? { workerGroupId: request.workerGroupId } : {}),
            ...spreadIfNotUndefined('executionDataRetentionDays', request.executionDataRetentionDays),
        }

        const teamUpdate = request.type === WorkspaceType.TEAM ? {
            ...spreadIfDefined('displayName', request.displayName),
            ...spreadIfDefined('icon', request.icon),
        } : {}

        await workspaceRepo(entityManager).update({ id: workspaceId }, { ...baseUpdate, ...teamUpdate })
        if (request.workerGroupId !== undefined) {
            await workspaceWorkerGroupService(log).invalidate({ workspaceId })
        }
        return this.getOneOrThrow(workspaceId)
    },

    async getPlatformId(workspaceId: WorkspaceId): Promise<string> {
        const result = await workspaceRepo().createQueryBuilder('workspace').withDeleted().select('"platformId"').where({
            id: workspaceId,
        }).getRawOne()
        const platformId = result?.platformId
        if (isNil(platformId)) {
            throw new Error(`Platform ID for workspace ${workspaceId} is undefined in webhook.`)
        }
        return platformId
    },
    async getOneOrThrow(workspaceId: WorkspaceId): Promise<Workspace> {
        const workspace = await this.getOne(workspaceId)

        if (isNil(workspace)) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: workspaceId,
                    entityType: 'workspace',
                },
            })
        }

        return workspace
    },
    async exists({ workspaceId, isSoftDeleted }: ExistsParams): Promise<boolean> {
        const workspace = await workspaceRepo().findOne({
            where: {
                id: workspaceId,
                deleted: isSoftDeleted ? Not(IsNull()) : IsNull(),
            },
            withDeleted: true,
        })
        return !isNil(workspace)
    },
    async getUserWorkspaceOrThrow(userId: UserId): Promise<Workspace> {
        const user = await userService(log).getOneOrFail({ id: userId })
        assertNotNullOrUndefined(user.platformId, 'platformId is undefined')
        const workspaces = await this.getAllForUser({
            platformId: user.platformId,
            userId,
            isPrivileged: userService(log).isUserPrivileged(user),
        })
        if (isNil(workspaces) || workspaces.length === 0) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: userId,
                    entityType: 'user',
                },
            })
        }
        return workspaces.find((p) => p.ownerId === userId && p.type === WorkspaceType.PERSONAL) ?? workspaces[0]
    },

    async getAllForUser(params: GetAllForUserParams): Promise<Workspace[]> {
        assertNotNullOrUndefined(params.platformId, 'platformId is undefined')

        const queryBuilder = workspaceRepo()
            .createQueryBuilder('workspace')
            .where('workspace."platformId" = :platformId', { platformId: params.platformId })
            .andWhere('workspace.deleted IS NULL')
            .orderBy('workspace.type', 'ASC')
            .addOrderBy('workspace.displayName', 'ASC')
            .addOrderBy('workspace.id', 'ASC')

        if (params.displayName) {
            queryBuilder.andWhere('workspace."displayName" ILIKE :displayName', { displayName: `%${params.displayName}%` })
        }

        await applyWorkspacesAccessFilters(queryBuilder, params)

        return queryBuilder.getMany()
    },
    async userHasWorkspaces(params: GetAllForUserParams): Promise<boolean> {
        assertNotNullOrUndefined(params.platformId, 'platformId is undefined')

        const queryBuilder = workspaceRepo()
            .createQueryBuilder('workspace')
            .where('workspace."platformId" = :platformId', { platformId: params.platformId })

        await applyWorkspacesAccessFilters(queryBuilder, params)

        return queryBuilder.getExists()
    },
    async addWorkspaceToPlatform({ workspaceId, platformId }: AddWorkspaceToPlatformParams): Promise<void> {
        const query = {
            id: workspaceId,
        }

        const update = {
            platformId,
        }

        await workspaceRepo().update(query, update)
    },

    async getByPlatformIdAndExternalId({
        platformId,
        externalId,
    }: GetByPlatformIdAndExternalIdParams): Promise<Workspace | null> {
        return workspaceRepo().findOneBy({
            platformId,
            externalId,
        })
    },
    createWorkspaceIcon: ()=>{
        const colors = Object.values(ColorName)
        const icon: WorkspaceIcon = {
            color: colors[Math.floor(Math.random() * colors.length)],
        }
        return icon
    },
    callWorkspacePostCreateHooks: async (savedWorkspace: Workspace, context?: WorkspacePostCreateContext)=>{
        await workspaceHooks.get(log).postCreate(savedWorkspace, context)
    },
})


export async function applyWorkspacesAccessFilters<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    params: ApplyWorkspacesAccessFiltersParams,
): Promise<void> {
    const { platformId, userId, isPrivileged } = params
    if (isPrivileged) {
        return
    }

    queryBuilder.andWhere(new Brackets(qb => {
        qb.where(
            'workspace."ownerId" = :userId AND workspace.type = :personalType',
            { userId, personalType: WorkspaceType.PERSONAL },
        ).orWhere(
            'workspace.id IN (SELECT "workspaceId" FROM workspace_member WHERE "userId" = :userId AND "platformId" = :platformId)',
            { userId, platformId },
        )
    }))
}
async function assertExternalIdIsUnique(externalId: string | undefined | null, workspaceId: WorkspaceId): Promise<void> {
    if (!isNil(externalId)) {
        const externalIdAlreadyExists = await workspaceRepo().existsBy({
            id: Not(workspaceId),
            externalId,
        })

        if (externalIdAlreadyExists) {
            throw new PlatformError({
                code: ErrorCode.WORKSPACE_EXTERNAL_ID_ALREADY_EXISTS,
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
    const pausedFlowTimeoutDays = system.getNumberOrThrow(AppSystemProp.PAUSED_FLOW_TIMEOUT_DAYS)
    if (executionDataRetentionDays < pausedFlowTimeoutDays || executionDataRetentionDays > instanceRetentionDays) {
        throw new PlatformError({
            code: ErrorCode.VALIDATION,
            params: {
                message: `executionDataRetentionDays must be between FEMA_PAUSED_FLOW_TIMEOUT_DAYS (${pausedFlowTimeoutDays}) and FEMA_EXECUTION_DATA_RETENTION_DAYS (${instanceRetentionDays})`,
            },
        })
    }
}

type GetAllForUserParams = {
    platformId: string
    userId: string
    isPrivileged: boolean
    displayName?: string
}

type GetOneByOwnerAndPlatformParams = {
    ownerId: UserId
    platformId: string
}

type ExistsParams = {
    workspaceId: WorkspaceId
    isSoftDeleted?: boolean
}

type UpdateTeamWorkspaceParams = {
    type: WorkspaceType.TEAM
    displayName?: string
    externalId?: string
    releasesEnabled?: boolean
    notifyFlowOwnerOnFailure?: boolean
    metadata?: Metadata
    poolId?: string | null
    maxConcurrentJobs?: number | null
    workerGroupId?: string | null
    executionDataRetentionDays?: number | null
    icon?: WorkspaceIcon
}

type UpdatePersonalWorkspaceParams = {
    type: WorkspaceType.PERSONAL
    externalId?: string
    releasesEnabled?: boolean
    notifyFlowOwnerOnFailure?: boolean
    metadata?: Metadata
    poolId?: string | null
    maxConcurrentJobs?: number | null
    workerGroupId?: string | null
    executionDataRetentionDays?: number | null
}

type UpdateParams = UpdateTeamWorkspaceParams | UpdatePersonalWorkspaceParams

type CreateParams = {
    ownerId: UserId
    displayName: string
    type: WorkspaceType
    platformId: string
    externalId?: string
    metadata?: Metadata
    maxConcurrentJobs?: number
    callPostCreateHooks?: boolean
    postCreateContext?: WorkspacePostCreateContext
    entityManager?: EntityManager
}

type GetByPlatformIdAndExternalIdParams = {
    platformId: string
    externalId: string
}

type AddWorkspaceToPlatformParams = {
    workspaceId: WorkspaceId
    platformId: ApId
}

type NewWorkspace = Omit<Workspace, 'created' | 'updated' | 'deleted'>

type ApplyWorkspacesAccessFiltersParams = {
    platformId: string
    userId: string
    isPrivileged: boolean
}
