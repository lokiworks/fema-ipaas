import { ConnectorMetadata } from '@fema/connector-sdk'
import { apId, Cursor, ErrorCode, isNil, Metadata, PlatformError, PlatformId, SeekPage, spreadIfDefined, tryCatch, tryCatchSync, unique, UserId, WorkspaceId } from '@fema/core-utils'
import { ApEnvironment, Connection, ConnectionId, ConnectionOwners, ConnectionScope, ConnectionStatus, ConnectionType, ConnectionValue, ConnectionWithoutSensitiveData, EngineResponse, EngineResponseStatus, ExecuteResolveConnectionIdentifierResponse, ExecuteValidateAuthResponse, MAX_PLATFORM_CONNECTION_OWNERS, OAuth2GrantType, PlatformConnectionOwner, PlatformConnectionOwnersResponse, PlatformConnectionsListItem, PlatformConnectionWorkspaceInfo, PlatformRole, UpsertConnectionRequestBody, User, UserIdentity, UserWithMetaInformation, WorkerJobType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import semver from 'semver'
import { ArrayContains, Equal, FindOperator, FindOptionsWhere, ILike, In } from 'typeorm'
import {
    connectorMetadataService,
    getConnectorPackageWithoutArchive,
} from '../../connectors/metadata/connector-metadata-service'
import { repoFactory } from '../../core/db/repo-factory'
import { flowService } from '../../flows/flow/flow.service'
import { encryptUtils } from '../../helper/encryption'
import { jwtUtils } from '../../helper/jwt-utils'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { userService } from '../../user/user-service'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { workspaceRepo } from '../../workspace/workspace-service'
import {
    ConnectionEntity,
    ConnectionSchema,
} from '../connection.entity'
import { mergeConnectionMetadata } from './connection-metadata'
import { connectionHandler } from './connection.handler'
import { oauth2Handler } from './oauth2'
import { oauth2Util } from './oauth2/oauth2-util'
export const connectionsRepo = repoFactory(ConnectionEntity)

export const connectionService = (log: FastifyBaseLogger) => ({
    async upsert(params: UpsertParams): Promise<ConnectionWithoutSensitiveData> {
        const { workspaceIds, externalId, value, displayName, connectorName, ownerId, platformId, scope, type, status, metadata, preSelectForNewWorkspaces } = params
        const connectorVersion = params.connectorVersion ?? ( await connectorMetadataService(log).getOrThrow({
            name: connectorName,
            platformId,
        })).version
        validateConnectorVersion(connectorVersion)
        await assertWorkspaceIds(workspaceIds, platformId)

        if (status === ConnectionStatus.MISSING) {
            const existingForPlaceholder = await connectionsRepo().findOneBy({
                externalId,
                scope,
                platformId,
                ...(workspaceIds ? { workspaceIds: ArrayContains(workspaceIds) } : {}),
            })
            if (!isNil(existingForPlaceholder) && existingForPlaceholder.status !== ConnectionStatus.MISSING) {
                log.info({ connection: { id: existingForPlaceholder.id }, connector: { name: connectorName }, platform: { id: platformId }, existingStatus: existingForPlaceholder.status }, 'Placeholder upsert skipped — non-missing connection already exists')
                return this.removeSensitiveData(existingForPlaceholder)
            }
        }

        const validatedConnectionValue = await validateConnectionValue({
            value,
            connectorName,
            connectorVersion,
            workspaceId: workspaceIds[0],
            platformId,
        }, log)

        const encryptedConnectionValue = await encryptUtils.encryptObject({
            ...validatedConnectionValue,
            ...value,
        })

        const existingConnection = await connectionsRepo().findOneBy({
            externalId,
            scope,
            platformId,
            ...(workspaceIds ? { workspaceIds: ArrayContains(workspaceIds) } : {}),
        })

        const accountIdentifier = await resolveConnectionAccountIdentifier({
            connectionType: type,
            auth: validatedConnectionValue,
            connectorName,
            workspaceId: workspaceIds[0],
            platformId,
            log,
        })
        const connectionMetadata = mergeConnectionMetadata({
            requestMetadata: metadata,
            existingMetadata: existingConnection?.metadata,
            accountIdentifier,
        })

        const newId = existingConnection?.id ?? apId()
        const connection = {
            displayName,
            ...spreadIfDefined('ownerId', ownerId),
            status: status ?? ConnectionStatus.ACTIVE,
            value: encryptedConnectionValue,
            externalId,
            connectorName,
            type,
            id: newId,
            scope,
            workspaceIds,
            platformId,
            ...spreadIfDefined('metadata', connectionMetadata),
            ...spreadIfDefined('preSelectForNewWorkspaces', preSelectForNewWorkspaces),
            connectorVersion,
        }

        await connectionsRepo().upsert(connection, ['id'])

        const updatedConnection = await connectionsRepo().findOneByOrFail({
            id: newId,
            platformId,
            ...(workspaceIds ? { workspaceIds: ArrayContains(workspaceIds) } : {}),
            scope,
        })
        log.info({ connection: { id: newId }, connector: { name: connectorName }, platform: { id: platformId }, isNew: isNil(existingConnection) }, 'App connection upserted')
        return this.removeSensitiveData(updatedConnection)
    },
    async update(params: UpdateParams): Promise<ConnectionWithoutSensitiveData> {
        const { workspaceIds, id, request, scope, platformId } = params

        if (!isNil(request.workspaceIds)) {
            await assertWorkspaceIds(request.workspaceIds, platformId)
        }

        const filter: FindOptionsWhere<ConnectionSchema> = {
            id,
            scope,
            platformId,
            ...(workspaceIds ? { workspaceIds: ArrayContains(workspaceIds) } : {}),
        }

        const storedMetadata = isNil(request.metadata)
            ? undefined
            : (await connectionsRepo().findOneByOrFail(filter)).metadata
        const storedAccountIdentifier = storedMetadata?.['accountIdentifier']

        await connectionsRepo().update(filter, {
            displayName: request.displayName,
            ...spreadIfDefined('workspaceIds', request.workspaceIds),
            ...(isNil(request.metadata) ? {} : spreadIfDefined('metadata', mergeConnectionMetadata({
                requestMetadata: request.metadata,
                existingMetadata: storedMetadata,
                accountIdentifier: typeof storedAccountIdentifier === 'string' ? storedAccountIdentifier : undefined,
            }))),
            ...spreadIfDefined('preSelectForNewWorkspaces', request.preSelectForNewWorkspaces),
        })

        const updatedConnection = await connectionsRepo().findOneByOrFail(filter)
        return this.removeSensitiveData(updatedConnection)
    },
    async getOne({
        workspaceId,
        platformId,
        externalId,
    }: GetOneByName): Promise<Connection | null> {
        const encryptedConnection = await connectionsRepo().findOne({
            where: {
                workspaceIds: ArrayContains([workspaceId]),
                externalId,
                platformId,
            },
        })

        if (isNil(encryptedConnection)) {
            return null
        }
        const connection = await this.decryptAndRefreshConnection(encryptedConnection, workspaceId, log)

        if (isNil(connection)) {
            return null
        }

        const owner = isNil(connection.ownerId) ? null : await userService(log).getMetaInformation({
            id: connection.ownerId,
        })
        return {
            ...connection,
            owner,
        }
    },

    async getOneWithoutValue({ workspaceId, platformId, externalId }: GetOneByName): Promise<ConnectionWithoutSensitiveData | null> {
        const connection = await connectionsRepo().findOneBy({
            workspaceIds: ArrayContains([workspaceId]),
            externalId,
            platformId,
        })
        return isNil(connection) ? null : this.removeSensitiveData(connection)
    },

    async getOneOrThrowWithoutValue(params: GetOneParams): Promise<ConnectionWithoutSensitiveData> {
        const connectionById = await connectionsRepo().findOneBy({
            id: params.id,
            platformId: params.platformId,
            ...(params.workspaceId ? { workspaceIds: ArrayContains([params.workspaceId]) } : {}),
        })
        if (isNil(connectionById)) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'Connection',
                    entityId: params.id,
                },
            })
        }
        return this.removeSensitiveData(connectionById)
    },

    async getOnePublicOrThrow(params: GetOneParams): Promise<ConnectionWithoutSensitiveData> {
        const connection = await this.getOneOrThrowWithoutValue(params)
        const flowIdsByExternalId = await fetchFlowIdsForConnections(log, [connection])
        return {
            ...connection,
            flowIds: flowIdsByExternalId.get(connection.externalId) ?? [],
        }
    },

    async revalidate({ id, workspaceId, platformId }: RevalidateParams): Promise<ConnectionWithoutSensitiveData> {
        const metadata = await this.getOneOrThrowWithoutValue({ id, workspaceId, platformId })
        const connection = await connectionHandler(log).revalidateConnection({
            id,
            platformId,
            workspaceId,
            externalId: metadata.externalId,
            validate: ({ connectorName, value }) => engineValidateAuth({ connectorName, workspaceId, platformId, auth: value }, log),
            log,
        })
        if (isNil(connection)) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'Connection', entityId: id },
            })
        }
        return this.removeSensitiveData(connection)
    },

    async replace(params: ReplaceParams): Promise<void> {
        const { sourceConnectionId, targetConnectionId, workspaceId, platformId, userId, deleteSourceConnection, applyToPublishedVersions } = params
        if (sourceConnectionId === targetConnectionId) {
            throw new PlatformError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'Cannot replace a connection with itself',
                },
            })
        }
        const sourceConnection = await this.getOneOrThrowWithoutValue({
            id: sourceConnectionId,
            workspaceId,
            platformId,
        })

        const targetConnection = await this.getOneOrThrowWithoutValue({
            id: targetConnectionId,
            workspaceId,
            platformId,
        })

        if (sourceConnection.connectorName !== targetConnection.connectorName) {
            throw new PlatformError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'Connections must be from the same app',
                },
            })
        }

        // Mirrors the workspace-route DELETE guard: platform connections are managed
        // from the platform admin page and must not be deletable through a
        // workspace-scoped replace, no matter which workspaces still use them.
        if (deleteSourceConnection && sourceConnection.scope === ConnectionScope.PLATFORM) {
            throw new PlatformError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'Platform connections must be deleted from the platform admin connections page',
                },
            })
        }

        // Reject up-front (before mutating any flow) when published versions this
        // replace won't touch still use the source connection. When
        // applyToPublishedVersions is set, that is only the published versions
        // invisible to the replace (their flow's latest version no longer
        // references the connection); updating those in place would overwrite
        // the newer draft, so the user has to publish or repoint them first.
        // Without it, a delete would orphan every published reference.
        const publishedFlowsUsingConnection = deleteSourceConnection || applyToPublishedVersions
            ? await connectionHandler(log).countPublishedFlowsReferencingConnection({ workspaceId, externalId: sourceConnection.externalId, applyToPublishedVersions })
            : 0
        if (publishedFlowsUsingConnection > 0) {
            throw new PlatformError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: deleteSourceConnection
                        ? 'Cannot delete the old connection because it is still used by published flows that were not updated'
                        : 'Some published flows still use the old connection but have unpublished draft changes — publish those flows first',
                },
            })
        }

        // Repoint page by page: each repointed flow drops out of the connection
        // filter, so re-fetching the first page walks the whole set without the
        // cursor skew of paginating rows that are being mutated. The seen-set
        // stops the loop if a flow fails to leave the filter (e.g. an auth
        // string the rewrite does not understand) instead of spinning forever.
        const repointedFlowIds = new Set<string>()
        for (;;) {
            const flowsPage = await flowService(log).list({
                workspaceIds: [workspaceId],
                cursorRequest: null,
                limit: 1000,
                folderId: undefined,
                name: undefined,
                status: undefined,
                connectionExternalIds: [sourceConnection.externalId],
            })
            const flowsToRepoint = flowsPage.data.filter((flow) => !repointedFlowIds.has(flow.id))
            if (flowsToRepoint.length === 0) {
                if (flowsPage.data.length > 0) {
                    log.warn({ oldConnectionId: sourceConnectionId, stuckFlowIds: flowsPage.data.map((flow) => flow.id) }, 'Replace could not rewrite some flow references; they keep the old connection')
                }
                break
            }
            await connectionHandler(log).updateFlowsWithConnection(flowsToRepoint, {
                connection: sourceConnection,
                newConnection: targetConnection,
                userId,
                applyToPublishedVersions,
            })
            flowsToRepoint.forEach((flow) => repointedFlowIds.add(flow.id))
        }

        log.info({ oldConnectionId: sourceConnectionId, newConnectionId: targetConnectionId, affectedFlows: repointedFlowIds.size, deleteSourceConnection, applyToPublishedVersions }, 'App connection replaced')

        if (!deleteSourceConnection) {
            return
        }

        // Final integrity gate before the irreversible delete: a flow whose
        // reference could not be rewritten or that was edited or published
        // concurrently may still use the connection, and deleting it would
        // orphan that flow. The list covers latest-version references; the
        // count covers published versions the list cannot see.
        const remainingFlows = await flowService(log).list({
            workspaceIds: [workspaceId],
            cursorRequest: null,
            limit: 1,
            folderId: undefined,
            name: undefined,
            status: undefined,
            connectionExternalIds: [sourceConnection.externalId],
        })
        const remainingPublishedFlows = remainingFlows.data.length > 0
            ? 0
            : await connectionHandler(log).countPublishedFlowsReferencingConnection({ workspaceId, externalId: sourceConnection.externalId, applyToPublishedVersions: false })
        if (remainingFlows.data.length > 0 || remainingPublishedFlows > 0) {
            throw new PlatformError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'Cannot delete the old connection because some flows still use it',
                },
            })
        }

        await this.delete({
            id: sourceConnection.id,
            platformId,
            scope: sourceConnection.scope,
            workspaceId,
        })
    },

    async delete(params: DeleteParams): Promise<void> {
        await connectionsRepo().delete({
            id: params.id,
            platformId: params.platformId,
            scope: params.scope,
            ...(params.workspaceId ? { workspaceIds: ArrayContains([params.workspaceId]) } : {}),
        })
        log.info({ connection: { id: params.id }, platform: { id: params.platformId } }, 'App connection deleted')
    },

    async list({
        workspaceId,
        workspaceIds,
        ownerIds,
        connectorName,
        cursorRequest,
        displayName,
        status,
        limit,
        scope,
        platformId,
        externalIds,
    }: ListParams): Promise<SeekPage<Connection>> {
        const decodedCursor = paginationHelper.decodeCursor(cursorRequest)
        const paginator = buildPaginator({
            entity: ConnectionEntity,
            query: {
                limit,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })

        const querySelector: Record<string, string | FindOperator<string>> = {
            ...(workspaceId ? { workspaceIds: ArrayContains([workspaceId]) } : {}),
            ...spreadIfDefined('scope', scope),
            platformId,
        }
        if (!isNil(connectorName)) {
            querySelector.connectorName = Equal(connectorName)
        }
        if (!isNil(displayName)) {
            querySelector.displayName = ILike(`%${displayName}%`)
        }
        if (!isNil(status)) {
            querySelector.status = In(status)
        }
        if (!isNil(externalIds)) {
            querySelector.externalId = In(externalIds)
        }
        if (!isNil(ownerIds) && ownerIds.length > 0) {
            querySelector.ownerId = In(ownerIds)
        }
        const queryBuilder = connectionsRepo()
            .createQueryBuilder('connection')
            .leftJoinAndSelect('connection.owner', 'owner')
            .leftJoinAndSelect('owner.identity', 'owner_identity')
            .where(querySelector)
        if (!isNil(workspaceIds) && workspaceIds.length > 0) {
            queryBuilder.andWhere('connection."workspaceIds" && :workspaceIds::varchar[]', { workspaceIds })
        }
        const { data, cursor } = await paginator.paginate(queryBuilder)

        const flowIdsByExternalId = await fetchFlowIdsForConnections(log, data)

        const promises = data.map(async (encryptedConnection) => {
            const apConnection: Connection = await connectionHandler(log).decryptConnection(encryptedConnection)
            const owner = mapToUserWithMetaInformation(encryptedConnection.owner)
            const flowIds = flowIdsByExternalId.get(apConnection.externalId) ?? []

            return {
                ...apConnection,
                owner,
                flowIds,
            }
        })
        const refreshConnections = await Promise.all(promises)

        return paginationHelper.createPage<Connection>(
            refreshConnections,
            cursor,
        )
    },
    removeSensitiveData: (
        connection: Connection | ConnectionSchema,
    ): ConnectionWithoutSensitiveData => {
        const { value: _value, ...connectionWithoutSensitiveData } = connection
        return connectionWithoutSensitiveData
    },

    async decryptAndRefreshConnection(
        encryptedConnection: ConnectionSchema,
        workspaceId: WorkspaceId,
        log: FastifyBaseLogger,
    ): Promise<Connection | null> {
        const connection = await connectionHandler(log).decryptConnection(encryptedConnection)
        if (!await connectionHandler(log).needRefresh(connection, log)) {
            return oauth2Util(log).removeRefreshTokenAndClientSecret(connection)
        }

        const refreshedConnection = await connectionHandler(log).lockAndRefreshConnection({ platformId: connection.platformId, workspaceId, externalId: connection.externalId, log })
        if (isNil(refreshedConnection)) {
            return null
        }
        return oauth2Util(log).removeRefreshTokenAndClientSecret(refreshedConnection)
    },
    async deleteAllWorkspaceConnections(workspaceId: string) {
        await connectionsRepo().delete({
            scope: ConnectionScope.WORKSPACE,
            workspaceIds: ArrayContains([workspaceId]),
        })
    },

    async getOwners({ workspaceId: _workspaceId, platformId }: { workspaceId: WorkspaceId, platformId: PlatformId }): Promise<ConnectionOwners[]> {
        const platformAdmins = (await userService(log).getByPlatformRole(platformId, PlatformRole.ADMIN)).map(user => ({
            firstName: user.identity.firstName,
            lastName: user.identity.lastName,
            email: user.identity.email,
        }))
        return platformAdmins
    },

    async listForPlatform(params: ListForPlatformParams): Promise<SeekPage<PlatformConnectionsListItem>> {
        const service = connectionService(log)
        const page = await service.list({
            connectorName: params.connectorName,
            displayName: params.displayName,
            status: params.status,
            scope: params.scope,
            platformId: params.platformId,
            workspaceId: null,
            workspaceIds: params.workspaceIds,
            ownerIds: params.ownerIds,
            cursorRequest: params.cursorRequest,
            limit: params.limit,
            externalIds: undefined,
        })

        const workspaceIdsToLookUp = unique(page.data.flatMap((connection) => connection.workspaceIds))
        const workspacesById = await fetchWorkspacesForPlatform(workspaceIdsToLookUp, params.platformId)

        const data: PlatformConnectionsListItem[] = page.data.map((connection) => {
            const sanitized = service.removeSensitiveData(connection)
            const workspaces: PlatformConnectionWorkspaceInfo[] = connection.workspaceIds
                .map((id) => workspacesById.get(id))
                .filter((workspace): workspace is PlatformConnectionWorkspaceInfo => workspace !== undefined)
            return { ...sanitized, workspaces }
        })

        return { ...page, data }
    },

    async listOwnersForPlatform({ platformId }: { platformId: PlatformId }): Promise<PlatformConnectionOwnersResponse> {
        const rows = await connectionsRepo()
            .createQueryBuilder('connection')
            .innerJoin('connection.owner', 'owner')
            .innerJoin('owner.identity', 'identity')
            .where('connection.platformId = :platformId', { platformId })
            .select('owner.id', 'id')
            .addSelect('identity.firstName', 'firstName')
            .addSelect('identity.lastName', 'lastName')
            .addSelect('identity.email', 'email')
            .distinct(true)
            .orderBy('identity.email', 'ASC')
            .limit(MAX_PLATFORM_CONNECTION_OWNERS + 1)
            .getRawMany<PlatformConnectionOwner>()

        const truncated = rows.length > MAX_PLATFORM_CONNECTION_OWNERS
        const data = truncated ? rows.slice(0, MAX_PLATFORM_CONNECTION_OWNERS) : rows
        return { data, truncated }
    },

})

