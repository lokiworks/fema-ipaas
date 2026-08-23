import { isNil } from '@fema/core-utils'
import { WorkflowAction, WorkflowActionType } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { WorkflowTrigger, WorkflowTriggerType } from '../triggers/trigger'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { AddNoteRequest, DeleteNoteRequest, WorkflowOperationRequest, WorkflowOperationType, ImportWorkflowRequest, StepLocationRelativeToParent } from './index'

function createDeleteActionOperation(actionName: string): WorkflowOperationRequest {
    return {
        type: WorkflowOperationType.DELETE_ACTION,
        request: { names: [actionName] },
    }
}

function createUpdateTriggerOperation(trigger: WorkflowTrigger): WorkflowOperationRequest {
    return {
        type: WorkflowOperationType.UPDATE_TRIGGER,
        request: trigger,
    }
}

function createChangeNameOperation(displayName: string): WorkflowOperationRequest {
    return {
        type: WorkflowOperationType.CHANGE_NAME,
        request: { displayName },
    }
}

function _getImportOperationsForSteps(step: WorkflowAction | WorkflowTrigger | undefined): WorkflowOperationRequest[] {
    const steps: WorkflowOperationRequest[] = []
    while (step) {
        if (step.nextAction) {
            steps.push({
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: step?.name ?? '',
                    stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
                    action: removeAnySubsequentAction(step.nextAction),
                },
            })
        }
        switch (step.type) {
            case WorkflowActionType.LOOP_ON_ITEMS: {
                if (step.firstLoopAction) {
                    steps.push({
                        type: WorkflowOperationType.ADD_ACTION,
                        request: {
                            parentStep: step.name,
                            stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_LOOP,
                            action: removeAnySubsequentAction(step.firstLoopAction),
                        },
                    })
                    steps.push(..._getImportOperationsForSteps(step.firstLoopAction))
                }
                break
            }
            case WorkflowActionType.ROUTER: {
                if (step.children) {
                    for (const [index, child] of step.children.entries()) {
                        if (!isNil(child)) {
                            steps.push({
                                type: WorkflowOperationType.ADD_ACTION,
                                request: {
                                    parentStep: step.name,
                                    stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH,
                                    branchIndex: index,
                                    action: removeAnySubsequentAction(child),
                                },
                            })
                            steps.push(..._getImportOperationsForSteps(child))
                        }
                    }
                }
                break
            }
            case WorkflowActionType.CODE:
            case WorkflowActionType.CONNECTOR: {
                const branches = step.continueOnFailureBranches
                if (!isNil(branches?.onSuccess)) {
                    steps.push({
                        type: WorkflowOperationType.ADD_ACTION,
                        request: {
                            parentStep: step.name,
                            stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH,
                            action: removeAnySubsequentAction(branches.onSuccess),
                        },
                    })
                    steps.push(..._getImportOperationsForSteps(branches.onSuccess))
                }
                if (!isNil(branches?.onFailure)) {
                    steps.push({
                        type: WorkflowOperationType.ADD_ACTION,
                        request: {
                            parentStep: step.name,
                            stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH,
                            action: removeAnySubsequentAction(branches.onFailure),
                        },
                    })
                    steps.push(..._getImportOperationsForSteps(branches.onFailure))
                }
                break
            }
            case WorkflowTriggerType.CONNECTOR:
            case WorkflowTriggerType.EMPTY: {
                break
            }
        }

        step = step.nextAction
    }
    return steps
}

function _getImportOperationsForNotes(workflowVersion: WorkflowVersion, request: ImportWorkflowRequest): WorkflowOperationRequest[] { 

    const deleteOperations: DeleteNoteRequest[] = workflowVersion.notes.map(note => ({
        id: note.id,
    }))
    const addOperations: AddNoteRequest[] = (request.notes || []).map(note => (note))

    const operations: WorkflowOperationRequest[] = [
        ...deleteOperations.map(operation => ({
            type: WorkflowOperationType.DELETE_NOTE as const,
            request: operation,
        })),
        ...addOperations.map(operation => ({
            type: WorkflowOperationType.ADD_NOTE as const,
            request: operation,
        })),
    ]
    return operations
}
function removeAnySubsequentAction(action: WorkflowAction): WorkflowAction {
    const clonedAction: WorkflowAction = JSON.parse(JSON.stringify(action))
    switch (clonedAction.type) {
        case WorkflowActionType.ROUTER: {
            clonedAction.children = clonedAction.children.map((child: WorkflowAction | null) => {
                if (isNil(child)) {
                    return null
                }
                return removeAnySubsequentAction(child)
            })
            break
        }
        case WorkflowActionType.LOOP_ON_ITEMS: {
            delete clonedAction.firstLoopAction
            break
        }
        case WorkflowActionType.CONNECTOR:
        case WorkflowActionType.CODE: {
            delete clonedAction.continueOnFailureBranches
            break
        }
    }
    delete clonedAction.nextAction
    return clonedAction
}

function _importWorkflow(workflowVersion: WorkflowVersion, request: ImportWorkflowRequest): WorkflowOperationRequest[] {
    const existingActions = workflowStructureUtil.getAllNextActionsWithoutChildren(workflowVersion.trigger)

    const deleteOperations = existingActions.map(action =>
        createDeleteActionOperation(action.name),
    )

    const importOperations = _getImportOperationsForSteps(request.trigger)
 
    return [
        createChangeNameOperation(request.displayName),
        ...deleteOperations,
        createUpdateTriggerOperation(request.trigger),
        ...importOperations,
        ..._getImportOperationsForNotes(workflowVersion, request),
    ]
}

export { _importWorkflow, _getImportOperationsForSteps as _getImportOperations }