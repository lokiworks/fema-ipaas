import { FlowActionType } from '../actions/action'
import { FlowTrigger, FlowTriggerType } from '../triggers/trigger'
import { flowStructureUtil } from '../util/flow-structure-util'

export const flowConnectorUtil = {
    getExactVersion(connectorVersion: string): string {
        if (connectorVersion.startsWith('^') || connectorVersion.startsWith('~')) {
            return connectorVersion.slice(1)
        }
        return connectorVersion
    },
    getUsedConnectors(trigger: FlowTrigger): string[] {
        return flowStructureUtil.getAllSteps(trigger)
            .filter((step) => step.type === FlowActionType.CONNECTOR || step.type === FlowTriggerType.CONNECTOR)
            .map((step) => step.settings.connectorName)
    },
}