const fetchWorkspacesForPlatform = async (workspaceIds: string[], platformId: string): Promise<Map<string, PlatformConnectionWorkspaceInfo>> => {
    if (workspaceIds.length === 0) {
        return new Map()
    }
    const workspaces = await workspaceRepo().find({
        where: { id: In(workspaceIds), platformId },
        select: ['id', 'displayName', 'type'],
    })
    return new Map(workspaces.map((workspace) => [workspace.id, { id: workspace.id, displayName: workspace.displayName, type: workspace.type }]))
}

async function assertWorkspaceIds(workspaceIds: WorkspaceId[], platformId: string): Promise<void> {
    const filteredWorkspaces = await workspaceRepo().countBy({
        id: In(workspaceIds),
        platformId,
    })
    if (filteredWorkspaces !== workspaceIds.length) {
        throw new PlatformError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityType: 'Workspace',
            },
        })
    }
}
// The generic path decodes the OIDC id_token / email claim from the token
// response — this covers every provider that returns one (Google, Microsoft, …).
// Anything provider-specific (Slack's workspace/user) lives in the connector's own
// getConnectionIdentifier hook, resolved via the engine. Best-effort — never
// throws, returns undefined on any miss.
const resolveConnectionAccountIdentifier = async ({
    connectionType,
    auth,
    connectorName,
    workspaceId,
    platformId,
    log,
}: {
    connectionType: ConnectionType
    auth: ConnectionValue
    connectorName: string
    workspaceId: WorkspaceId | undefined
    platformId: string
    log: FastifyBaseLogger
}): Promise<string | undefined> => {
    if (connectionType === ConnectionType.NO_AUTH) {
        return undefined
    }
    if (OAUTH_CONNECTION_TYPES.includes(connectionType)) {
        const emailFromToken = emailFromTokenResponse('data' in auth ? auth.data : undefined)
        if (!isNil(emailFromToken)) {
            return emailFromToken
        }
    }
    return engineResolveConnectionIdentifier({ connectorName, workspaceId, platformId, auth, connectionType }, log)
}

