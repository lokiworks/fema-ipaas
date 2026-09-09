import { ApplicationError, assertNotNullOrUndefined, Cursor, ErrorCode, generateId, isNil, ProjectId, SeekPage, spreadIfDefined, TenantId, UserId } from '@fema-ipaas/core-utils'
import { ProjectType, TenantRole, User, UserIdentity, UserStatus, UserWithMetaInformation } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { nanoid } from 'nanoid'
import { EntityManager, In, IsNull } from 'typeorm'
import { signupNames } from '../authentication/lib/signup-names'
import { userIdentityRepository, userIdentityService } from '../authentication/user-identity/user-identity-service'
import { repoFactory } from '../core/db/repo-factory'
import { transaction } from '../core/db/transaction'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { projectService } from '../project/project-service'
import { projectSideEffects } from '../project/project-side-effects'
import { tenantService } from '../tenant/tenant.service'
import { UserEntity, UserSchema } from './user-entity'


export const userRepo = repoFactory(UserEntity)

export const userService = (log: FastifyBaseLogger) => ({
    async create(params: CreateParams): Promise<User> {
        const isActive = params.isActive ?? true
        const user: NewUser = {
            id: generateId(),
            identityId: params.identityId,
            tenantRole: params.tenantRole,
            status: isActive ? UserStatus.ACTIVE : UserStatus.INACTIVE,
            externalId: params.externalId,
            tenantId: params.tenantId,
        }
        return userRepo().save(user)
    },
    async getOrCreateWithProject({ identity, tenantId }: GetOrCreateWithProjectParams): Promise<User> {
        const user = await this.getOneByIdentityAndTenant({
            identityId: identity.id,
            tenantId,
        })
        if (isNil(user)) {
            const newUser = await this.create({
                identityId: identity.id,
                tenantId,
                tenantRole: TenantRole.MEMBER,
            })

            await projectService(log).create({
                displayName: signupNames.personalProjectName({ ownerName: identity.firstName }),
                ownerId: newUser.id,
                tenantId,
                type: ProjectType.PERSONAL,
            })
            return newUser
        }
        return user
    },
    async updateLastActiveDate({ id }: UpdateLastActiveDateParams): Promise<void> {
        await userRepo().update({ id }, { lastActiveDate: dayjs().toISOString() })
    },
    async update({ id, status, tenantId, tenantRole, externalId }: UpdateParams): Promise<UserWithMetaInformation> {
        const user = await this.getOrThrow({ id })
        assertNotNullOrUndefined(user.tenantId, 'tenantId')

        if (user.tenantId !== tenantId) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'user',
                    entityId: id,
                },
            })
        }

        const tenant = await tenantService(log).getOneOrThrow(user.tenantId)
        if (tenant.ownerId === user.id && status === UserStatus.INACTIVE) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'Admin cannot be deactivated',
                },
            })
        }

        const applyUpdate = (entityManager?: EntityManager): Promise<unknown> => userRepo(entityManager).update({
            id,
            tenantId,
        }, {
            ...spreadIfDefined('status', status),
            ...spreadIfDefined('tenantRole', tenantRole),
            ...spreadIfDefined('externalId', externalId),
        })

        await applyUpdate()

        return this.getMetaInformation({ id })
    },
    async getUsersByIdentityId({ identityId }: GetUsersByIdentityIdParams): Promise<Pick<User, 'id' | 'tenantId'>[]> {
        return userRepo().find({ where: { identityId } }).then((users) => users.map((user) => ({ id: user.id, tenantId: user.tenantId })))
    },
    async countByTenantId(tenantId: string): Promise<number> {
        return userRepo().countBy({ tenantId })
    },
    async countActiveByTenantId({ tenantId, entityManager }: CountActiveByTenantIdParams): Promise<number> {
        return userRepo(entityManager).countBy({ tenantId, status: UserStatus.ACTIVE })
    },
    async list({ tenantId, externalId, cursorRequest, limit }: ListParams): Promise<SeekPage<UserWithMetaInformation>> {
        const decodedCursor = paginationHelper.decodeCursor(cursorRequest)
        const paginator = buildPaginator({
            entity: UserEntity,
            query: {
                limit,
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const { data, cursor } = await paginator.paginate(userRepo().createQueryBuilder('user').where({
            tenantId,
            ...spreadIfDefined('externalId', externalId),
        }))

        const usersWithMetaInformation = await Promise.all(data.map(this.getMetaInformation))
        return paginationHelper.createPage<UserWithMetaInformation>(usersWithMetaInformation, cursor)
    },
    async getByIdentityId({ identityId }: GetByIdentityId): Promise<UserSchema[]> {
        return userRepo().find({ where: { identityId } })
    },
    async getOneByIdentityAndTenant({ identityId, tenantId }: GetOneByIdentityIdParams): Promise<User | null> {
        return userRepo().findOneBy({ identityId, tenantId: isNil(tenantId) ? IsNull() : tenantId })
    },
    async get({ id }: IdParams): Promise<User | null> {
        return userRepo().findOneBy({ id })
    },
    async getOrThrow({ id }: IdParams): Promise<User> {
        const user = await userRepo().findOneBy({ id })
        if (isNil(user)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'user', entityId: id },
            })
        }
        return user
    },
    async getOneOrFail({ id }: IdParams): Promise<User> {
        return userRepo().findOneOrFail({ where: { id } })
    },
    async getOneByIdAndTenantIdOrThrow({ id, tenantId }: GetOneByIdAndTenantIdParams): Promise<UserWithMetaInformation> {
        const user = await userRepo().findOne({ where: { id, tenantId } })
        if (isNil(user)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'user', entityId: id },
            })
        }
        return this.getMetaInformation({ id })
    },
    async delete({ id, tenantId }: DeleteParams): Promise<void> {
        await assertNotTenantOwner({ id, tenantId, log })
        const user = await userRepo().findOneBy({ id, tenantId })
        if (isNil(user)) {
            return
        }
        await projectSideEffects(log).deletePersonalProjectForUser({
            userId: id,
            tenantId,
        })
        await transaction(async (entityManager) => {
            await userRepo(entityManager).delete({
                id,
                tenantId,
            })
            await deleteIdentityIfOrphaned({ identityId: user.identityId, entityManager })
        })
    },
    async removeFromTenant({ id, tenantId }: DeleteParams): Promise<void> {
        await assertNotTenantOwner({ id, tenantId, log })
        const user = await this.getOneOrFail({ id })
        await projectSideEffects(log).deletePersonalProjectForUser({
            userId: id,
            tenantId,
        })
        await userRepo().update({
            id,
            tenantId,
        }, {
            tenantId: null,
        })
        await userIdentityRepository().update(user.identityId, {
            tokenVersion: nanoid(),
        })
        await userIdentityRepository().update({
            id: user.identityId,
            lastLoggedInTenantId: tenantId,
        }, {
            lastLoggedInTenantId: null,
        })
    },

    async getByTenantRole(id: TenantId, role: TenantRole): Promise<UserSchema[]> {
        return userRepo().find({ where: { tenantId: id, tenantRole: role }, relations: { identity: true } })
    },
    async listProjectUsers({ tenantId, projectId }: ListUsersForProjectParams): Promise<UserWithMetaInformation[]> {
        const users = await getUsersForProject(tenantId, projectId)
        const usersWithMetaInformation = await userRepo().find({ where: { tenantId, id: In(users) }, relations: { identity: true } }).then((users) => users.map(this.getMetaInformation))
        return Promise.all(usersWithMetaInformation)
    },
    async getByTenantAndExternalId({
        tenantId,
        externalId,
    }: GetByTenantAndExternalIdParams): Promise<User | null> {
        return userRepo().findOneBy({
            tenantId,
            externalId,
        })
    },
    async getMetaInformation({ id }: IdParams): Promise<UserWithMetaInformation> {
        const user = await userRepo().findOneByOrFail({ id })
        const identity = await userIdentityService(log).getBasicInformation(user.identityId)
        return {
            id: user.id,
            email: identity.email,
            firstName: identity.firstName,
            lastName: identity.lastName,
            tenantId: user.tenantId,
            tenantRole: user.tenantRole,
            status: user.status,
            externalId: user.externalId,
            created: user.created,
            updated: user.updated,
            lastActiveDate: user.lastActiveDate,
            imageUrl: identity.imageUrl,
        }
    },

    async addOwnerToTenant({
        id,
        tenantId,
    }: UpdateTenantIdParams): Promise<void> {
        await userRepo().update(id, {
            updated: dayjs().toISOString(),
            tenantRole: TenantRole.ADMIN,
            tenantId,
        })
    },

    isUserPrivileged(user: User): boolean {
        return user.tenantRole === TenantRole.ADMIN || user.tenantRole === TenantRole.OPERATOR
    },
})


