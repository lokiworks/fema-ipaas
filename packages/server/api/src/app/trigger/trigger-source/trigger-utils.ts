import { TriggerBase } from '@fema/connector-sdk'
import { ErrorCode, isNil, PlatformError, WorkspaceId } from '@fema/core-utils'
import { WorkflowTriggerType, WorkflowVersion } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { connectorMetadataService } from '../../connectors/metadata/connector-metadata-service'
import { workspaceService } from '../../workspace/workspace-service'

export const triggerUtils = (log: FastifyBaseLogger) => ({
    async getConnectorTriggerOrThrow({ workflowVersion, workspaceId }: GetConnectorTriggerOrThrowParams): Promise<TriggerBase> {

        const connectorTrigger = await this.getConnectorTrigger({
            workflowVersion,
            workspaceId,

        })
        if (isNil(connectorTrigger)) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'connector_trigger',
                    entityId: workflowVersion.trigger.settings.triggerName,
                    message: `Trigger not found for connector ${workflowVersion.trigger.settings.connectorName}@${workflowVersion.trigger.settings.connectorVersion}`,
                    extra: {
                        connectorName: workflowVersion.trigger.settings.connectorName,
                        connectorVersion: workflowVersion.trigger.settings.connectorVersion,
                        triggerName: workflowVersion.trigger.settings.triggerName,
                    },
                },
            })
        }
        return connectorTrigger
    },
    async getConnectorTrigger({ workflowVersion, workspaceId }: GetConnectorTriggerOrThrowParams): Promise<TriggerBase | null> {
        if (workflowVersion.trigger.type !== WorkflowTriggerType.CONNECTOR) {
            return null
        }
        const { connectorName, connectorVersion, triggerName } = workflowVersion.trigger.settings
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
    workflowVersion: WorkflowVersion
    workspaceId: WorkspaceId
}