const OAUTH_CONNECTION_TYPES = [
    ConnectionType.OAUTH2,
    ConnectionType.CLOUD_OAUTH2,
    ConnectionType.PLATFORM_OAUTH2,
]

// OIDC providers expose the sign-in email under different claims: Google uses
// `email`; Microsoft/Azure AD usually put it in `preferred_username` (the UPN)
// or `upn`. Fall back to those, but only when they actually look like an email.
const pickEmailClaim = (claims: Record<string, unknown> | undefined): string | undefined => {
    if (isNil(claims)) {
        return undefined
    }
    const directEmail = claims['email'] ?? claims['mail']
    if (typeof directEmail === 'string' && directEmail.length > 0) {
        return directEmail
    }
    return ['preferred_username', 'upn', 'unique_name']
        .map((key) => claims[key])
        .find((value): value is string => typeof value === 'string' && value.includes('@'))
}

const emailFromTokenResponse = (data: Record<string, unknown> | undefined): string | undefined => {
    const emailFromData = pickEmailClaim(data)
    if (!isNil(emailFromData)) {
        return emailFromData
    }
    const idToken = data?.['id_token']
    if (typeof idToken !== 'string') {
        return undefined
    }
    const { data: decoded } = tryCatchSync(() => jwtUtils.decode<Record<string, unknown>>({ jwt: idToken }))
    return pickEmailClaim(decoded?.payload)
}

