import { ConnectorMetadataModel, ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk'
import { FastifyBaseLogger } from 'fastify'
import { ConnectorMetadataSchema } from './metadata/connector-metadata-entity'

export async function resolveVisibility(_params: ResolveVisibilityParams): Promise<VisibilityPolicy | null> {
    return null
}

export type VisibilityPolicy = {
    isConnectorVisible(name: string): boolean
    filterConnectors(connectors: ConnectorMetadataSchema[]): ConnectorMetadataSchema[]
    filterComponents(summaries: ConnectorMetadataModelSummary[]): ConnectorMetadataModelSummary[]
    filterConnectorComponents(connector: ConnectorMetadataModel): ConnectorMetadataModel
}

type ResolveVisibilityParams = {
    tenantId: string | undefined
    projectId: string | undefined
    log: FastifyBaseLogger
}
