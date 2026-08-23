import { WorkflowAction, WorkflowActionType } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { DeleteActionRequest } from './index'

function _deleteAction(
    workflowVersion: WorkflowVersion,
    request: DeleteActionRequest,
): WorkflowVersion {
    let clonedVersion: WorkflowVersion = workflowVersion
    for (const name of request.names) {
        clonedVersion = workflowStructureUtil.transferWorkflow(clonedVersion, (parentStep) => {
            if (parentStep.nextAction && parentStep.nextAction.name === name) {
                const stepToUpdate: WorkflowAction = parentStep.nextAction
                parentStep.nextAction = stepToUpdate.nextAction
            }
            switch (parentStep.type) {
                case WorkflowActionType.LOOP_ON_ITEMS: {
                    if (
                        parentStep.firstLoopAction &&
                        parentStep.firstLoopAction.name === name
                    ) {
                        const stepToUpdate: WorkflowAction = parentStep.firstLoopAction
                        parentStep.firstLoopAction = stepToUpdate.nextAction
                    }
                    break
                }
                case WorkflowActionType.ROUTER: {
                    parentStep.children = parentStep.children.map((child) => {
                        if (child && child.name === name) {
                            return child.nextAction ?? null
                        }
                        return child
                    })
                    break
                }
                case WorkflowActionType.CODE:
                case WorkflowActionType.CONNECTOR: {
                    const branches = parentStep.continueOnFailureBranches
                    if (branches?.onSuccess?.name === name) {
                        branches.onSuccess = branches.onSuccess.nextAction
                    }
                    if (branches?.onFailure?.name === name) {
                        branches.onFailure = branches.onFailure.nextAction
                    }
                    break
                }
                default:
                    break
            }
            return parentStep
        })
    }
    return clonedVersion
}

export { _deleteAction }