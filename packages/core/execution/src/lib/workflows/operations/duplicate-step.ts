import { isNil } from '@fema-ipaas/core-utils'
import { BranchExecutionType, WorkflowAction, RouterAction } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { addActionUtils } from './add-action-util'
import { _getImportOperations } from './import-workflow'
import { WorkflowOperationRequest, WorkflowOperationType, StepLocationRelativeToParent } from '.'


function _duplicateStep(stepName: string, workflowVersion: WorkflowVersion): WorkflowOperationRequest[] {
    const clonedAction: WorkflowAction = JSON.parse(JSON.stringify(workflowStructureUtil.getActionOrThrow(stepName, workflowVersion.trigger)))
    const clonedActionWithoutNextAction = {
        ...clonedAction,
        nextAction: undefined,
    }
    const oldNameToNewName = addActionUtils.mapToNewNames(workflowVersion, [clonedActionWithoutNextAction])
    const clonedSubflow = workflowStructureUtil.transferStep(clonedActionWithoutNextAction, (step: WorkflowAction) => {
        return addActionUtils.clone(step, oldNameToNewName)
    })
    const importOperations = _getImportOperations(clonedSubflow)

    return [
        {
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                action: clonedSubflow as WorkflowAction,
                parentStep: stepName,
                stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
            },
        },
        ...importOperations,
    ]
}

function _duplicateBranch(
    routerName: string,
    childIndex: number,
    workflowVersion: WorkflowVersion,
): WorkflowOperationRequest[] {
    const router = workflowStructureUtil.getActionOrThrow(routerName, workflowVersion.trigger)
    const clonedRouter: RouterAction = JSON.parse(JSON.stringify(router))
    const operations: WorkflowOperationRequest[] = [{
        type: WorkflowOperationType.ADD_BRANCH,
        request: {
            branchName: `${clonedRouter.settings.branches[childIndex].branchName} Copy`,
            branchIndex: childIndex + 1,
            stepName: routerName,
            conditions: clonedRouter.settings.branches[childIndex].branchType === BranchExecutionType.CONDITION ? clonedRouter.settings.branches[childIndex].conditions : undefined,
        },
    }]

    const childRouter = clonedRouter.children[childIndex]
    if (!isNil(childRouter)) {
        const oldNameToNewName = addActionUtils.mapToNewNames(workflowVersion, [childRouter])
        const clonedSubflow = workflowStructureUtil.transferStep(childRouter, (step: WorkflowAction) => {
            return addActionUtils.clone(step, oldNameToNewName)
        })
        const importOperations = _getImportOperations(clonedSubflow)
        operations.push({
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH,
                action: clonedSubflow as WorkflowAction,
                parentStep: routerName,
                branchIndex: childIndex + 1,
            },
        })
        operations.push(...importOperations)
    }

    return operations
}

export { _duplicateStep, _duplicateBranch }