const validateConnectionValue = async (
    params: ValidateConnectionValueParams,
    log: FastifyBaseLogger,
): Promise<ConnectionValue> => {
    const { value, connectorName, connectorVersion, workspaceId, platformId } = params

    switch (value.type) {
        case ConnectionType.PLATFORM_OAUTH2: {
            const tokenUrl = await oauth2Util(log).getOAuth2TokenUrl({
                connectorName,
                connectorVersion,
                platformId,
                props: value.props,
            })
            return oauth2Handler[value.type](log).claim({
                workspaceId,
                platformId,
                connectorName,
                request: {
                    grantType: OAuth2GrantType.AUTHORIZATION_CODE,
                    code: value.code,
                    tokenUrl,
                    clientId: value.client_id,
                    props: value.props,
                    authorizationMethod: value.authorization_method,
                    codeVerifier: value.code_challenge,
                    redirectUrl: value.redirect_url,
                },
            })
        }
        case ConnectionType.CLOUD_OAUTH2: {
            const tokenUrl = await oauth2Util(log).getOAuth2TokenUrl({
                connectorName,
                connectorVersion,
                platformId,
                props: value.props,
            })
            return oauth2Handler[value.type](log).claim({
                workspaceId,
                platformId,
                connectorName,
                request: {
                    tokenUrl,
                    grantType: OAuth2GrantType.AUTHORIZATION_CODE,
                    code: value.code,
                    props: value.props,
                    clientId: value.client_id,
                    authorizationMethod: value.authorization_method,
                    codeVerifier: value.code_challenge,
                },
            })
        }
        case ConnectionType.OAUTH2: {
            const tokenUrl = await oauth2Util(log).getOAuth2TokenUrl({
                connectorName,
                connectorVersion,
                platformId,
                props: value.props,
            })
            
            const auth = await oauth2Handler[value.type](log).claim({
                workspaceId,
                platformId,
                connectorName,
                request: {
                    tokenUrl,
                    code: value.code,
                    clientId: value.client_id,
                    props: value.props,
                    grantType: value.grant_type!,
                    redirectUrl: value.redirect_url,
                    clientSecret: value.client_secret,
                    authorizationMethod: value.authorization_method,
                    codeVerifier: value.code_challenge,
                    scope: value.scope,
                },
            })
            await engineValidateAuth({
                connectorName,
                workspaceId,
                platformId,
                auth,
            }, log)
            return auth
        }
        case ConnectionType.NO_AUTH:
            break
        case ConnectionType.CUSTOM_AUTH:
        case ConnectionType.OIDC:
        case ConnectionType.BASIC_AUTH:
        case ConnectionType.SECRET_TEXT:
            await engineValidateAuth({
                platformId,
                connectorName,
                workspaceId,
                auth: value,
            }, log)
    }

    return value
}

