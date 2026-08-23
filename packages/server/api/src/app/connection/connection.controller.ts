import { ApId, Permission, SeekPage } from '@fema/core-utils'
import { wideEvent } from '@fema/server-utils'
import { ApplicationEventName, ConnectionOwners, ConnectionScope, ConnectionStatus, ConnectionType, ConnectionWithoutSensitiveData, ErrorCode, GetOAuth2AuthorizationUrlRequestBody, GetOAuth2AuthorizationUrlResponse, ListConnectionOwnersRequestQuery, ListConnectionsRequestQuery, PLACEHOLDER_CONNECTION_TYPE, PlatformError, PrincipalType, ReplaceConnectionsRequestBody, SERVICE_KEY_SECURITY_OPENAPI, UpdateConnectionValueRequestBody, UpsertConnectionRequestBody } from '@fema/shared'
import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { WorkspaceResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { auditEvents } from '../helper/audit-events'
import { securityHelper } from '../helper/security-helper'
import { connectionService } from './connection-service/connection-service'
import { oauth2Util } from './connection-service/oauth2/oauth2-util'
import { ConnectionEntity } from './connection.entity'

export const connectionController: FastifyPluginCallbackZod = (app, _opts, done) => {
    app.post('/', UpsertConnectionRequest, async (request, reply) => {
        const ownerId = await securityHelper.getUserIdFromRequest(request)
        const baseUpsert = {
            platformId: request.principal.platform.id,
            workspaceIds: [request.workspaceId],
            externalId: request.body.externalId,
            displayName: request.body.displayName,
            connectorName: request.body.connectorName,
            ownerId,
            scope: ConnectionScope.WORKSPACE,
            metadata: request.body.metadata,
            connectorVersion: request.body.connectorVersion,
        }
        const connection = request.body.type === PLACEHOLDER_CONNECTION_TYPE
            ? await connectionService(request.log).upsert({
                ...baseUpsert,
                type: ConnectionType.NO_AUTH,
                value: { type: ConnectionType.NO_AUTH },
                status: ConnectionStatus.MISSING,
            })
            : await connectionService(request.log).upsert({
                ...baseUpsert,
                type: request.body.type,
                value: request.body.value,
            })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.CONNECTION_UPSERTED,
            data: {
                connection,
            },
        })
        await reply
            .status(StatusCodes.CREATED)
            .send(connection)
    })

    app.post('/:id', UpdateConnectionValueRequest, async (request) => {
        const connection = await connectionService(request.log).update({
            id: request.params.id,
            platformId: request.principal.platform.id,
            workspaceIds: [request.workspaceId],
            scope: ConnectionScope.WORKSPACE,
            request: {
                displayName: request.body.displayName,
                workspaceIds: null,
                metadata: request.body.metadata,
            },
        })
        return connection
    })

    app.get('/', ListConnectionsRequest, async (request): Promise<SeekPage<ConnectionWithoutSensitiveData>> => {
        const { displayName, connectorName, status, cursor, limit, scope } = request.query

        const connections = await connectionService(request.log).list({
            connectorName,
            displayName,
            status,
            scope,
            platformId: request.principal.platform.id,
            workspaceId: request.workspaceId,
            cursorRequest: cursor ?? null,
            limit: limit ?? DEFAULT_PAGE_SIZE,
            externalIds: undefined,
        })

        const connectionsWithoutSensitiveData: SeekPage<ConnectionWithoutSensitiveData> = {
            ...connections,
            data: connections.data.map(connectionService(request.log).removeSensitiveData),
        }
        wideEvent.audit(auditEvents.connectionListed({
            actor: auditEvents.actorFromPrincipal(request.principal),
            target: {
                type: 'workspace',
                id: request.workspaceId,
                platformId: request.principal.platform.id,
                connectionCount: connectionsWithoutSensitiveData.data.length,
            },
        }))
        return connectionsWithoutSensitiveData
    },
    )
    app.get('/:id', GetConnectionRequest, async (request): Promise<ConnectionWithoutSensitiveData> => {
        return connectionService(request.log).getOnePublicOrThrow({
            id: request.params.id,
            platformId: request.principal.platform.id,
            workspaceId: request.workspaceId,
        })
    })

    app.post('/:id/revalidate', RevalidateConnectionRequest, async (request): Promise<ConnectionWithoutSensitiveData> => {
        return connectionService(request.log).revalidate({
            id: request.params.id,
            platformId: request.principal.platform.id,
            workspaceId: request.workspaceId,
        })
    })

    app.get('/owners', ListConnectionOwnersRequest, async (request): Promise<SeekPage<ConnectionOwners>> => {
        const owners = await connectionService(request.log).getOwners({
            workspaceId: request.workspaceId,
            platformId: request.principal.platform.id,
        })
        return {
            data: owners,
            next: null,
            previous: null,
        }
    },
    )

    app.post('/replace', ReplaceConnectionsRequest, async (request, reply) => {
        const { sourceConnectionId, targetConnectionId, deleteSourceConnection, applyToPublishedVersions } = request.body
        await connectionService(request.log).replace({
            sourceConnectionId,
            targetConnectionId,
            workspaceId: request.workspaceId,
            platformId: request.principal.platform.id,
            userId: request.principal.id,
            deleteSourceConnection,
            applyToPublishedVersions,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.delete('/:id', DeleteConnectionRequest, async (request, reply): Promise<void> => {
        const connection = await connectionService(request.log).getOneOrThrowWithoutValue({
            id: request.params.id,
            platformId: request.principal.platform.id,
            workspaceId: request.workspaceId,
        })
        if (connection.scope === ConnectionScope.PLATFORM) {
            throw new PlatformError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'Platform connections must be deleted from the platform admin connections page',
                },
            })
        }
        await connectionService(request.log).delete({
            id: request.params.id,
            platformId: request.principal.platform.id,
            scope: ConnectionScope.WORKSPACE,
            workspaceId: request.workspaceId,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.CONNECTION_DELETED,
            data: {
                connection,
            },
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
    app.post('/oauth2/authorization-url', GetOAuth2AuthorizationUrlRequest, async (request) => {
        return oauth2Util(request.log).buildAuthorizationUrl({
            platformId: request.principal.platform.id,
            connectorName: request.body.connectorName,
            connectorVersion: request.body.connectorVersion,
            clientId: request.body.clientId,
            redirectUrl: request.body.redirectUrl,
            props: request.body.props,
            workspaceId: request.workspaceId,
            scopes: request.body.scopes,
        })
    })
    done()
}

const DEFAULT_PAGE_SIZE = 10


const UpsertConnectionRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_CONNECTION,
            {
                type: WorkspaceResourceType.BODY,
            },
        ),
    },
    schema: {
        tags: ['connections'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Upsert an app connection based on the app name',
        body: UpsertConnectionRequestBody,
        Response: {
            [StatusCodes.CREATED]: ConnectionWithoutSensitiveData,
        },
    },
}

const UpdateConnectionValueRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_CONNECTION,
            {
                type: WorkspaceResourceType.TABLE,
                tableName: ConnectionEntity,
            },
        ),
    },
    schema: {
        tags: ['connections'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Update an app connection value',
        body: UpdateConnectionValueRequestBody,
        params: z.object({
            id: ApId,
        }),
    },
}

const ReplaceConnectionsRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_CONNECTION,
            {
                type: WorkspaceResourceType.BODY,
            },
        ),
    },
    schema: {
        tags: ['connections'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Replace app connections',
        body: ReplaceConnectionsRequestBody,
        response: {
            [StatusCodes.NO_CONTENT]: z.never(),
        },
    },
}

const ListConnectionsRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.READ_CONNECTION,
            {
                type: WorkspaceResourceType.QUERY,
            },
        ),
    },
    schema: {
        tags: ['connections'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: ListConnectionsRequestQuery,
        description: 'List app connections',
        response: {
            [StatusCodes.OK]: SeekPage(ConnectionWithoutSensitiveData),
        },
    },
}
const GetConnectionRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.READ_CONNECTION,
            {
                type: WorkspaceResourceType.TABLE,
                tableName: ConnectionEntity,
            },
        ),
    },
    schema: {
        tags: ['connections'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Get an app connection by id',
        params: z.object({
            id: ApId,
        }),
        response: {
            [StatusCodes.OK]: ConnectionWithoutSensitiveData,
        },
    },
}

const RevalidateConnectionRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_CONNECTION,
            {
                type: WorkspaceResourceType.TABLE,
                tableName: ConnectionEntity,
            },
        ),
    },
    schema: {
        tags: ['connections'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Revalidate an app connection and refresh its runtime status',
        params: z.object({
            id: ApId,
        }),
        response: {
            [StatusCodes.OK]: ConnectionWithoutSensitiveData,
        },
    },
}

const ListConnectionOwnersRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.READ_CONNECTION,
            {
                type: WorkspaceResourceType.QUERY,
            },
        ),
    },
    schema: {
        querystring: ListConnectionOwnersRequestQuery,
        tags: ['connections'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'List app connection owners',
        response: {
            [StatusCodes.OK]: SeekPage(ConnectionOwners),
        },
    },
}

const DeleteConnectionRequest = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_CONNECTION,
            {
                type: WorkspaceResourceType.TABLE,
                tableName: ConnectionEntity,
            },
        ),
    },
    schema: {
        tags: ['connections'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Delete an app connection',
        params: z.object({
            id: ApId,
        }),
        response: {
            [StatusCodes.NO_CONTENT]: z.never(),
        },
    },
}

const GetOAuth2AuthorizationUrlRequest = {
    config: {
        security: securityAccess.publicPlatform(
            [PrincipalType.USER],
        ),
    },
    schema: {
        tags: ['connections'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Get OAuth2 authorization URL',
        body: GetOAuth2AuthorizationUrlRequestBody,
        response: {
            [StatusCodes.OK]: GetOAuth2AuthorizationUrlResponse,
        },
    },
}
