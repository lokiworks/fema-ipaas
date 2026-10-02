import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { Execution, ExecutionStatus, FailedStep, StepOutputStatus, WorkflowVersion, workflowStructureUtil } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { executionRepo, executionService } from '../workflows/execution/execution-service'

export const issueFailedStep = (log: FastifyBaseLogger) => ({
    async resolve({ execution, workflowVersion }: ResolveParams): Promise<FailedStep | null> {
        if (!isNil(execution.failedStep)) {
            return execution.failedStep
        }
        const message = ABORT_MESSAGES[execution.status]
        if (isNil(message)) {
            return null
        }
        const { data: populated } = await tryCatch(() => executionService(log).getOnePopulatedOrThrow({ id: execution.id, projectId: execution.projectId }))
        const name = interruptedStepName({ steps: populated?.steps, fallback: workflowVersion?.trigger.name ?? FALLBACK_STEP_NAME })
        const failedStep: FailedStep = {
            name,
            displayName: isNil(workflowVersion) ? name : workflowStructureUtil.getStep(name, workflowVersion.trigger)?.displayName ?? name,
            message,
        }
        await executionRepo().update({ id: execution.id, projectId: execution.projectId }, { failedStep })
        return failedStep
    },
})

function interruptedStepName({ steps, fallback }: { steps: Execution['steps'] | undefined, fallback: string }): string {
    const entries = Object.entries(steps ?? {})
    const running = entries.find(([, output]) => Reflect.get(output, 'status') === StepOutputStatus.RUNNING)
    const last = entries.at(-1)
    return running?.[0] ?? last?.[0] ?? fallback
}

const FALLBACK_STEP_NAME = 'trigger'

const ABORT_MESSAGES: Partial<Record<ExecutionStatus, string>> = {
    [ExecutionStatus.TIMEOUT]: 'The run timed out before this step finished',
    [ExecutionStatus.MEMORY_LIMIT_EXCEEDED]: 'The run ran out of memory while this step was running',
}

type ResolveParams = {
    execution: Execution
    workflowVersion: WorkflowVersion | null
}