const engineValidateAuth = async (
    params: EngineValidateAuthParams,
    log: FastifyBaseLogger,
): Promise<void> => {
    const environment = system.getOrThrow(AppSystemProp.ENVIRONMENT)
    if (environment === ApEnvironment.TESTING) {
        return
    }
    const { connectorName, auth, workspaceId, platformId } = params

    const connectorMetadata = await connectorMetadataService(log).getOrThrow({
        name: connectorName,
        version: undefined,
        platformId,
    })

    const engineResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteValidateAuthResponse>>({
        connector: await getConnectorPackageWithoutArchive(log, platformId, {
            connectorName,
            connectorVersion: connectorMetadata.version,
        }),
        workspaceId,
        platformId,
        connectionValue: auth,
        jobType: WorkerJobType.EXECUTE_VALIDATION,
    }, log)

    if (engineResponse.status !== EngineResponseStatus.OK) {
        log.error(
            { engineResponse },
            'Engine validate auth failed',
        )
        throw new PlatformError({
            code: ErrorCode.ENGINE_OPERATION_FAILURE,
            params: {
                message: 'Failed to run engine validate auth',
                context: engineResponse,
            },
        })
    }

    const validateAuthResult = engineResponse.response

    if (!validateAuthResult.valid) {
        throw new PlatformError({
            code: ErrorCode.INVALID_CONNECTION,
            params: {
                error: validateAuthResult.error,
            },
        })
    }
}

