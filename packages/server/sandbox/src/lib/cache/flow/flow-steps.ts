import { FlowActionType, flowStructureUtil, FlowTriggerType, FlowVersion, Step } from '@fema/shared'

export const flowSteps = {
    code: (flowVersion: FlowVersion): Step[] =>
        flowStructureUtil.getAllSteps(flowVersion.trigger)
            .filter((step) => step.type === FlowActionType.CODE),
    connector: (flowVersion: FlowVersion): Step[] =>
        flowStructureUtil.getAllSteps(flowVersion.trigger)
            .filter((step) => step.type === FlowActionType.CONNECTOR || step.type === FlowTriggerType.CONNECTOR),
}
