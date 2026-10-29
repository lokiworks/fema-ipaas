import { ConnectorMetadata, PropertyType } from '@fema-ipaas/connector-sdk'
import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { ConnectionPrefill, ConnectionType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { connectorMetadataService } from '../../connectors/metadata/connector-metadata-service'
import { connectionsRepo } from './connection-service'
import { connectionHandler } from './connection.handler'

export const connectionPrefillService = (log: FastifyBaseLogger) => ({
    async get({ id, tenantId }: GetParams): Promise<ConnectionPrefill> {
        const row = await connectionsRepo().findOneBy({ id, tenantId })
        if (isNil(row)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'Connection', entityId: id },
            })
        }
        const { value } = await connectionHandler(log).decryptConnection(row)
        if (value.type === ConnectionType.BASIC_AUTH) {
            return { props: {}, username: value.username }
        }
        if (value.type !== ConnectionType.CUSTOM_AUTH) {
            return EMPTY_PREFILL
        }
        const metadata = await connectorMetadataService(log).getOrThrow({
            name: row.connectorName,
            version: row.connectorVersion,
            tenantId,
        })
        return {
            props: publicProps({ values: value.props, definitions: customAuthDefinitions(metadata.auth) }),
            username: null,
        }
    },
})

function customAuthDefinitions(auth: ConnectorMetadata['auth']): Record<string, PropertyType> {
    const candidates = Array.isArray(auth) ? auth : isNil(auth) ? [] : [auth]
    const custom = candidates.find((candidate) => candidate.type === PropertyType.CUSTOM_AUTH)
    if (isNil(custom) || custom.type !== PropertyType.CUSTOM_AUTH) {
        return {}
    }
    return Object.fromEntries(Object.entries(custom.props).flatMap(([key, property]) => {
        const type = propertyTypeOf(property)
        return isNil(type) ? [] : [[key, type]]
    }))
}

function propertyTypeOf(property: unknown): PropertyType | null {
    if (typeof property !== 'object' || property === null || !('type' in property)) {
        return null
    }
    return Object.values(PropertyType).find((type) => type === property.type) ?? null
}

function publicProps({ values, definitions }: PublicPropsParams): ConnectionPrefill['props'] {
    return Object.fromEntries(
        Object.entries(values).flatMap(([key, value]) => {
            const type = definitions[key]
            if (isNil(type) || !PUBLIC_PROPERTY_TYPES.includes(type)) {
                return []
            }
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                return [[key, value]]
            }
            return []
        }),
    )
}

const PUBLIC_PROPERTY_TYPES: PropertyType[] = [
    PropertyType.SHORT_TEXT,
    PropertyType.LONG_TEXT,
    PropertyType.NUMBER,
    PropertyType.CHECKBOX,
    PropertyType.STATIC_DROPDOWN,
]

const EMPTY_PREFILL: ConnectionPrefill = { props: {}, username: null }

export const connectionPrefillUtils = {
    publicProps,
}

type GetParams = {
    id: string
    tenantId: string
}

type PublicPropsParams = {
    values: Record<string, unknown>
    definitions: Record<string, PropertyType>
}
