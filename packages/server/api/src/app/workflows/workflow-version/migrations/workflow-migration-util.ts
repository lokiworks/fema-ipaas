import { WorkflowActionType, workflowStructureUtil, WorkflowTriggerType, WorkflowVersion } from '@fema-ipaas/shared'

export const workflowMigrationUtil = {
    pinConnectorToVersion(workflowVersion: WorkflowVersion, connectorName: string, connectorVersion: string) {
        const newVersion = workflowStructureUtil.transferWorkflow(workflowVersion, (step) => {
            if ((step.type === WorkflowActionType.CONNECTOR || step.type === WorkflowTriggerType.CONNECTOR) && step.settings.connectorName === connectorName) {
                return {
                    ...step,
                    settings: {
                        ...step.settings,
                        connectorVersion,
                    },
                }
            }
            return step
        })
        return newVersion
    },
}