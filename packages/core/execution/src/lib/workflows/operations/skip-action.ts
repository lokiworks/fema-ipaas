import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { SkipActionRequest } from '.'

export function _skipAction(workflowVersion: WorkflowVersion, request: SkipActionRequest): WorkflowVersion {
    return workflowStructureUtil.transferWorkflow(workflowVersion, (stepToUpdate) => {
        if (!request.names.includes(stepToUpdate.name)) {
            return stepToUpdate
        }
        return {
            ...stepToUpdate,
            skip: request.skip,
        }
    })
}