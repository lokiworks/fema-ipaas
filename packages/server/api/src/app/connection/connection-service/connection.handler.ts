import { PropertyType } from '@fema/connector-sdk'
import { assertNotNullOrUndefined, ErrorCode, isNil, PlatformError, PlatformId, tryCatch, UserId, WorkspaceId } from '@fema/core-utils'
import { Connection, ConnectionStatus, ConnectionType, ConnectionValue, ConnectionWithoutSensitiveData, EngineResponse, EngineResponseStatus, ExecuteRefreshTokenAuthResponse, PopulatedWorkflow, WorkerJobType, Workflow, WorkflowOperationType, workflowStructureUtil, WorkflowVersion, WorkflowVersionState } from '@fema/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { lru, LRU } from 'tiny-lru'
import { ArrayContains } from 'typeorm'
import { connectorMetadataService, getConnectorPackageWithoutArchive } from '../../connectors/metadata/connector-metadata-service'
import { distributedLock } from '../../database/redis-connections'
import { encryptUtils } from '../../helper/encryption'
import { exceptionHandler } from '../../helper/exception-handler'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { workflowService } from '../../workflows/workflow/workflow.service'
import { workflowVersionRepo, workflowVersionService } from '../../workflows/workflow-version/workflow-version.service'
import { workspaceService } from '../../workspace/workspace-service'
import { ConnectionSchema } from '../connection.entity'
import { connectionsRepo } from './connection-service'
import { oauth2Handler } from './oauth2'
import { oauth2Util } from './oauth2/oauth2-util'