// The hook is a function, so it cannot survive metadata serialization — without
// the flag Connector.metadata() derives from it, every OAuth connect would pay a
// sandbox round-trip to ask a connector that has nothing to answer with.
const declaresConnectionIdentifier = (auth: ConnectorMetadata['auth']): boolean => {
    if (isNil(auth)) {
        return false
    }
    return (Array.isArray(auth) ? auth : [auth]).some((single) => single.hasConnectionIdentifier === true)
}

// Unlike engineValidateAuth this is best-effort: resolving a display label must
// never fail — or delay — the connection upsert, so any error/failure collapses
// to undefined and the engine round-trip is capped by RESOLVE_IDENTIFIER_TIMEOUT_MS
// (the watcher's own safety timeout is 5 minutes, far too long to block a Save on).
const RESOLVE_IDENTIFIER_TIMEOUT_MS = 15000

const engineResolveConnectionIdentifier = async (
    params: EngineResolveConnectionIdentifierParams,
    log: FastifyBaseLogger,
): Promise<string | undefined> => {
    const environment = system.getOrThrow(AppSystemProp.ENVIRONMENT)
    if (environment === ApEnvironment.TESTING) {
        return undefined
    }
    const { connectorName, auth, workspaceId, platformId, connectionType } = params
    const { data: identifier } = await tryCatch(async () => {
        const connectorMetadata = await connectorMetadataService(log).getOrThrow({
            name: connectorName,
            version: undefined,
            platformId,
        })
        if (!declaresConnectionIdentifier(connectorMetadata.auth)) {
            log.debug({ connector: { name: connectorName, version: connectorMetadata.version } }, 'Connector auth declares no getConnectionIdentifier, skipping engine round-trip')
            return undefined
        }
        const enginePromise = userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteResolveConnectionIdentifierResponse>>({
            connector: await getConnectorPackageWithoutArchive(log, platformId, {
                connectorName,
                connectorVersion: connectorMetadata.version,
            }),
            workspaceId,
            platformId,
            connectionValue: auth,
            connectionType,
            jobType: WorkerJobType.EXECUTE_RESOLVE_CONNECTION_IDENTIFIER,
        }, log)
        const timeoutPromise = new Promise<undefined>((resolve) => {
            setTimeout(() => resolve(undefined), RESOLVE_IDENTIFIER_TIMEOUT_MS).unref()
        })
        const engineResponse = await Promise.race([enginePromise, timeoutPromise])
        return !isNil(engineResponse) && engineResponse.status === EngineResponseStatus.OK
            ? engineResponse.response.identifier
            : undefined
    })
    return identifier ?? undefined
}

