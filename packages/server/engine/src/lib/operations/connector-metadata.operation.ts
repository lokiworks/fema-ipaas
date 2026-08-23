import path from 'path'
import { ConnectorMetadata, connectorTranslation } from '@fema/connector-sdk'
import {
    EngineResponse,
    EngineResponseStatus,
    ExecuteExtractConnectorMetadataOperation,
} from '@fema/shared'
import { connectorPath } from '../core/connector/connector-path'
import { connectorRunner } from '../core/connector/connector-runner'
import { EngineConstants } from '../handler/context/engine-constants'

export const connectorMetadataOperation = {
    extract: async (operation: ExecuteExtractConnectorMetadataOperation): Promise<EngineResponse<ConnectorMetadata>>  => {
        const connector = {
            connectorName: operation.connectorName,
            connectorVersion: operation.connectorVersion,
            devConnectors: EngineConstants.DEV_CONNECTORS,
        }
        const { metadata } = await connectorRunner.describe(connector)
        const entryPath = await connectorPath.resolve(connector)
        const i18n = await connectorTranslation.initializeI18n(path.dirname(path.dirname(entryPath)))
        return {
            status: EngineResponseStatus.OK,
            response: {
                ...metadata,
                name: operation.connectorName,
                version: operation.connectorVersion,
                i18n,
            },
        }
    },
}
