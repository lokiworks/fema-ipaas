import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { _getImportOperations } from './import-workflow'
import { WorkflowOperationRequest, WorkflowOperationType, MoveActionRequest } from './index'


export function _moveAction(workflowVersion: WorkflowVersion, request: MoveActionRequest): WorkflowOperationRequest[] {
    const sourceStep = workflowStructureUtil.getActionOrThrow(request.name, workflowVersion.trigger)
    workflowStructureUtil.getStepOrThrow(request.newParentStep, workflowVersion.trigger)
    const sourceStepWithoutNextAction = {
        ...sourceStep,
        nextAction: undefined,
    }
    const deleteOperations: WorkflowOperationRequest[] = [
        {
            type: WorkflowOperationType.DELETE_ACTION,
            request: {
                names: [request.name],
            },
        },
    ]
    const addOperations: WorkflowOperationRequest[] = [
        {
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                action: sourceStepWithoutNextAction,
                parentStep: request.newParentStep,
                stepLocationRelativeToParent: request.stepLocationRelativeToNewParent,
                branchIndex: request.branchIndex,
            },
        },
        ..._getImportOperations(sourceStepWithoutNextAction),
    ]
    return [
        ...deleteOperations,
        ...addOperations,
    ]
}