export const connectionHandler = (log: FastifyBaseLogger) => ({
    async updateWorkflowsWithConnection(workflows: PopulatedWorkflow[], params: UpdateWorkflowsWithConnectionParams): Promise<void> {
        const { connection, newConnection, userId, applyToPublishedVersions } = params

        await Promise.all(workflows.map(async (workflow) => {
            const workspace = await workspaceService(log).getOneOrThrow(workflow.workspaceId)
            // Don't change the order: republish first (when opted in), then make sure the
            // draft also points to the new connection.
            if (applyToPublishedVersions) {
                await handleLockedVersion(workflow, userId, workflow.workspaceId, workspace.platformId, connection, newConnection, log)
            }
            await handleDraftVersion(workflow, userId, workflow.workspaceId, workspace.platformId, connection, newConnection, log)
        }))
    },

    // Queries published versions directly rather than relying on the workflows fetched
    // for the replace, since workflowService.list filters by the latest (draft) version's
    // connectionIds. A workflow whose published version still uses the connection but whose
    // newer draft dropped it would be missing from that list, so deleting the source
    // would silently orphan the published version.
    // When applyToPublishedVersions is set, the replace republishes the published
    // versions of the workflows it can see (those whose latest version references the
    // connection), so only published versions whose workflow's latest version dropped the
    // connection stay untouched and count as blocking.
    async countPublishedWorkflowsReferencingConnection({ workspaceId, externalId, applyToPublishedVersions }: CountPublishedWorkflowsParams): Promise<number> {
        const query = workflowVersionRepo()
            .createQueryBuilder('workflow_version')
            .innerJoin('workflow', 'workflow', 'workflow.id = workflow_version."workflowId"')
            .where('workflow."workspaceId" = :workspaceId', { workspaceId })
            .andWhere('workflow_version.id = workflow."publishedVersionId"')
            .andWhere('workflow_version."connectionIds" && :externalIds', { externalIds: [externalId] })
        if (applyToPublishedVersions) {
            const latestVersionConnectionIds = workflowVersionRepo()
                .createQueryBuilder('fv_latest')
                .select('fv_latest."connectionIds"')
                .where('fv_latest."workflowId" = workflow.id')
                .orderBy('fv_latest.created', 'DESC')
                .limit(1)
            query.andWhere(`NOT ((${latestVersionConnectionIds.getQuery()}) && :externalIds)`)
        }
        return query.getCount()
    },

    async refresh(connection: Connection, workspaceId: WorkspaceId, log: FastifyBaseLogger): Promise<Connection> {
        switch (connection.value.type) {
            case ConnectionType.PLATFORM_OAUTH2:
                connection.value = await oauth2Handler[connection.value.type](log).refresh({
                    connectorName: connection.connectorName,
                    platformId: connection.platformId,
                    workspaceId,
                    connectionValue: connection.value,
                })
                break
            case ConnectionType.CLOUD_OAUTH2:
                connection.value = await oauth2Handler[connection.value.type](log).refresh({
                    connectorName: connection.connectorName,
                    platformId: connection.platformId,
                    workspaceId,
                    connectionValue: connection.value,
                })
                break
            case ConnectionType.OAUTH2:
                connection.value = await oauth2Handler[connection.value.type](log).refresh({
                    connectorName: connection.connectorName,
                    platformId: connection.platformId,
                    workspaceId,
                    connectionValue: connection.value,
                })
                break
            case ConnectionType.CUSTOM_AUTH: {
                const connector = await getConnectorPackageWithoutArchive(log, connection.platformId, {
                    connectorName: connection.connectorName,
                    connectorVersion: connection.connectorVersion,
                })
                log.info({ connectorName: connection.connectorName, externalId: connection.externalId }, '[custom-auth-refresh] submitting token refresh job')
                const engineResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteRefreshTokenAuthResponse>>({
                    connector,
                    platformId: connection.platformId,
                    connectionValue: connection.value,
                    jobType: WorkerJobType.EXECUTE_TOKEN_REFRESH,
                }, log)
                if (engineResponse.status === EngineResponseStatus.TIMEOUT) {
                    log.warn({ connectorName: connection.connectorName }, '[custom-auth-refresh] token refresh timed out — using existing credentials')
                    return connection
                }
                if (engineResponse.status !== EngineResponseStatus.OK) {
                    throw new CustomAuthRefreshError(`Custom auth token refresh failed: ${engineResponse.error ?? 'unknown engine error'}`)
                }
                const refreshResult = engineResponse.response
                if (refreshResult.skipped) {
                    // Connector no longer has onRefreshToken (e.g. connector was updated) — clear
                    // the token so the next needRefresh call re-checks connector metadata.
                    log.info({ connectorName: connection.connectorName }, '[custom-auth-refresh] connector has no refresh callback — clearing stale token')
                    connectorRefreshSupportCache.set(connectorRefreshSupportCacheKey(connection), false)
                    connection.value = {
                        ...connection.value,
                        access_token: undefined,
                        token_refresh_at: undefined,
                    }
                }
                else {
                    log.info({ connectorName: connection.connectorName, expiresIn: refreshResult.expires_in }, '[custom-auth-refresh] token refreshed successfully')
                    connection.value = {
                        ...connection.value,
                        access_token: refreshResult.access_token,
                        token_refresh_at: computeTokenRefreshAt(refreshResult.expires_in),
                    }
                }
                break
            }
            default:
                break
        }
        return connection
    },

    /**
 * We should make sure this is accessed only once, as a race condition could occur where the token needs to be
 * refreshed and it gets accessed at the same time, which could result in the wrong request saving incorrect data.
 */
    async lockAndRefreshConnection({
        platformId,
        workspaceId,
        externalId,
        log,
    }: {
        platformId: PlatformId
        workspaceId: WorkspaceId
        externalId: string
        log: FastifyBaseLogger
    }) {

        return distributedLock(log).runExclusive({
            key: `${platformId}_${externalId}`,
            timeoutInSeconds: 60,
            fn: async () => {
                let connection: Connection | null = null

                try {
                    const encryptedConnection = await connectionsRepo().findOneBy({
                        workspaceIds: ArrayContains([workspaceId]),
                        externalId,
                    })
                    if (isNil(encryptedConnection)) {
                        return encryptedConnection
                    }
                    connection = await this.decryptConnection(encryptedConnection)
                    if (!await this.needRefresh(connection, log)) {
                        return connection
                    }
                    const refreshedConnection = await this.refresh(connection, workspaceId, log)
        
                    await connectionsRepo().update(refreshedConnection.id, {
                        status: ConnectionStatus.ACTIVE,
                        value: await encryptUtils.encryptObject(refreshedConnection.value),
                    })
                    return refreshedConnection
                }
                catch (e) {
                    exceptionHandler.handle(e, log)
                    const isOAuth2Error = oauth2Util(log).isUserError(e)
                    const isCustomAuthError = e instanceof CustomAuthRefreshError
                    if (!isNil(connection) && (isOAuth2Error || isCustomAuthError)) {
                        connection.status = ConnectionStatus.ERROR
                        await connectionsRepo().update(connection.id, {
                            status: connection.status,
                            updated: dayjs().toISOString(),
                        })
                    }
                }
                return connection
            },
        })
    },
    async revalidateConnection({ id, platformId, workspaceId, externalId, validate, log }: {
        id: string
        platformId: PlatformId
        workspaceId: WorkspaceId
        externalId: string
        validate: (params: { connectorName: string, value: ConnectionValue }) => Promise<void>
        log: FastifyBaseLogger
    }): Promise<Connection | null> {
        return distributedLock(log).runExclusive({
            key: `${platformId}_${externalId}`,
            timeoutInSeconds: 60,
            fn: async () => {
                const encryptedConnection = await connectionsRepo().findOneBy({
                    id,
                    platformId,
                    workspaceIds: ArrayContains([workspaceId]),
                })
                if (isNil(encryptedConnection)) {
                    return null
                }
                let connection = await this.decryptConnection(encryptedConnection)
                if (connection.value.type === ConnectionType.NO_AUTH) {
                    return connection
                }
                const forceRefresh = REVALIDATE_FORCE_REFRESH_TYPES.has(connection.value.type)
                const skipRefresh = connection.value.type === ConnectionType.PLATFORM_OAUTH2
                try {
                    if (!skipRefresh && (forceRefresh || await this.needRefresh(connection, log))) {
                        connection = await this.refresh(connection, workspaceId, log)
                        await connectionsRepo().update(connection.id, {
                            status: ConnectionStatus.ACTIVE,
                            value: await encryptUtils.encryptObject(connection.value),
                        })
                    }
                }
                catch (e) {
                    exceptionHandler.handle(e, log)
                    const isOAuth2Error = oauth2Util(log).isUserError(e)
                    const isCustomAuthError = e instanceof CustomAuthRefreshError
                    if (!isOAuth2Error && !isCustomAuthError) {
                        throw e
                    }
                    connection.status = ConnectionStatus.ERROR
                    await connectionsRepo().update(connection.id, {
                        status: ConnectionStatus.ERROR,
                        updated: dayjs().toISOString(),
                    })
                    return connection
                }
                const { error } = await tryCatch(() => validate({ connectorName: connection.connectorName, value: connection.value }))
                if (!isNil(error) && !(error instanceof PlatformError && error.error.code === ErrorCode.INVALID_CONNECTION)) {
                    throw error
                }
                connection.status = isNil(error) ? ConnectionStatus.ACTIVE : ConnectionStatus.ERROR
                await connectionsRepo().update(connection.id, {
                    status: connection.status,
                    updated: dayjs().toISOString(),
                })
                return connection
            },
        })
    },
    async decryptConnection(
        encryptedConnection: ConnectionSchema,
    ): Promise<Connection> {
        const value = await encryptUtils.decryptObject<ConnectionValue>(encryptedConnection.value)
        const connection: Connection = {
            ...encryptedConnection,
            value,
        }
        return connection
    },
    async needRefresh(connection: Connection, log: FastifyBaseLogger): Promise<boolean> {
        if (connection.status === ConnectionStatus.ERROR) {
            return false
        }
        switch (connection.value.type) {
            case ConnectionType.PLATFORM_OAUTH2:
            case ConnectionType.CLOUD_OAUTH2:
            case ConnectionType.OAUTH2:
                return oauth2Util(log).isExpired(connection.value)
            case ConnectionType.CUSTOM_AUTH: {
                // Once a token exists, check expiry without a metadata lookup.
                if (!isNil(connection.value.access_token)) {
                    return isCustomAuthTokenStale(connection.value)
                }
                // No token yet — only dispatch a refresh job if the connector implements onRefreshToken.
                // Cache the result per connector version to avoid a metadata round-trip on every execution.
                const cacheKey = connectorRefreshSupportCacheKey(connection)
                const cached = connectorRefreshSupportCache.get(cacheKey)
                if (!isNil(cached)) {
                    return cached
                }
                const connectorMetadata = await connectorMetadataService(log).getOrThrow({
                    name: connection.connectorName,
                    version: connection.connectorVersion,
                    platformId: connection.platformId,
                })
                const auth = Array.isArray(connectorMetadata.auth) ? connectorMetadata.auth[0] : connectorMetadata.auth
                const hasRefresh = auth?.type === PropertyType.CUSTOM_AUTH && !isNil(auth.refresh)
                connectorRefreshSupportCache.set(cacheKey, hasRefresh)
                return hasRefresh
            }
            default:
                return false
        }
    },
})


