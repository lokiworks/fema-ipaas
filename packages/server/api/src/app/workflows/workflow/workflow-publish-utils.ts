import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { WorkflowTriggerType, workflowStructureUtil, WorkflowVersion } from '@fema-ipaas/shared'
import deepEqual from 'deep-equal'

function isSameTrigger({ published, toPublish }: IsSameTriggerParams): boolean {
    return published.type === WorkflowTriggerType.CONNECTOR
        && toPublish.type === WorkflowTriggerType.CONNECTOR
        && published.settings.connectorName === toPublish.settings.connectorName
        && published.settings.triggerName === toPublish.settings.triggerName
        && deepEqual(published.settings.input, toPublish.settings.input)
}

function assertNoPendingReview({ version }: { version: WorkflowVersion }): void {
    const pending = workflowStructureUtil.getAllSteps(version.trigger)
        .filter((step) => step.type !== WorkflowTriggerType.EMPTY && step.settings.pendingReview === true)
        .map((step) => step.displayName)
    if (pending.length > 0) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: `Confirm every AI-generated step before publishing. Not confirmed yet: ${pending.join(', ')}` },
        })
    }
}

export const workflowPublishUtils = { isSameTrigger, assertNoPendingReview }

type IsSameTriggerParams = {
    published: WorkflowVersion['trigger']
    toPublish: WorkflowVersion['trigger']
}
