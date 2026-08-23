import { WorkflowAction } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil } from '../util/workflow-structure-util'

export function _getActionsForCopy(selectedSteps: string[], workflowVersion: WorkflowVersion): WorkflowAction[] {
    const allSteps = workflowStructureUtil.getAllSteps(workflowVersion.trigger)
    const actionsToCopy = selectedSteps
        .map((stepName) => workflowStructureUtil.getStepOrThrow(stepName, workflowVersion.trigger))
        .filter((step) => workflowStructureUtil.isAction(step.type))
    return actionsToCopy
        .filter(step => !actionsToCopy.filter(parent => parent.name !== step.name).some(parent => workflowStructureUtil.isChildOf(parent, step.name)))
        .map(step => {
            const clonedAction = JSON.parse(JSON.stringify(step))
            clonedAction.nextAction = undefined
            return clonedAction
        })
        .sort((a, b) => allSteps.indexOf(a) - allSteps.indexOf(b)) as WorkflowAction[]
}
