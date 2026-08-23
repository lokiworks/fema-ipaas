import { FlowActionType, flowStructureUtil, FlowTriggerType, FlowVersion } from '@fema/shared'

export const flowMigrationUtil = {
    pinConnectorToVersion(flowVersion: FlowVersion, connectorName: string, connectorVersion: string) {
        const newVersion = flowStructureUtil.transferFlow(flowVersion, (step) => {
            if ((step.type === FlowActionType.CONNECTOR || step.type === FlowTriggerType.CONNECTOR) && step.settings.connectorName === connectorName) {
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