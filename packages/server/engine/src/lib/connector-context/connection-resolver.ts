import { ContextVersion } from '@fema/connector-sdk'
import { Connection, ConnectionConnectorMismatchError, ConnectionExpiredError, ConnectionLoadingError, ConnectionNotFoundError, ConnectionStatus, ConnectionType, ConnectionValue, ExecutionError, FetchError } from '@fema/shared'
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
                const connection: Connection = await response.json()
                if (connection.status === ConnectionStatus.ERROR) {
                    throw new ConnectionExpiredError(externalId)
                }
                assertConnectorBinding({ externalId, connectorName, connection })
                return getConnectionValue(connection, contextVersion)
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

const getConnectionValue = (connection: Connection, contextVersion: ContextVersion | undefined): ConnectionValue => {
    switch (contextVersion) {
        case undefined:
            return makeConnectionValueCompatibleWithContextV0(connection)
        case ContextVersion.V1:
            return connection.value
        default:
            return connection.value
    }
}

function makeConnectionValueCompatibleWithContextV0(connection: Connection): ConnectionValue {
    switch (connection.value.type) {
        case ConnectionType.SECRET_TEXT:
            return connection.value.secret_text as unknown as ConnectionValue

        case ConnectionType.CUSTOM_AUTH:
            return connection.value.props as unknown as ConnectionValue
        default:
            return connection.value as unknown as ConnectionValue
    }
}

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
    connection: Connection
}

type HandleFetchErrorParams = {
    url: string
    cause: unknown
}
