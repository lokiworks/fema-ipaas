import dayjs from 'dayjs'
import { isNil } from '@fema/core-utils'
import { WorkflowAction, WorkflowActionType, SingleActionSchema } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil } from '../util/workflow-structure-util'
import { UpdateActionRequest } from './index'

function _updateAction(workflowVersion: WorkflowVersion, request: UpdateActionRequest): WorkflowVersion {
    const next = workflowStructureUtil.transferWorkflow(workflowVersion, (stepToUpdate) => {
        if (stepToUpdate.name !== request.name) {
            return stepToUpdate
        }

        const baseProps: Omit<WorkflowAction, 'type'> = {
            displayName: request.displayName,
            name: request.name,
            valid: false,
            skip: request.skip,
            lastUpdatedDate: dayjs().toISOString(),
            settings: {
                ...stepToUpdate.settings,
                customLogoUrl: request.settings.customLogoUrl,
            },
        }


        let updatedAction: WorkflowAction
        switch (request.type) {
            case WorkflowActionType.CODE: {
                const existingContinueOnFailureBranches = stepToUpdate.type === WorkflowActionType.CODE || stepToUpdate.type === WorkflowActionType.CONNECTOR ? stepToUpdate.continueOnFailureBranches : undefined
                const existingSampleData = stepToUpdate.type === WorkflowActionType.CODE ? stepToUpdate.settings.sampleData : undefined
                updatedAction = {
                    ...baseProps,
                    settings: { ...request.settings, sampleData: existingSampleData },
                    type: WorkflowActionType.CODE,
                    nextAction: stepToUpdate.nextAction,
                    continueOnFailureBranches: existingContinueOnFailureBranches,
                }
                break
            }
            case WorkflowActionType.CONNECTOR: {
                const existingContinueOnFailureBranches = stepToUpdate.type === WorkflowActionType.CODE || stepToUpdate.type === WorkflowActionType.CONNECTOR ? stepToUpdate.continueOnFailureBranches : undefined
                const existingSampleData = stepToUpdate.type === WorkflowActionType.CONNECTOR ? stepToUpdate.settings.sampleData : undefined
                updatedAction = {
                    ...baseProps,
                    settings: { ...request.settings, sampleData: existingSampleData },
                    type: WorkflowActionType.CONNECTOR,
                    nextAction: stepToUpdate.nextAction,
                    continueOnFailureBranches: existingContinueOnFailureBranches,
                }
                break
            }
            case WorkflowActionType.LOOP_ON_ITEMS: {
                const existingSampleData = stepToUpdate.type === WorkflowActionType.LOOP_ON_ITEMS ? stepToUpdate.settings.sampleData : undefined
                const firstLoopAction = stepToUpdate.type === WorkflowActionType.LOOP_ON_ITEMS ? stepToUpdate.firstLoopAction : undefined
                updatedAction = {
                    ...baseProps,
                    settings: { ...request.settings, sampleData: existingSampleData },
                    type: WorkflowActionType.LOOP_ON_ITEMS,
                    firstLoopAction,
                    nextAction: stepToUpdate.nextAction,
                }
                break
            }

            case WorkflowActionType.ROUTER: {
                const existingSampleData = stepToUpdate.type === WorkflowActionType.ROUTER ? stepToUpdate.settings.sampleData : undefined
                const children = stepToUpdate.type === WorkflowActionType.ROUTER ? stepToUpdate.children : [null, null]
                updatedAction = {
                    ...baseProps,
                    settings: { ...request.settings, sampleData: existingSampleData },
                    type: WorkflowActionType.ROUTER,
                    nextAction: stepToUpdate.nextAction,
                    children,
                }
                break
            }
        }
        const parseResult = SingleActionSchema.safeParse(updatedAction)
        const valid = (isNil(request.valid) ? true : request.valid) && parseResult.success
        return {
            ...updatedAction,
            valid,
        }
    })
    return next
}

export { _updateAction }