async function fetchFlowIdsForConnections(
    log: FastifyBaseLogger,
    connections: Pick<ConnectionSchema, 'externalId' | 'workspaceIds'>[],
): Promise<Map<string, string[]>> {
    const allExternalIds = new Set<string>()
    const allWorkspaceIds = new Set<string>()
    
    connections.forEach((connection) => {
        allExternalIds.add(connection.externalId)
        connection.workspaceIds.forEach((workspaceId) => {
            allWorkspaceIds.add(workspaceId)
        })
    })

    if (allExternalIds.size === 0 || allWorkspaceIds.size === 0) {
        return new Map<string, string[]>()
    }

    const flowsPage = await flowService(log).list({
        workspaceIds: Array.from(allWorkspaceIds),
        cursorRequest: null,
        connectionExternalIds: Array.from(allExternalIds),
    })

    const flowIdsByExternalId = new Map<string, string[]>()
    flowsPage.data.forEach((flow) => {
        if (flow.version?.connectionIds) {
            flow.version.connectionIds.forEach((connectionExternalId) => {
                if (!flowIdsByExternalId.has(connectionExternalId)) {
                    flowIdsByExternalId.set(connectionExternalId, [])
                }
                flowIdsByExternalId.get(connectionExternalId)!.push(flow.id)
            })
        }
    })

    return flowIdsByExternalId
}

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

