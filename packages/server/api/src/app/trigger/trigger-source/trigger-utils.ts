import { TriggerBase } from '@fema-ipaas/connector-sdk'
import { ApplicationError, ErrorCode, isNil, ProjectId } from '@fema-ipaas/core-utils'
import { WorkflowTriggerType, WorkflowVersion } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { connectorMetadataService } from '../../connectors/metadata/connector-metadata-service'
import { projectService } from '../../project/project-service'

export const triggerUtils = (log: FastifyBaseLogger) => ({
    async getConnectorTriggerOrThrow({ workflowVersion, projectId }: GetConnectorTriggerOrThrowParams): Promise<TriggerBase> {

        const connectorTrigger = await this.getConnectorTrigger({
            workflowVersion,
            projectId,

        })
        if (isNil(connectorTrigger)) {
            throw new ApplicationError({
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
    async getConnectorTrigger({ workflowVersion, projectId }: GetConnectorTriggerOrThrowParams): Promise<TriggerBase | null> {
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
            projectId,
        })
    },
    async getConnectorTriggerByName({ connectorName, connectorVersion, triggerName, projectId }: GetConnectorTriggerByNameParams): Promise<TriggerBase | null> {
        const tenantId = await projectService(log).getTenantId(projectId)
        const connector = await connectorMetadataService(log).get({
            tenantId,
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
    workflowVersion: WorkflowVersion
    projectId: ProjectId
}