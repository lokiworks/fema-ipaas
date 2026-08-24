import { ConnectorMetadata } from '@fema-ipaas/connector-sdk'
import { ApplicationError, Cursor, ErrorCode, generateId, isNil, Metadata, SeekPage, spreadIfDefined, TenantId, tryCatch, tryCatchSync, unique, UserId, WorkspaceId } from '@fema-ipaas/core-utils'
import { Connection, ConnectionId, ConnectionOwners, ConnectionScope, ConnectionStatus, ConnectionType, ConnectionValue, ConnectionWithoutSensitiveData, EngineResponse, EngineResponseStatus, ExecuteResolveConnectionIdentifierResponse, ExecuteValidateAuthResponse, MAX_TENANT_CONNECTION_OWNERS, OAuth2GrantType, RuntimeEnvironment, TenantConnectionOwner, TenantConnectionOwnersResponse, TenantConnectionsListItem, TenantConnectionWorkspaceInfo, TenantRole, UpsertConnectionRequestBody, User, UserIdentity, UserWithMetaInformation, WorkerJobType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import semver from 'semver'
import { ArrayContains, Equal, FindOperator, FindOptionsWhere, ILike, In } from 'typeorm'
import {
    connectorMetadataService,
    getConnectorPackageWithoutArchive,
} from '../../connectors/metadata/connector-metadata-service'
import { repoFactory } from '../../core/db/repo-factory'
import { encryptUtils } from '../../helper/encryption'
import { jwtUtils } from '../../helper/jwt-utils'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { userService } from '../../user/user-service'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { workflowService } from '../../workflows/workflow/workflow.service'
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
        const { workspaceIds, externalId, value, displayName, connectorName, ownerId, tenantId, scope, type, status, metadata, preSelectForNewWorkspaces } = params
        const connectorVersion = params.connectorVersion ?? ( await connectorMetadataService(log).getOrThrow({
            name: connectorName,
            tenantId,
        })).version
        validateConnectorVersion(connectorVersion)
        await assertWorkspaceIds(workspaceIds, tenantId)

        if (status === ConnectionStatus.MISSING) {
            const existingForPlaceholder = await connectionsRepo().findOneBy({
                externalId,
                scope,
                tenantId,
                ...(workspaceIds ? { workspaceIds: ArrayContains(workspaceIds) } : {}),
            })
            if (!isNil(existingForPlaceholder) && existingForPlaceholder.status !== ConnectionStatus.MISSING) {
                log.info({ connection: { id: existingForPlaceholder.id }, connector: { name: connectorName }, tenant: { id: tenantId }, existingStatus: existingForPlaceholder.status }, 'Placeholder upsert skipped — non-missing connection already exists')
                return this.removeSensitiveData(existingForPlaceholder)
            }
        }

        const validatedConnectionValue = await validateConnectionValue({
            value,
            connectorName,
            connectorVersion,
            workspaceId: workspaceIds[0],
            tenantId,
        }, log)

        const encryptedConnectionValue = await encryptUtils.encryptObject({
            ...validatedConnectionValue,
            ...value,
        })

        const existingConnection = await connectionsRepo().findOneBy({
            externalId,
            scope,
            tenantId,
            ...(workspaceIds ? { workspaceIds: ArrayContains(workspaceIds) } : {}),
        })

        const accountIdentifier = await resolveConnectionAccountIdentifier({
            connectionType: type,
            auth: validatedConnectionValue,
            connectorName,
            workspaceId: workspaceIds[0],
            tenantId,
            log,
        })
        const connectionMetadata = mergeConnectionMetadata({
            requestMetadata: metadata,
            existingMetadata: existingConnection?.metadata,
            accountIdentifier,
        })

        const newId = existingConnection?.id ?? generateId()
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
            tenantId,
            ...spreadIfDefined('metadata', connectionMetadata),
            ...spreadIfDefined('preSelectForNewWorkspaces', preSelectForNewWorkspaces),
            connectorVersion,
        }

        await connectionsRepo().upsert(connection, ['id'])

        const updatedConnection = await connectionsRepo().findOneByOrFail({
            id: newId,
            tenantId,
            ...(workspaceIds ? { workspaceIds: ArrayContains(workspaceIds) } : {}),
            scope,
        })
        log.info({ connection: { id: newId }, connector: { name: connectorName }, tenant: { id: tenantId }, isNew: isNil(existingConnection) }, 'App connection upserted')
        return this.removeSensitiveData(updatedConnection)
    },
    async update(params: UpdateParams): Promise<ConnectionWithoutSensitiveData> {
        const { workspaceIds, id, request, scope, tenantId } = params

        if (!isNil(request.workspaceIds)) {
            await assertWorkspaceIds(request.workspaceIds, tenantId)
        }

        const filter: FindOptionsWhere<ConnectionSchema> = {
            id,
            scope,
            tenantId,
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
        tenantId,
        externalId,
    }: GetOneByName): Promise<Connection | null> {
        const encryptedConnection = await connectionsRepo().findOne({
            where: {
                workspaceIds: ArrayContains([workspaceId]),
                externalId,
                tenantId,
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

    async getOneWithoutValue({ workspaceId, tenantId, externalId }: GetOneByName): Promise<ConnectionWithoutSensitiveData | null> {
        const connection = await connectionsRepo().findOneBy({
            workspaceIds: ArrayContains([workspaceId]),
            externalId,
            tenantId,
        })
        return isNil(connection) ? null : this.removeSensitiveData(connection)
    },

    async getOneOrThrowWithoutValue(params: GetOneParams): Promise<ConnectionWithoutSensitiveData> {
        const connectionById = await connectionsRepo().findOneBy({
            id: params.id,
            tenantId: params.tenantId,
            ...(params.workspaceId ? { workspaceIds: ArrayContains([params.workspaceId]) } : {}),
        })
        if (isNil(connectionById)) {
            throw new ApplicationError({
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
        const workflowIdsByExternalId = await fetchWorkflowIdsForConnections(log, [connection])
        return {
            ...connection,
            workflowIds: workflowIdsByExternalId.get(connection.externalId) ?? [],
        }
    },

    async revalidate({ id, workspaceId, tenantId }: RevalidateParams): Promise<ConnectionWithoutSensitiveData> {
        const metadata = await this.getOneOrThrowWithoutValue({ id, workspaceId, tenantId })
        const connection = await connectionHandler(log).revalidateConnection({
            id,
            tenantId,
            workspaceId,
            externalId: metadata.externalId,
            validate: ({ connectorName, value }) => engineValidateAuth({ connectorName, workspaceId, tenantId, auth: value }, log),
            log,
        })
        if (isNil(connection)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'Connection', entityId: id },
            })
        }
        return this.removeSensitiveData(connection)
    },

    async replace(params: ReplaceParams): Promise<void> {
        const { sourceConnectionId, targetConnectionId, workspaceId, tenantId, userId, deleteSourceConnection, applyToPublishedVersions } = params
        if (sourceConnectionId === targetConnectionId) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'Cannot replace a connection with itself',
                },
            })
        }
        const sourceConnection = await this.getOneOrThrowWithoutValue({
            id: sourceConnectionId,
            workspaceId,
            tenantId,
        })

        const targetConnection = await this.getOneOrThrowWithoutValue({
            id: targetConnectionId,
            workspaceId,
            tenantId,
        })

        if (sourceConnection.connectorName !== targetConnection.connectorName) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'Connections must be from the same app',
                },
            })
        }

        // Mirrors the workspace-route DELETE guard: tenant connections are managed
        // from the tenant admin page and must not be deletable through a
        // workspace-scoped replace, no matter which workspaces still use them.
        if (deleteSourceConnection && sourceConnection.scope === ConnectionScope.TENANT) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'Tenant connections must be deleted from the tenant admin connections page',
                },
            })
        }

        // Reject up-front (before mutating any workflow) when published versions this
        // replace won't touch still use the source connection. When
        // applyToPublishedVersions is set, that is only the published versions
        // invisible to the replace (their workflow's latest version no longer
        // references the connection); updating those in place would overwrite
        // the newer draft, so the user has to publish or repoint them first.
        // Without it, a delete would orphan every published reference.
        const publishedWorkflowsUsingConnection = deleteSourceConnection || applyToPublishedVersions
            ? await connectionHandler(log).countPublishedWorkflowsReferencingConnection({ workspaceId, externalId: sourceConnection.externalId, applyToPublishedVersions })
            : 0
        if (publishedWorkflowsUsingConnection > 0) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: deleteSourceConnection
                        ? 'Cannot delete the old connection because it is still used by published workflows that were not updated'
                        : 'Some published workflows still use the old connection but have unpublished draft changes — publish those workflows first',
                },
            })
        }

        // Repoint page by page: each repointed workflow drops out of the connection
        // filter, so re-fetching the first page walks the whole set without the
        // cursor skew of paginating rows that are being mutated. The seen-set
        // stops the loop if a workflow fails to leave the filter (e.g. an auth
        // string the rewrite does not understand) instead of spinning forever.
        const repointedWorkflowIds = new Set<string>()
        for (;;) {
            const workflowsPage = await workflowService(log).list({
                workspaceIds: [workspaceId],
                cursorRequest: null,
                limit: 1000,
                folderId: undefined,
                name: undefined,
                status: undefined,
                connectionExternalIds: [sourceConnection.externalId],
            })
            const workflowsToRepoint = workflowsPage.data.filter((workflow) => !repointedWorkflowIds.has(workflow.id))
            if (workflowsToRepoint.length === 0) {
                if (workflowsPage.data.length > 0) {
                    log.warn({ oldConnectionId: sourceConnectionId, stuckWorkflowIds: workflowsPage.data.map((workflow) => workflow.id) }, 'Replace could not rewrite some workflow references; they keep the old connection')
                }
                break
            }
            await connectionHandler(log).updateWorkflowsWithConnection(workflowsToRepoint, {
                connection: sourceConnection,
                newConnection: targetConnection,
                userId,
                applyToPublishedVersions,
            })
            workflowsToRepoint.forEach((workflow) => repointedWorkflowIds.add(workflow.id))
        }

        log.info({ oldConnectionId: sourceConnectionId, newConnectionId: targetConnectionId, affectedWorkflows: repointedWorkflowIds.size, deleteSourceConnection, applyToPublishedVersions }, 'App connection replaced')

        if (!deleteSourceConnection) {
            return
        }

        // Final integrity gate before the irreversible delete: a workflow whose
        // reference could not be rewritten or that was edited or published
        // concurrently may still use the connection, and deleting it would
        // orphan that workflow. The list covers latest-version references; the
        // count covers published versions the list cannot see.
        const remainingWorkflows = await workflowService(log).list({
            workspaceIds: [workspaceId],
            cursorRequest: null,
            limit: 1,
            folderId: undefined,
            name: undefined,
            status: undefined,
            connectionExternalIds: [sourceConnection.externalId],
        })
        const remainingPublishedWorkflows = remainingWorkflows.data.length > 0
            ? 0
            : await connectionHandler(log).countPublishedWorkflowsReferencingConnection({ workspaceId, externalId: sourceConnection.externalId, applyToPublishedVersions: false })
        if (remainingWorkflows.data.length > 0 || remainingPublishedWorkflows > 0) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'Cannot delete the old connection because some workflows still use it',
                },
            })
        }

        await this.delete({
            id: sourceConnection.id,
            tenantId,
            scope: sourceConnection.scope,
            workspaceId,
        })
    },

    async delete(params: DeleteParams): Promise<void> {
        await connectionsRepo().delete({
            id: params.id,
            tenantId: params.tenantId,
            scope: params.scope,
            ...(params.workspaceId ? { workspaceIds: ArrayContains([params.workspaceId]) } : {}),
        })
        log.info({ connection: { id: params.id }, tenant: { id: params.tenantId } }, 'App connection deleted')
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
        tenantId,
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
            tenantId,
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

        const workflowIdsByExternalId = await fetchWorkflowIdsForConnections(log, data)

        const promises = data.map(async (encryptedConnection) => {
            const decryptedConnection: Connection = await connectionHandler(log).decryptConnection(encryptedConnection)
            const owner = mapToUserWithMetaInformation(encryptedConnection.owner)
            const workflowIds = workflowIdsByExternalId.get(decryptedConnection.externalId) ?? []

            return {
                ...decryptedConnection,
                owner,
                workflowIds,
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

        const refreshedConnection = await connectionHandler(log).lockAndRefreshConnection({ tenantId: connection.tenantId, workspaceId, externalId: connection.externalId, log })
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

    async getOwners({ workspaceId: _workspaceId, tenantId }: { workspaceId: WorkspaceId, tenantId: TenantId }): Promise<ConnectionOwners[]> {
        const tenantAdmins = (await userService(log).getByTenantRole(tenantId, TenantRole.ADMIN)).map(user => ({
            firstName: user.identity.firstName,
            lastName: user.identity.lastName,
            email: user.identity.email,
        }))
        return tenantAdmins
    },

    async listForTenant(params: ListForTenantParams): Promise<SeekPage<TenantConnectionsListItem>> {
        const service = connectionService(log)
        const page = await service.list({
            connectorName: params.connectorName,
            displayName: params.displayName,
            status: params.status,
            scope: params.scope,
            tenantId: params.tenantId,
            workspaceId: null,
            workspaceIds: params.workspaceIds,
            ownerIds: params.ownerIds,
            cursorRequest: params.cursorRequest,
            limit: params.limit,
            externalIds: undefined,
        })

        const workspaceIdsToLookUp = unique(page.data.flatMap((connection) => connection.workspaceIds))
        const workspacesById = await fetchWorkspacesForTenant(workspaceIdsToLookUp, params.tenantId)

        const data: TenantConnectionsListItem[] = page.data.map((connection) => {
            const sanitized = service.removeSensitiveData(connection)
            const workspaces: TenantConnectionWorkspaceInfo[] = connection.workspaceIds
                .map((id) => workspacesById.get(id))
                .filter((workspace): workspace is TenantConnectionWorkspaceInfo => workspace !== undefined)
            return { ...sanitized, workspaces }
        })

        return { ...page, data }
    },

    async listOwnersForTenant({ tenantId }: { tenantId: TenantId }): Promise<TenantConnectionOwnersResponse> {
        const rows = await connectionsRepo()
            .createQueryBuilder('connection')
            .innerJoin('connection.owner', 'owner')
            .innerJoin('owner.identity', 'identity')
            .where('connection.tenantId = :tenantId', { tenantId })
            .select('owner.id', 'id')
            .addSelect('identity.firstName', 'firstName')
            .addSelect('identity.lastName', 'lastName')
            .addSelect('identity.email', 'email')
            .distinct(true)
            .orderBy('identity.email', 'ASC')
            .limit(MAX_TENANT_CONNECTION_OWNERS + 1)
            .getRawMany<TenantConnectionOwner>()

        const truncated = rows.length > MAX_TENANT_CONNECTION_OWNERS
        const data = truncated ? rows.slice(0, MAX_TENANT_CONNECTION_OWNERS) : rows
        return { data, truncated }
    },

})

const fetchWorkspacesForTenant = async (workspaceIds: string[], tenantId: string): Promise<Map<string, TenantConnectionWorkspaceInfo>> => {
    if (workspaceIds.length === 0) {
        return new Map()
    }
    const workspaces = await workspaceRepo().find({
        where: { id: In(workspaceIds), tenantId },
        select: ['id', 'displayName', 'type'],
    })
    return new Map(workspaces.map((workspace) => [workspace.id, { id: workspace.id, displayName: workspace.displayName, type: workspace.type }]))
}

async function assertWorkspaceIds(workspaceIds: WorkspaceId[], tenantId: string): Promise<void> {
    const filteredWorkspaces = await workspaceRepo().countBy({
        id: In(workspaceIds),
        tenantId,
    })
    if (filteredWorkspaces !== workspaceIds.length) {
        throw new ApplicationError({
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
    tenantId,
    log,
}: {
    connectionType: ConnectionType
    auth: ConnectionValue
    connectorName: string
    workspaceId: WorkspaceId | undefined
    tenantId: string
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
    return engineResolveConnectionIdentifier({ connectorName, workspaceId, tenantId, auth, connectionType }, log)
}

const OAUTH_CONNECTION_TYPES = [
    ConnectionType.OAUTH2,
    ConnectionType.CLOUD_OAUTH2,
    ConnectionType.TENANT_OAUTH2,
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
    const { value, connectorName, connectorVersion, workspaceId, tenantId } = params

    switch (value.type) {
        case ConnectionType.TENANT_OAUTH2: {
            const tokenUrl = await oauth2Util(log).getOAuth2TokenUrl({
                connectorName,
                connectorVersion,
                tenantId,
                props: value.props,
            })
            return oauth2Handler[value.type](log).claim({
                workspaceId,
                tenantId,
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
                tenantId,
                props: value.props,
            })
            return oauth2Handler[value.type](log).claim({
                workspaceId,
                tenantId,
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
                tenantId,
                props: value.props,
            })
            
            const auth = await oauth2Handler[value.type](log).claim({
                workspaceId,
                tenantId,
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
                tenantId,
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
                tenantId,
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
    if (environment === RuntimeEnvironment.TESTING) {
        return
    }
    const { connectorName, auth, workspaceId, tenantId } = params

    const connectorMetadata = await connectorMetadataService(log).getOrThrow({
        name: connectorName,
        version: undefined,
        tenantId,
    })

    const engineResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteValidateAuthResponse>>({
        connector: await getConnectorPackageWithoutArchive(log, tenantId, {
            connectorName,
            connectorVersion: connectorMetadata.version,
        }),
        workspaceId,
        tenantId,
        connectionValue: auth,
        jobType: WorkerJobType.EXECUTE_VALIDATION,
    }, log)

    if (engineResponse.status !== EngineResponseStatus.OK) {
        log.error(
            { engineResponse },
            'Engine validate auth failed',
        )
        throw new ApplicationError({
            code: ErrorCode.ENGINE_OPERATION_FAILURE,
            params: {
                message: 'Failed to run engine validate auth',
                context: engineResponse,
            },
        })
    }

    const validateAuthResult = engineResponse.response

    if (!validateAuthResult.valid) {
        throw new ApplicationError({
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
    if (environment === RuntimeEnvironment.TESTING) {
        return undefined
    }
    const { connectorName, auth, workspaceId, tenantId, connectionType } = params
    const { data: identifier } = await tryCatch(async () => {
        const connectorMetadata = await connectorMetadataService(log).getOrThrow({
            name: connectorName,
            version: undefined,
            tenantId,
        })
        if (!declaresConnectionIdentifier(connectorMetadata.auth)) {
            log.debug({ connector: { name: connectorName, version: connectorMetadata.version } }, 'Connector auth declares no getConnectionIdentifier, skipping engine round-trip')
            return undefined
        }
        const enginePromise = userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteResolveConnectionIdentifierResponse>>({
            connector: await getConnectorPackageWithoutArchive(log, tenantId, {
                connectorName,
                connectorVersion: connectorMetadata.version,
            }),
            workspaceId,
            tenantId,
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

async function fetchWorkflowIdsForConnections(
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

    const workflowsPage = await workflowService(log).list({
        workspaceIds: Array.from(allWorkspaceIds),
        cursorRequest: null,
        connectionExternalIds: Array.from(allExternalIds),
    })

    const workflowIdsByExternalId = new Map<string, string[]>()
    workflowsPage.data.forEach((workflow) => {
        if (workflow.version?.connectionIds) {
            workflow.version.connectionIds.forEach((connectionExternalId) => {
                if (!workflowIdsByExternalId.has(connectionExternalId)) {
                    workflowIdsByExternalId.set(connectionExternalId, [])
                }
                workflowIdsByExternalId.get(connectionExternalId)!.push(workflow.id)
            })
        }
    })

    return workflowIdsByExternalId
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
        tenantId: owner.tenantId,
        tenantRole: owner.tenantRole,
        status: owner.status,
        externalId: owner.externalId,
        created: owner.created,
        updated: owner.updated,
    }
}

function validateConnectorVersion(connectorVersion: string): void {
    if (!semver.valid(connectorVersion)) {
        throw new ApplicationError({
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
    tenantId: string
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
    tenantId: string
    externalId: string
}

type GetOneParams = {
    workspaceId: WorkspaceId | null
    tenantId: string
    id: string
}

type RevalidateParams = {
    id: ConnectionId
    workspaceId: WorkspaceId
    tenantId: TenantId
}

type DeleteParams = {
    workspaceId: WorkspaceId | null
    scope: ConnectionScope
    id: ConnectionId
    tenantId: string
}

type ValidateConnectionValueParams = {
    value: Extract<UpsertConnectionRequestBody, { value: unknown }>['value']
    connectorName: string
    connectorVersion: string
    workspaceId: WorkspaceId | undefined
    tenantId: string
}

type ListParams = {
    workspaceId: WorkspaceId | null
    workspaceIds?: WorkspaceId[]
    ownerIds?: string[]
    tenantId: string
    connectorName: string | undefined
    cursorRequest: Cursor | null
    scope: ConnectionScope | undefined
    displayName: string | undefined
    status: ConnectionStatus[] | undefined
    limit: number
    externalIds: string[] | undefined
}

type ListForTenantParams = {
    tenantId: string
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
    tenantId: string
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
    tenantId: string
    auth: ConnectionValue
}

type EngineResolveConnectionIdentifierParams = EngineValidateAuthParams & {
    connectionType: ConnectionType
}

type ReplaceParams = {
    sourceConnectionId: ConnectionId
    targetConnectionId: ConnectionId
    workspaceId: WorkspaceId
    tenantId: string
    userId: UserId
    deleteSourceConnection: boolean
    applyToPublishedVersions: boolean
}

