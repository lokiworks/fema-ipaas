import { ContextVersion } from '@fema-ipaas/connector-sdk'
import { ConnectionConnectorMismatchError, ConnectionExpiredError, ConnectionLoadingError, ConnectionNotFoundError, ConnectionStatus, ConnectionType, ConnectionValue, ExecutionError, FetchError } from '@fema-ipaas/shared'
import { z } from 'zod'
import { retryFetch } from '../api/retry-fetch'
import { utils } from '../utils'

export const createConnectionResolver = ({ projectId, engineToken, apiUrl, contextVersion, connectorName }: CreateConnectionResolverParams): ConnectionResolver => {
    return {
        async obtain(externalId: string): Promise<ConnectionValue> {
            const url = `${apiUrl}v1/worker/connections/${encodeURIComponent(externalId)}?projectId=${projectId}`

            const { data: connectionValue, error: connectionValueError } = await utils.tryCatchAndThrowOnEngineError((async () => {
                const response = await retryFetch(url, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${engineToken}`,
                    },
                })

                if (!response.ok) {
                    return handleResponseError({
                        externalId,
                        httpStatus: response.status,
                    })
                }
                const connection = CONNECTION_RESPONSE.parse(await response.json())
                if (UNUSABLE_CONNECTION_STATUSES.includes(connection.status)) {
                    throw new ConnectionExpiredError(externalId)
                }
                assertConnectorBinding({ externalId, connectorName, connection })
                return getConnectionValue({ connection, contextVersion })
            }))

            if (connectionValueError) {
                if (connectionValueError instanceof ExecutionError) {
                    throw connectionValueError
                }
                return handleFetchError({
                    url,
                    cause: connectionValueError,
                })
            }
            return connectionValue
        },
    }
}

const UNUSABLE_CONNECTION_STATUSES: ConnectionStatus[] = [ConnectionStatus.ERROR, ConnectionStatus.EXPIRED]

const handleResponseError = ({ externalId, httpStatus }: HandleResponseErrorParams): never => {
    if (httpStatus === 404) {
        throw new ConnectionNotFoundError(externalId)
    }

    throw new ConnectionLoadingError(externalId)
}

const assertConnectorBinding = ({ externalId, connectorName, connection }: AssertConnectorBindingParams): void => {
    const enforced = process.env.FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING === 'true'
    if (!enforced || connection.connectorName === connectorName) {
        return
    }
    throw new ConnectionConnectorMismatchError(externalId, connectorName)
}

const handleFetchError = ({ url, cause }: HandleFetchErrorParams): never => {
    throw new FetchError(url, cause)
}

const getConnectionValue = ({ connection, contextVersion }: { connection: ResolvedConnection, contextVersion: ContextVersion | undefined }): ConnectionValue => {
    switch (contextVersion) {
        case undefined:
            return makeConnectionValueCompatibleWithContextV0(connection)
        case ContextVersion.V1:
            return connection.value
        default:
            return connection.value
    }
}

function makeConnectionValueCompatibleWithContextV0(connection: ResolvedConnection): ConnectionValue {
    switch (connection.value.type) {
        case ConnectionType.SECRET_TEXT:
            return connection.value.secret_text as unknown as ConnectionValue

        case ConnectionType.CUSTOM_AUTH:
            return connection.value.props as unknown as ConnectionValue
        default:
            return connection.value as unknown as ConnectionValue
    }
}

const OAUTH_VALUE = {
    client_id: z.string(), token_type: z.string(), access_token: z.string(), claimed_at: z.number(),
    refresh_token: z.string(), scope: z.string(), token_url: z.string(), data: z.record(z.string(), z.unknown()),
    expires_in: z.number().optional(), props: z.record(z.string(), z.unknown()).optional(),
}
const CONNECTION_RESPONSE = z.object({
    connectorName: z.string(), status: z.enum(ConnectionStatus),
    value: z.discriminatedUnion('type', [
        z.looseObject({ type: z.literal(ConnectionType.SECRET_TEXT), secret_text: z.string() }),
        z.looseObject({ type: z.literal(ConnectionType.BASIC_AUTH), username: z.string(), password: z.string() }),
        z.looseObject({ type: z.literal(ConnectionType.CUSTOM_AUTH), props: z.record(z.string(), z.unknown()), access_token: z.string().optional(), token_refresh_at: z.number().optional() }),
        z.looseObject({ type: z.literal(ConnectionType.OIDC), props: z.record(z.string(), z.unknown()) }),
        z.looseObject({ type: z.literal(ConnectionType.NO_AUTH) }),
        z.looseObject({ ...OAUTH_VALUE, type: z.literal(ConnectionType.OAUTH2), client_secret: z.string(), redirect_url: z.string() }),
        z.looseObject({ ...OAUTH_VALUE, type: z.literal(ConnectionType.TENANT_OAUTH2), redirect_url: z.string() }),
        z.looseObject({ ...OAUTH_VALUE, type: z.literal(ConnectionType.CLOUD_OAUTH2) }),
    ]),
})

type ResolvedConnection = z.infer<typeof CONNECTION_RESPONSE>

type ConnectionResolver = {
    obtain(externalId: string): Promise<ConnectionValue>
}

type CreateConnectionResolverParams = {
    projectId: string
    apiUrl: string
    engineToken: string
    contextVersion: ContextVersion | undefined
    connectorName?: string
}

type HandleResponseErrorParams = {
    externalId: string
    httpStatus: number
}

type AssertConnectorBindingParams = {
    externalId: string
    connectorName: string | undefined
    connection: ResolvedConnection
}

type HandleFetchErrorParams = {
    url: string
    cause: unknown
}
