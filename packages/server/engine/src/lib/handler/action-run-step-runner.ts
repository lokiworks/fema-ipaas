import { BaseEngineOperation, CodeAction, ConnectorAction, StepOutput } from '@fema/shared'
import { EngineConstants } from './context/engine-constants'
import { WorkflowExecutorContext } from './context/workflow-execution-context'
import { workflowExecutor } from './workflow-executor'

export const actionRunStepRunner = {
    async run({ step, operation }: ActionRunStepParams): Promise<StepOutput> {
        const executionState = await workflowExecutor.getExecutorForAction(step.type).handle({
            action: step,
            executionState: WorkflowExecutorContext.empty(),
            constants: EngineConstants.fromExecuteActionInput(operation),
        })
        return executionState.steps[step.name]
    },
}

type ActionRunStepParams = {
    step: ConnectorAction | CodeAction
    operation: BaseEngineOperation & { workflowVersionId?: string }
}
