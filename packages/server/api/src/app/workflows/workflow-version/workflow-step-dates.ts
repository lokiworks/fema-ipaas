import { isNil } from '@fema-ipaas/core-utils'
import { workflowStructureUtil, WorkflowVersion } from '@fema-ipaas/shared'

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

export const workflowStepDates = {
    keepFrom,
}

type KeepFromParams = {
    workflowVersion: WorkflowVersion
    source: Pick<WorkflowVersion, 'trigger'>
}