async function assertNotTenantOwner({ id, tenantId, log }: DeleteParams & { log: FastifyBaseLogger }): Promise<void> {
    const tenant = await tenantService(log).getOneOrThrow(tenantId)
    if (tenant.ownerId === id) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: {
                message: 'Tenant owner cannot be deleted',
            },
        })
    }
}

async function deleteIdentityIfOrphaned({ identityId, entityManager }: { identityId: string, entityManager: EntityManager }): Promise<void> {
    const identityStillReferenced = await userRepo(entityManager).existsBy({ identityId })
    if (!identityStillReferenced) {
        await userIdentityRepository(entityManager).delete({ id: identityId })
    }
}

async function getUsersForProject(tenantId: TenantId, _projectId: string): Promise<UserId[]> {
    return userRepo().find({ where: { tenantId, tenantRole: TenantRole.ADMIN } }).then((users) => users.map((user) => user.id))
}

type UpdateLastActiveDateParams = {
    id: UserId
}

type GetOneByIdAndTenantIdParams = {
    id: UserId
    tenantId: TenantId
}
type ListUsersForProjectParams = {
    projectId: ProjectId
    tenantId: TenantId
}

type DeleteParams = {
    id: UserId
    tenantId: TenantId
}


type ListParams = {
    tenantId: TenantId
    externalId?: string
    cursorRequest: Cursor
    limit?: number
}

type GetByIdentityId = {
    identityId: string
}


type GetOneByIdentityIdParams = {
    identityId: string
    tenantId: TenantId | null
}

type UpdateParams = {
    id: UserId
    status?: UserStatus
    tenantId: TenantId
    tenantRole?: TenantRole
    externalId?: string
}

type CreateParams = {
    identityId: string
    tenantId: string | null
    externalId?: string
    tenantRole: TenantRole
    isActive?: boolean
}
type GetUsersByIdentityIdParams = {
    identityId: string
}

type CountActiveByTenantIdParams = {
    tenantId: string
    entityManager?: EntityManager
}

type NewUser = Omit<User, 'created' | 'updated'>

type GetByTenantAndExternalIdParams = {
    tenantId: string
    externalId: string
}

type IdParams = {
    id: UserId
}

type UpdateTenantIdParams = {
    id: UserId
    tenantId: string
}

type GetOrCreateWithProjectParams = {
    identity: UserIdentity
    tenantId: string
}
