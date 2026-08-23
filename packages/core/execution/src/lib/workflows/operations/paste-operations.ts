import { WorkflowAction } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { addActionUtils } from './add-action-util'
import { _getImportOperations } from './import-workflow'
import { WorkflowOperationRequest, WorkflowOperationType, StepLocationRelativeToParent } from './index'


export type InsideBranchPasteLocation = {
    branchIndex: number
    stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH
    parentStepName: string
}

export type OutsideBranchPasteLocation = {
    parentStepName: string
    stepLocationRelativeToParent:
    | StepLocationRelativeToParent.AFTER
    | StepLocationRelativeToParent.INSIDE_LOOP
    | StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH
    | StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH
}

export type PasteLocation = InsideBranchPasteLocation | OutsideBranchPasteLocation

export const _getOperationsForPaste = (
    actions: WorkflowAction[],
    workflowVersion: WorkflowVersion,
    pastingDetails: PasteLocation,
) => {
    const newNamesMap = addActionUtils.mapToNewNames(workflowVersion, actions)
    const clonedActions: WorkflowAction[] = actions.map(action => workflowStructureUtil.transferStep(action, (step: WorkflowAction) => {
        return addActionUtils.clone(step, newNamesMap)
    }) as WorkflowAction)
    const operations: WorkflowOperationRequest[] = []
    for (let i = 0; i < clonedActions.length; i++) {
        if (i === 0) {
            operations.push({
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    action: clonedActions[i],
                    parentStep: pastingDetails.parentStepName,
                    stepLocationRelativeToParent: pastingDetails.stepLocationRelativeToParent,
                    branchIndex: pastingDetails.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_BRANCH ? pastingDetails.branchIndex : undefined,
                },
            })
        }
        else {
            operations.push({
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    action: clonedActions[i],
                    parentStep: clonedActions[i - 1].name,
                    stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
                },
            })
        }
        const importOperations = _getImportOperations(clonedActions[i])
        operations.push(...importOperations)
    }
    return operations
}