const TOKEN_REFRESH_BUFFER_SECONDS = 15 * 60
const connectorRefreshSupportCache: LRU<boolean> = lru(1000, 0)
const REVALIDATE_FORCE_REFRESH_TYPES: ReadonlySet<ConnectionType> = new Set([
    ConnectionType.OAUTH2,
    ConnectionType.CLOUD_OAUTH2,
])

export function isCustomAuthTokenStale(value: { access_token?: string, token_refresh_at?: number }): boolean {
    if (isNil(value.access_token)) return true
    if (isNil(value.token_refresh_at)) return false
    return dayjs().unix() >= value.token_refresh_at
}

// Returns the unix timestamp at which the token should be refreshed: 15 minutes
// before expiry, but never earlier than half the token's lifetime — otherwise a
// token whose TTL is shorter than the buffer would be considered stale the instant
// it is minted, refreshing on every fetch and defeating the cache. `expiresIn` is
// typed as unknown because it comes from a third-party token response; any
// non-positive or non-finite result means the token never expires, so it never
// needs refreshing.
export function computeTokenRefreshAt(expiresIn: unknown): number | undefined {
    const expiresInSeconds = Number(expiresIn)
    if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        return undefined
    }
    const buffer = Math.min(TOKEN_REFRESH_BUFFER_SECONDS, Math.floor(expiresInSeconds / 2))
    return dayjs().unix() + expiresInSeconds - buffer
}

