import { BranchExecutionType, WorkflowActionType } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { MoveBranchRequest } from '.'


const isIndexWithinBounds = (index: number, arrayLength: number) => index >= 0 && index < arrayLength
export function _moveBranch(workflowVersion: WorkflowVersion, request: MoveBranchRequest): WorkflowVersion {
    return workflowStructureUtil.transferWorkflow(workflowVersion, (stepToUpdate) => {
        if (stepToUpdate.name !== request.stepName || stepToUpdate.type !== WorkflowActionType.ROUTER) {
            return stepToUpdate
        }
        const routerStep = stepToUpdate
        if (!isIndexWithinBounds(request.sourceBranchIndex, routerStep.settings.branches.length) || !isIndexWithinBounds(request.targetBranchIndex, routerStep.settings.branches.length) || request.sourceBranchIndex === request.targetBranchIndex) {
            return stepToUpdate
        }
        if (routerStep.settings.branches[request.sourceBranchIndex].branchType === BranchExecutionType.FALLBACK || routerStep.settings.branches[request.targetBranchIndex].branchType === BranchExecutionType.FALLBACK) {
            return stepToUpdate
        }
        const sourceBranch = routerStep.settings.branches[request.sourceBranchIndex]
        routerStep.settings.branches.splice(request.sourceBranchIndex, 1)
        routerStep.settings.branches.splice(request.targetBranchIndex, 0, sourceBranch)
        const sourceBranchChildren = routerStep.children[request.sourceBranchIndex]
        routerStep.children.splice(request.sourceBranchIndex, 1)
        routerStep.children.splice(request.targetBranchIndex, 0, sourceBranchChildren)
        return routerStep
    })

}