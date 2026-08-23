import { ConnectorAuthProperty, getAuthPropertyForValue, PropertyType } from '@fema/connector-sdk'
import { isNil } from '@fema/core-utils'
import { ConnectionType, ConnectionValue, ConnectorPackage } from '@fema/shared'
import { EngineConstants } from '../../handler/context/engine-constants'
import { ConnectorDescription } from './connector-protocol'
import { ConnectorRef, connectorRunner } from './connector-runner'

export const connectorAuth = {
    callMethod: async ({ operation, authValueType, methodPath }: CallMethodParams): Promise<AuthCallResult> => {
        const connector: ConnectorRef = {
            connectorName: operation.connector.connectorName,
            connectorVersion: operation.connector.connectorVersion,
            devConnectors: EngineConstants.DEV_CONNECTORS,
        }
        const description = await connectorRunner.describe(connector)
        const selected = select({ description, authValueType })
        if (isNil(selected)) {
            return { called: false }
        }
        const path = [...selected.path, ...methodPath]
        if (!description.hasPath(path)) {
            return { called: false, property: selected.property }
        }
        const argument = argumentFor({ property: selected.property, value: operation.auth })
        if (isNil(argument)) {
            return { called: false, property: selected.property, mismatch: true }
        }
        const server = {
            apiUrl: operation.internalApiUrl.endsWith('/') ? operation.internalApiUrl : `${operation.internalApiUrl}/`,
            publicUrl: operation.publicApiUrl,
        }
        return {
            called: true,
            property: selected.property,
            result: (await connectorRunner.call({ connector, path, args: [{ auth: argument.argument, server }] })).result,
        }
    },
}

function select({ description, authValueType }: SelectParams): SelectedAuth | undefined {
    const auth = description.metadata.auth
    if (isNil(auth)) {
        return undefined
    }
    const property = getAuthPropertyForValue({ authValueType, connectorAuth: auth })
    if (isNil(property)) {
        return undefined
    }
    const index = Array.isArray(auth) ? auth.indexOf(property) : -1
    return {
        property,
        path: index === -1 ? ['auth'] : ['auth', String(index)],
    }
}

function argumentFor({ property, value }: ArgumentParams): { argument: unknown } | undefined {
    switch (property.type) {
        case PropertyType.OAUTH2:
            return [ConnectionType.OAUTH2, ConnectionType.CLOUD_OAUTH2, ConnectionType.PLATFORM_OAUTH2].includes(value.type) ? { argument: value } : undefined
        case PropertyType.BASIC_AUTH:
            return value.type === ConnectionType.BASIC_AUTH ? { argument: value } : undefined
        case PropertyType.SECRET_TEXT:
            return value.type === ConnectionType.SECRET_TEXT ? { argument: value.secret_text } : undefined
        case PropertyType.CUSTOM_AUTH:
            return value.type === ConnectionType.CUSTOM_AUTH ? { argument: value.props } : undefined
        case PropertyType.OIDC:
            return value.type === ConnectionType.OIDC ? { argument: value.props } : undefined
        default:
            return undefined
    }
}

type SelectParams = {
    description: ConnectorDescription
    authValueType: ConnectionType
}

type ArgumentParams = {
    property: ConnectorAuthProperty
    value: ConnectionValue
}

type SelectedAuth = {
    property: ConnectorAuthProperty
    path: string[]
}

type CallMethodParams = {
    operation: {
        connector: ConnectorPackage
        auth: ConnectionValue
        internalApiUrl: string
        publicApiUrl: string
    }
    authValueType: ConnectionType
    methodPath: string[]
}

export type AuthCallResult =
    | { called: false, property?: ConnectorAuthProperty, mismatch?: boolean }
    | { called: true, property: ConnectorAuthProperty, result: unknown }
