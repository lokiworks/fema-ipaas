import { WorkflowStatus } from '@fema-ipaas/shared'

export const webhookRunPolicy = {
    shouldExecute,
}

function shouldExecute({ workflowStatus, isTestDeployment, execute }: ShouldExecuteParams): boolean {
    if (!execute) {
        return false
    }
    return workflowStatus === WorkflowStatus.ENABLED || isTestDeployment
}

type ShouldExecuteParams = {
    workflowStatus: WorkflowStatus
    isTestDeployment: boolean
    execute: boolean
}
