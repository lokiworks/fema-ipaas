import { insertAt } from '@fema-ipaas/core-utils'
import { WorkflowActionType, RouterAction } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { AddBranchRequest } from '.'


function _addBranch(workflowVersion: WorkflowVersion, request: AddBranchRequest): WorkflowVersion {
    return workflowStructureUtil.transferWorkflow(workflowVersion, (parentStep) => {
        if (parentStep.name !== request.stepName || parentStep.type !== WorkflowActionType.ROUTER) {
            return parentStep
        }
        const routerAction = parentStep as RouterAction
        return {
            ...routerAction,
            settings: {
                ...routerAction.settings,
                branches: insertAt(routerAction.settings.branches, request.branchIndex, workflowStructureUtil.createBranch(request.branchName, request.conditions)),
            },
            children: insertAt(routerAction.children, request.branchIndex, null),
        }
    })
}


export { _addBranch }