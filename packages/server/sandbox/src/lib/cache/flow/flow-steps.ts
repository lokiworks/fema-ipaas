import { FlowActionType, flowStructureUtil, FlowTriggerType, FlowVersion, Step } from '@fema/shared'

export const flowSteps = {
    code: (flowVersion: FlowVersion): Step[] =>
        flowStructureUtil.getAllSteps(flowVersion.trigger)
            .filter((step) => step.type === FlowActionType.CODE),
    piece: (flowVersion: FlowVersion): Step[] =>
        flowStructureUtil.getAllSteps(flowVersion.trigger)
            .filter((step) => step.type === FlowActionType.PIECE || step.type === FlowTriggerType.PIECE),
}
