import { BaseEngineOperation, CodeAction, ConnectorAction, StepOutput } from '@fema/shared'
import { EngineConstants } from './context/engine-constants'
import { FlowExecutorContext } from './context/flow-execution-context'
import { flowExecutor } from './flow-executor'

export const actionRunStepRunner = {
    async run({ step, operation }: ActionRunStepParams): Promise<StepOutput> {
        const executionState = await flowExecutor.getExecutorForAction(step.type).handle({
            action: step,
            executionState: FlowExecutorContext.empty(),
            constants: EngineConstants.fromExecuteActionInput(operation),
        })
        return executionState.steps[step.name]
    },
}

type ActionRunStepParams = {
    step: ConnectorAction | CodeAction
    operation: BaseEngineOperation & { flowVersionId?: string }
}
