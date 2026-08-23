import dayjs from 'dayjs'
import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { UpdateSampleDataInfoRequest } from '.'


const _updateSampleDataInfo = (workflowVersion: WorkflowVersion, request: UpdateSampleDataInfoRequest) => {
    return workflowStructureUtil.transferWorkflow(workflowVersion, (step) => {
        if (step.name !== request.stepName) {
            return step
        }
        
        return {
            ...step,
            settings: {
                ...step.settings,
                sampleData: request.sampleDataSettings ? {
                    ...request.sampleDataSettings,
                    lastTestDate: dayjs().toISOString(),
                } : undefined,
            },
        }
    })
}

export { _updateSampleDataInfo }