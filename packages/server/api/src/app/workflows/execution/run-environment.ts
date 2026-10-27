import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { RunEnvironment, WorkflowStatus } from '@fema-ipaas/shared'

function forManualTrigger({ workflowVersionId, publishedVersionId }: ForManualTriggerParams): RunEnvironment {
    const isPublishedVersion = !isNil(publishedVersionId) && publishedVersionId === workflowVersionId
    return isPublishedVersion ? RunEnvironment.PRODUCTION : RunEnvironment.TESTING
}

function assertManualTriggerAllowed({ workflowVersionId, publishedVersionId, workflowStatus }: AssertManualTriggerAllowedParams): void {
    const isPublishedVersion = !isNil(publishedVersionId) && publishedVersionId === workflowVersionId
    if (isPublishedVersion && workflowStatus !== WorkflowStatus.ENABLED) {
        throw new ApplicationError({
            code: ErrorCode.WORKFLOW_OPERATION_INVALID,
            params: {
                message: '工作流已停止，无法运行。请先启动工作流，或在调试模式下运行。',
            },
        })
    }
}

export const runEnvironmentUtils = {
    forManualTrigger,
    assertManualTriggerAllowed,
}

type ForManualTriggerParams = {
    workflowVersionId: string
    publishedVersionId: string | null | undefined
}

type AssertManualTriggerAllowedParams = ForManualTriggerParams & {
    workflowStatus: WorkflowStatus
}
