import { FlowTriggerType, FlowVersion } from '@fema/shared'
import deepEqual from 'deep-equal'

function isSameTrigger({ published, toPublish }: IsSameTriggerParams): boolean {
    return published.type === FlowTriggerType.CONNECTOR
        && toPublish.type === FlowTriggerType.CONNECTOR
        && published.settings.connectorName === toPublish.settings.connectorName
        && published.settings.triggerName === toPublish.settings.triggerName
        && deepEqual(published.settings.input, toPublish.settings.input)
}

export const flowPublishUtils = { isSameTrigger }

type IsSameTriggerParams = {
    published: FlowVersion['trigger']
    toPublish: FlowVersion['trigger']
}
