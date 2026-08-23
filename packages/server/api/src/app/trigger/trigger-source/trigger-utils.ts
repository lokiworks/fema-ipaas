import { TriggerBase } from '@fema/connector-sdk'
import { ErrorCode, isNil, PlatformError, ProjectId } from '@fema/core-utils'
import { FlowTriggerType, FlowVersion } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { connectorMetadataService } from '../../connectors/metadata/connector-metadata-service'
import { projectService } from '../../project/project-service'

export const triggerUtils = (log: FastifyBaseLogger) => ({
    async getConnectorTriggerOrThrow({ flowVersion, projectId }: GetConnectorTriggerOrThrowParams): Promise<TriggerBase> {

        const connectorTrigger = await this.getConnectorTrigger({
            flowVersion,
            projectId,

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
    async getConnectorTrigger({ flowVersion, projectId }: GetConnectorTriggerOrThrowParams): Promise<TriggerBase | null> {
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
            projectId,
        })
    },
    async getConnectorTriggerByName({ connectorName, connectorVersion, triggerName, projectId }: GetConnectorTriggerByNameParams): Promise<TriggerBase | null> {
        const platformId = await projectService(log).getPlatformId(projectId)
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
    projectId: ProjectId
}

type GetConnectorTriggerOrThrowParams = {
    flowVersion: FlowVersion
    projectId: ProjectId
}