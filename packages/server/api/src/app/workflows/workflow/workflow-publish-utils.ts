import { WorkflowTriggerType, WorkflowVersion } from '@fema/shared'
import deepEqual from 'deep-equal'

function isSameTrigger({ published, toPublish }: IsSameTriggerParams): boolean {
    return published.type === WorkflowTriggerType.CONNECTOR
        && toPublish.type === WorkflowTriggerType.CONNECTOR
        && published.settings.connectorName === toPublish.settings.connectorName
        && published.settings.triggerName === toPublish.settings.triggerName
        && deepEqual(published.settings.input, toPublish.settings.input)
}

export const workflowPublishUtils = { isSameTrigger }

type IsSameTriggerParams = {
    published: WorkflowVersion['trigger']
    toPublish: WorkflowVersion['trigger']
}