function validateConnectorVersion(connectorVersion: string): void {
    if (!semver.valid(connectorVersion)) {
        throw new PlatformError({
            code: ErrorCode.VALIDATION,
            params: {
                message: 'Invalid connector version',
            },
        })
    }
}
type UpsertParams = {
    workspaceIds: WorkspaceId[]
    ownerId: string | null
    platformId: string
    scope: ConnectionScope
    externalId: string
    value: Extract<UpsertConnectionRequestBody, { value: unknown }>['value']
    displayName: string
    type: ConnectionType
    status?: ConnectionStatus
    connectorName: string
    metadata?: Metadata
    connectorVersion?: string
    preSelectForNewWorkspaces?: boolean
}


type GetOneByName = {
    workspaceId: WorkspaceId
    platformId: string
    externalId: string
}

type GetOneParams = {
    workspaceId: WorkspaceId | null
    platformId: string
    id: string
}

type RevalidateParams = {
    id: ConnectionId
    workspaceId: WorkspaceId
    platformId: PlatformId
}

type DeleteParams = {
    workspaceId: WorkspaceId | null
    scope: ConnectionScope
    id: ConnectionId
    platformId: string
}

type ValidateConnectionValueParams = {
    value: Extract<UpsertConnectionRequestBody, { value: unknown }>['value']
    connectorName: string
    connectorVersion: string
    workspaceId: WorkspaceId | undefined
    platformId: string
}

type ListParams = {
    workspaceId: WorkspaceId | null
    workspaceIds?: WorkspaceId[]
    ownerIds?: string[]
    platformId: string
    connectorName: string | undefined
    cursorRequest: Cursor | null
    scope: ConnectionScope | undefined
    displayName: string | undefined
    status: ConnectionStatus[] | undefined
    limit: number
    externalIds: string[] | undefined
}

type ListForPlatformParams = {
    platformId: string
    connectorName: string | undefined
    displayName: string | undefined
    status: ConnectionStatus[] | undefined
    scope: ConnectionScope | undefined
    workspaceIds: WorkspaceId[] | undefined
    ownerIds: string[] | undefined
    cursorRequest: Cursor | null
    limit: number
}

type UpdateParams = {
    workspaceIds: WorkspaceId[] | null
    platformId: string
    id: ConnectionId
    scope: ConnectionScope
    request: {
        displayName: string
        workspaceIds: WorkspaceId[] | null
        metadata?: Metadata
        preSelectForNewWorkspaces?: boolean
    }
}

type EngineValidateAuthParams = {
    connectorName: string
    workspaceId: WorkspaceId | undefined
    platformId: string
    auth: ConnectionValue
}

type EngineResolveConnectionIdentifierParams = EngineValidateAuthParams & {
    connectionType: ConnectionType
}

type ReplaceParams = {
    sourceConnectionId: ConnectionId
    targetConnectionId: ConnectionId
    workspaceId: WorkspaceId
    platformId: string
    userId: UserId
    deleteSourceConnection: boolean
    applyToPublishedVersions: boolean
}

