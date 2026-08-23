import { WorkflowActionType } from '../actions/action'
import { WorkflowTrigger, WorkflowTriggerType } from '../triggers/trigger'
import { workflowStructureUtil } from '../util/workflow-structure-util'

export const workflowConnectorUtil = {
    getExactVersion(connectorVersion: string): string {
        if (connectorVersion.startsWith('^') || connectorVersion.startsWith('~')) {
            return connectorVersion.slice(1)
        }
        return connectorVersion
    },
    getUsedConnectors(trigger: WorkflowTrigger): string[] {
        return workflowStructureUtil.getAllSteps(trigger)
            .filter((step) => step.type === WorkflowActionType.CONNECTOR || step.type === WorkflowTriggerType.CONNECTOR)
            .map((step) => step.settings.connectorName)
    },
}
