import { isNil } from '@fema-ipaas/core-utils'
import { WorkflowAction, workflowStructureUtil, WorkflowTrigger, WorkflowVersion } from '@fema-ipaas/shared'
import deepEqual from 'deep-equal'

function keepFrom({ workflowVersion, source }: KeepFromParams): WorkflowVersion {
    const sourceDates = new Map(
        workflowStructureUtil.getAllSteps(source.trigger).map((step) => [step.name, step.lastUpdatedDate]),
    )
    return workflowStructureUtil.transferWorkflow(workflowVersion, (step) => {
        const sourceDate = sourceDates.get(step.name)
        if (isNil(sourceDate)) {
            return step
        }
        return { ...step, lastUpdatedDate: sourceDate }
    })
}

function keepTestedFrom({ workflowVersion, source }: KeepFromParams): WorkflowVersion {
    const sourceSteps = new Map(
        workflowStructureUtil.getAllSteps(source.trigger).map((step) => [step.name, step]),
    )
    return workflowStructureUtil.transferWorkflow(workflowVersion, (step) => {
        const sourceStep = sourceSteps.get(step.name)
        if (isNil(sourceStep) || !deepEqual(comparableStep(sourceStep), comparableStep(step))) {
            return step
        }
        return {
            ...step,
            lastUpdatedDate: sourceStep.lastUpdatedDate,
            settings: {
                ...step.settings,
                sampleData: sourceStep.settings.sampleData,
            },
        }
    })
}

function comparableStep(step: WorkflowAction | WorkflowTrigger): unknown {
    const { sampleData: _sampleData, displayNumber: _displayNumber, ...settings } = readRecord(step.settings)
    return JSON.parse(JSON.stringify({
        name: step.name,
        type: step.type,
        displayName: step.displayName,
        skip: 'skip' in step ? step.skip === true : false,
        settings,
    }))
}

function readRecord(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && !isNil(value) && !Array.isArray(value)
}

export const workflowStepDates = {
    keepFrom,
    keepTestedFrom,
}

type KeepFromParams = {
    workflowVersion: WorkflowVersion
    source: Pick<WorkflowVersion, 'trigger'>
}
