import { ApId, apId, Cursor, ErrorCode, isNil, Metadata, PlatformError, PlatformId, SeekPage, spreadIfDefined, UserId, WorkspaceId } from '@fema/core-utils'
import { ConnectionOwners, User, UserIdentity, UserWithMetaInformation, Variable, VariableWithoutSensitiveData } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { Equal, ILike, QueryFailedError } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { encryptUtils } from '../helper/encryption'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { VariableEntity, VariableSchema } from './variable.entity'

export const variableRepo = repoFactory(VariableEntity)

export const variableService = (log: FastifyBaseLogger) => ({
    async create(params: CreateParams): Promise<VariableWithoutSensitiveData> {
        const { workspaceId, platformId, name, value, ownerId, metadata } = params
        const id = apId()
        try {
            await variableRepo().insert({
                id,
                workspaceId,
                platformId,
                name,
                ownerId: ownerId ?? null,
                value: await encryptUtils.encryptObject({ secret_text: value }),
                ...spreadIfDefined('metadata', metadata),
            })
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                throw new PlatformError({
                    code: ErrorCode.VALIDATION,
                    params: { message: 'Variable name already used' },
                })
            }
            throw error
        }
        log.info({ id, workspace: { id: workspaceId }, name }, 'Variable created')
        return getOneOrThrowWithoutValue({ id, workspaceId, platformId })
    },

    async update(params: UpdateParams): Promise<VariableWithoutSensitiveData> {
        const { id, workspaceId, platformId, value, metadata } = params
        await getOneOrThrowWithoutValue({ id, workspaceId, platformId })
        await variableRepo().update({ id, workspaceId, platformId }, {
            ...(isNil(value) ? {} : { value: await encryptUtils.encryptObject({ secret_text: value }) }),
            ...spreadIfDefined('metadata', metadata),
        })
        log.info({ id, workspace: { id: workspaceId } }, 'Variable updated')
        return getOneOrThrowWithoutValue({ id, workspaceId, platformId })
    },

    async list(params: ListParams): Promise<SeekPage<VariableWithoutSensitiveData>> {
        const { workspaceId, platformId, cursor, limit, name } = params
        const decodedCursor = paginationHelper.decodeCursor(cursor ?? null)
        const paginator = buildPaginator({
            entity: VariableEntity,
            query: {
                limit: limit ?? 10,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })

        const queryBuilder = variableRepo()
            .createQueryBuilder('variable')
            .leftJoinAndSelect('variable.owner', 'owner')
            .leftJoinAndSelect('owner.identity', 'owner_identity')
            .where({
                workspaceId: Equal(workspaceId),
                platformId: Equal(platformId),
                ...(isNil(name) ? {} : { name: ILike(`%${name}%`) }),
            })

        const { data, cursor: nextCursor } = await paginator.paginate(queryBuilder)
        const sanitized = data.map(stripSensitiveData)
        return paginationHelper.createPage<VariableWithoutSensitiveData>(sanitized, nextCursor)
    },

    async getOwners(params: { workspaceId: WorkspaceId, platformId: PlatformId }): Promise<ConnectionOwners[]> {
        const { workspaceId, platformId } = params
        return variableRepo()
            .createQueryBuilder('variable')
            .innerJoin('variable.owner', 'owner')
            .innerJoin('owner.identity', 'owner_identity')
            .select('owner_identity.firstName', 'firstName')
            .addSelect('owner_identity.lastName', 'lastName')
            .addSelect('owner_identity.email', 'email')
            .where('variable.workspaceId = :workspaceId', { workspaceId })
            .andWhere('variable.platformId = :platformId', { platformId })
            .distinct(true)
            .limit(MAX_VARIABLE_OWNERS)
            .getRawMany<ConnectionOwners>()
    },

    async getOneOrThrowWithoutValue(params: GetOneParams): Promise<VariableWithoutSensitiveData> {
        return getOneOrThrowWithoutValue(params)
    },

    async getDecryptedValue(params: GetOneParams): Promise<string> {
        const { id, workspaceId, platformId } = params
        const row = await variableRepo().findOneBy({ id, workspaceId, platformId })
        if (isNil(row)) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: id,
                    entityType: 'Variable',
                },
            })
        }
        const decrypted = await encryptUtils.decryptObject<{ secret_text: string }>(row.value)
        return decrypted.secret_text
    },

    async getDecryptedValueForWorker(params: GetForWorkerParams): Promise<string> {
        const { workspaceId, name } = params
        const row = await variableRepo().findOneBy({ workspaceId, name })
        if (isNil(row)) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: `name=${name}`,
                    entityType: 'Variable',
                },
            })
        }
        const decrypted = await encryptUtils.decryptObject<{ secret_text: string }>(row.value)
        return decrypted.secret_text
    },

    async delete(params: GetOneParams): Promise<VariableWithoutSensitiveData> {
        const target = await getOneOrThrowWithoutValue(params)
        await variableRepo().delete({ id: params.id, workspaceId: params.workspaceId, platformId: params.platformId })
        log.info({ id: params.id, workspace: { id: params.workspaceId } }, 'Variable deleted')
        return target
    },
})

async function getOneOrThrowWithoutValue(params: GetOneParams): Promise<VariableWithoutSensitiveData> {
    const { id, workspaceId, platformId } = params
    const row = await variableRepo()
        .createQueryBuilder('variable')
        .leftJoinAndSelect('variable.owner', 'owner')
        .leftJoinAndSelect('owner.identity', 'owner_identity')
        .where({ id, workspaceId, platformId })
        .getOne()
    if (isNil(row)) {
        throw new PlatformError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityId: id,
                entityType: 'Variable',
            },
        })
    }
    return stripSensitiveData(row)
}

const POSTGRES_UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
        return false
    }
    const driverError: unknown = error.driverError
    return (
        typeof driverError === 'object' &&
        driverError !== null &&
        'code' in driverError &&
        driverError.code === POSTGRES_UNIQUE_VIOLATION
    )
}

function stripSensitiveData(row: VariableSchema): VariableWithoutSensitiveData {
    return {
        id: row.id,
        created: row.created,
        updated: row.updated,
        name: row.name,
        workspaceId: row.workspaceId,
        platformId: row.platformId,
        ownerId: row.ownerId,
        owner: mapToUserWithMetaInformation(row.owner ?? null),
        metadata: row.metadata,
    }
}

const MAX_VARIABLE_OWNERS = 200

function mapToUserWithMetaInformation(owner: (User & { identity?: UserIdentity }) | null): UserWithMetaInformation | null {
    if (isNil(owner)) {
        return null
    }
    const identity = owner.identity
    if (isNil(identity)) {
        return null
    }
    return {
        id: owner.id,
        email: identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName,
        platformId: owner.platformId,
        platformRole: owner.platformRole,
        status: owner.status,
        externalId: owner.externalId,
        created: owner.created,
        updated: owner.updated,
    }
}

type CreateParams = {
    workspaceId: string
    platformId: string
    name: string
    value: string
    ownerId: UserId | null
    metadata: Metadata | undefined
}

type UpdateParams = {
    id: ApId
    workspaceId: string
    platformId: string
    value: string | undefined
    metadata: Metadata | undefined
}

type GetOneParams = {
    id: ApId
    workspaceId: string
    platformId: string
}

type GetForWorkerParams = {
    workspaceId: string
    name: string
}

type ListParams = {
    workspaceId: string
    platformId: string
    cursor: Cursor | undefined
    limit: number | undefined
    name: string | undefined
}

export type { Variable }
