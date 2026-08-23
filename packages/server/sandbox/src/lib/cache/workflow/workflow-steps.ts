import { Step, WorkflowActionType, workflowStructureUtil, WorkflowTriggerType, WorkflowVersion } from '@fema-ipaas/shared'

export const workflowSteps = {
    code: (workflowVersion: WorkflowVersion): Step[] =>
        workflowStructureUtil.getAllSteps(workflowVersion.trigger)
            .filter((step) => step.type === WorkflowActionType.CODE),
    connector: (workflowVersion: WorkflowVersion): Step[] =>
        workflowStructureUtil.getAllSteps(workflowVersion.trigger)
            .filter((step) => step.type === WorkflowActionType.CONNECTOR || step.type === WorkflowTriggerType.CONNECTOR),
}
