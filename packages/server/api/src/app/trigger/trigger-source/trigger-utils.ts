import { TriggerBase } from '@fema/connector-sdk'
import { ErrorCode, isNil, PlatformError, WorkspaceId } from '@fema/core-utils'
import { FlowTriggerType, FlowVersion } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { connectorMetadataService } from '../../connectors/metadata/connector-metadata-service'
import { workspaceService } from '../../workspace/workspace-service'

export const triggerUtils = (log: FastifyBaseLogger) => ({
    async getConnectorTriggerOrThrow({ flowVersion, workspaceId }: GetConnectorTriggerOrThrowParams): Promise<TriggerBase> {

        const connectorTrigger = await this.getConnectorTrigger({
            flowVersion,
            workspaceId,

        })
        if (isNil(connectorTrigger)) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'connector_trigger',
                    entityId: flowVersion.trigger.settings.triggerName,
                    message: `Trigger not found for connector ${flowVersion.trigger.settings.connectorName}@${flowVersion.trigger.settings.connectorVersion}`,
                    extra: {
                        connectorName: flowVersion.trigger.settings.connectorName,
                        connectorVersion: flowVersion.trigger.settings.connectorVersion,
                        triggerName: flowVersion.trigger.settings.triggerName,
                    },
                },
            })
        }
        return connectorTrigger
    },
    async getConnectorTrigger({ flowVersion, workspaceId }: GetConnectorTriggerOrThrowParams): Promise<TriggerBase | null> {
        if (flowVersion.trigger.type !== FlowTriggerType.CONNECTOR) {
            return null
        }
        const { connectorName, connectorVersion, triggerName } = flowVersion.trigger.settings
        if (isNil(triggerName)) {
            return null
        }
        return this.getConnectorTriggerByName({
            connectorName,
            connectorVersion,
            triggerName,
            workspaceId,
        })
    },
    async getConnectorTriggerByName({ connectorName, connectorVersion, triggerName, workspaceId }: GetConnectorTriggerByNameParams): Promise<TriggerBase | null> {
        const platformId = await workspaceService(log).getPlatformId(workspaceId)
        const connector = await connectorMetadataService(log).get({
            platformId,
            name: connectorName,
            version: connectorVersion,
        })
        if (isNil(connector) || isNil(triggerName)) {
            return null
        }
        const connectorTrigger = connector.triggers[triggerName]
        return connectorTrigger
    },
})

type GetConnectorTriggerByNameParams = {
    connectorName: string
    connectorVersion: string
    triggerName: string
    workspaceId: WorkspaceId
}

type GetConnectorTriggerOrThrowParams = {
    flowVersion: FlowVersion
    workspaceId: WorkspaceId
}