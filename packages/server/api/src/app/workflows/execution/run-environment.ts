import { isNil } from '@fema-ipaas/core-utils'
import { RunEnvironment } from '@fema-ipaas/shared'

function forManualTrigger({ workflowVersionId, publishedVersionId }: ForManualTriggerParams): RunEnvironment {
    const isPublishedVersion = !isNil(publishedVersionId) && publishedVersionId === workflowVersionId
    return isPublishedVersion ? RunEnvironment.PRODUCTION : RunEnvironment.TESTING
}

export const runEnvironmentUtils = {
    forManualTrigger,
}

type ForManualTriggerParams = {
    workflowVersionId: string
    publishedVersionId: string | null | undefined
}
