import dayjs from 'dayjs'
import { isNil } from '@fema-ipaas/core-utils'
import { WorkflowAction } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { SampleDataSettings } from '../sample-data'
import { WorkflowTrigger, WorkflowTriggerType } from '../triggers/trigger'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { UpdateTriggerRequest } from '.'


function createTrigger(name: string, request: UpdateTriggerRequest, nextAction: WorkflowAction | undefined, existingSampleData: SampleDataSettings | undefined): WorkflowTrigger {
    const baseProperties = {
        displayName: request.displayName,
        name,
        valid: false,
        nextAction,
        lastUpdatedDate: dayjs().toISOString(),
    }
    let trigger: WorkflowTrigger
    switch (request.type) {
        case WorkflowTriggerType.EMPTY:
            trigger = {
                ...baseProperties,
                type: WorkflowTriggerType.EMPTY,
                settings: request.settings,
            }
            break
        case WorkflowTriggerType.CONNECTOR:
            trigger = {
                ...baseProperties,
                type: WorkflowTriggerType.CONNECTOR,
                settings: { ...request.settings, sampleData: existingSampleData },
            }
            break
    }
    const parseResult = WorkflowTrigger.safeParse(trigger)
    const valid = (isNil(request.valid) ? true : request.valid) && parseResult.success
    return {
        ...trigger,
        valid,
    }
}

function _updateTrigger(workflowVersion: WorkflowVersion, request: UpdateTriggerRequest): WorkflowVersion {
    const trigger = workflowStructureUtil.getStepOrThrow(request.name, workflowVersion.trigger)
    const existingSampleData = trigger.type === WorkflowTriggerType.CONNECTOR ? trigger.settings.sampleData : undefined
    const updatedTrigger = createTrigger(request.name, request, trigger.nextAction, existingSampleData)
    const next = workflowStructureUtil.transferWorkflow(workflowVersion, (parentStep) => {
        if (parentStep.name === request.name) {
            return updatedTrigger
        }
        return parentStep
    })
    return next
}

export { _updateTrigger }