function connectorRefreshSupportCacheKey(connection: Pick<Connection, 'platformId' | 'connectorName' | 'connectorVersion'>): string {
    return `${connection.platformId}:${connection.connectorName}@${connection.connectorVersion}`
}

class CustomAuthRefreshError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'CustomAuthRefreshError'
    }
}

async function handleLockedVersion(workflow: PopulatedWorkflow, userId: UserId, workspaceId: WorkspaceId, platformId: PlatformId, connection: ConnectionWithoutSensitiveData, newConnection: ConnectionWithoutSensitiveData, log: FastifyBaseLogger) {
    if (isNil(workflow.publishedVersionId)) {
        return
    }

    const lastPublishedVersion = await workflowVersionService(log).getLatestVersion(workflow.id, WorkflowVersionState.LOCKED)
    assertNotNullOrUndefined(lastPublishedVersion, `Last published version not found for workflow ${workflow.id}`)

    await workflowService(log).update({
        id: workflow.id,
        workspaceId,
        platformId,
        userId,
        previousWorkflow: workflow,
        operation: {
            type: WorkflowOperationType.IMPORT_WORKFLOW,
            request: replaceConnectionInWorkflowVersion(lastPublishedVersion, connection, newConnection),
        },
    })

    await workflowService(log).update({
        id: workflow.id,
        workspaceId,
        platformId,
        userId,
        operation: {
            type: WorkflowOperationType.LOCK_AND_PUBLISH,
            request: {},
        },
    })
}

async function handleDraftVersion(workflow: Workflow, userId: UserId, workspaceId: WorkspaceId, platformId: PlatformId, connection: ConnectionWithoutSensitiveData, newConnection: ConnectionWithoutSensitiveData, log: FastifyBaseLogger) {
    const latestVersion = await workflowVersionService(log).getWorkflowVersionOrThrow({
        workflowId: workflow.id,
        versionId: undefined,
    })

    // Nothing to do if the latest version no longer references the old connection
    // (e.g. it was just republished onto the new one). Otherwise IMPORT_WORKFLOW will
    // transparently create a draft from a published version and rewrite it, so the
    // draft always ends up on the new connection even for never-edited published workflows.
    if (!latestVersion.connectionIds.includes(connection.externalId)) {
        return
    }

    await workflowService(log).update({
        id: workflow.id,
        workspaceId,
        platformId,
        userId,
        operation: {
            type: WorkflowOperationType.IMPORT_WORKFLOW,
            request: replaceConnectionInWorkflowVersion(latestVersion, connection, newConnection),
        },
    })
}
function replaceConnectionInWorkflowVersion(workflowVersion: WorkflowVersion, connection: ConnectionWithoutSensitiveData, newConnection: ConnectionWithoutSensitiveData) {
    return workflowStructureUtil.transferWorkflow(workflowVersion, (step) => {
        if (step.settings?.input?.auth?.includes(connection.externalId)) {
            return {
                ...step,
                settings: {
                    ...step.settings,
                    input: {
                        ...step.settings?.input,
                        auth: replaceConnectionIdInAuth(step.settings.input.auth, connection.externalId, newConnection.externalId),
                    },
                },
            }
        }
        return step
    })
}

function replaceConnectionIdInAuth(auth: string, oldConnectionId: string, newConnectionId: string): string {
    return auth.replace(
        new RegExp(`connections\\['${oldConnectionId}'\\]`, 'g'),
        `connections['${newConnectionId}']`,
    )
}

type UpdateWorkflowsWithConnectionParams = {
    connection: ConnectionWithoutSensitiveData
    newConnection: ConnectionWithoutSensitiveData
    userId: UserId
    applyToPublishedVersions: boolean
}

type CountPublishedWorkflowsParams = {
    workspaceId: WorkspaceId
    externalId: string
    applyToPublishedVersions: boolean
}
