import { LATEST_CONTEXT_VERSION } from '@fema-ipaas/connector-sdk'
import { isNil, spreadIfDefined } from '@fema-ipaas/core-utils'
import { GenericStepOutput, LoopStepOutput, RouterStepOutput, StepOutputStatus, WorkflowActionType, workflowStructureUtil, WorkflowTriggerType, WorkflowVersion } from '@fema-ipaas/shared'
import { createPropsResolver } from '../../variables/props-resolver'
import { EngineConstants } from './engine-constants'
import { WorkflowExecutorContext } from './workflow-execution-context'

export const testExecutionContext = {
    async stateFromWorkflowVersion({
        workflowVersion,
        excludedStepName,
        projectId,
        engineToken,
        apiUrl,
        sampleData,
        engineConstants,
    }: TestExecutionParams): Promise<WorkflowExecutorContext> {
        let workflowExecutionContext = WorkflowExecutorContext.empty({
            engineApi: { engineToken, internalApiUrl: apiUrl },
            slicingEnabled: false,
        })
        if (isNil(workflowVersion)) {
            return workflowExecutionContext
        }
        
        const workflowSteps = workflowStructureUtil.getAllSteps(workflowVersion.trigger)

        for (const step of workflowSteps) {
            const { name } = step
            if (name === excludedStepName) {
                continue
            }

            const stepType = step.type
            switch (stepType) {
                case WorkflowActionType.PARALLEL:
                case WorkflowActionType.ROUTER:
                    workflowExecutionContext = await workflowExecutionContext.upsertStep(
                        step.name,
                        RouterStepOutput.create({
                            input: step.settings,
                            type: stepType,
                            status: StepOutputStatus.SUCCEEDED,
                            ...spreadIfDefined('output', sampleData?.[step.name]),
                        }),
                    )
                    break
                case WorkflowActionType.LOOP_ON_ITEMS: {
                    const { resolvedInput } = await createPropsResolver({
                        apiUrl,
                        projectId,
                        engineToken,
                        contextVersion: LATEST_CONTEXT_VERSION,
                        stepNames: engineConstants.stepNames,
                    }).resolve<{ items: unknown[] }>({
                        unresolvedInput: step.settings,
                        executionState: workflowExecutionContext,
                    })
                    workflowExecutionContext = await workflowExecutionContext.upsertStep(
                        step.name,
                        LoopStepOutput.init({
                            input: step.settings,
                        }).setOutput({
                            item: resolvedInput.items[0],
                            index: 1,
                            iterations: [],
                        }),
                    )
                    break
                }
                case WorkflowActionType.CONNECTOR:
                case WorkflowActionType.CODE:
                case WorkflowActionType.COMPONENT:
                case WorkflowTriggerType.EMPTY:
                case WorkflowTriggerType.CONNECTOR:
                    workflowExecutionContext = await workflowExecutionContext.upsertStep(step.name, GenericStepOutput.create({
                        input: {},
                        type: stepType,
                        status: StepOutputStatus.SUCCEEDED,
                        ...spreadIfDefined('output', sampleData?.[step.name]),
                    }))
                    break
            }
        }
        return workflowExecutionContext
    },
}


type TestExecutionParams = {
    engineConstants: EngineConstants
    workflowVersion?: WorkflowVersion
    excludedStepName?: string
    projectId: string
    apiUrl: string
    engineToken: string
    sampleData?: Record<string, unknown>
}