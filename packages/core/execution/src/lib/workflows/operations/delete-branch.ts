import { WorkflowActionType, ParallelAction, RouterAction } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { DeleteBranchRequest } from '.'

function _deleteBranch(workflowVersion: WorkflowVersion, request: DeleteBranchRequest): WorkflowVersion {
    return workflowStructureUtil.transferWorkflow(workflowVersion, (parentStep) => {
        if (parentStep.name === request.stepName && parentStep.type === WorkflowActionType.PARALLEL) {
            const parallelAction = parentStep as ParallelAction
            return {
                ...parallelAction,
                settings: {
                    ...parallelAction.settings,
                    branches: parallelAction.settings.branches.filter((_, index) => index !== request.branchIndex),
                },
                children: parallelAction.children.filter((_, index) => index !== request.branchIndex),
            }
        }
        if (parentStep.name !== request.stepName || parentStep.type !== WorkflowActionType.ROUTER) {
            return parentStep
        }
        const routerAction = parentStep as RouterAction
        return {
            ...routerAction,
            settings: {
                ...routerAction.settings,
                branches: routerAction.settings.branches.filter((_, index) => index !== request.branchIndex),
            },
            children: routerAction.children.filter((_, index) => index !== request.branchIndex),
        }
    })
}

export { _deleteBranch } 