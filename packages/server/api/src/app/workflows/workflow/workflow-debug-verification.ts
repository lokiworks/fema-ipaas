import { isNil } from '@fema-ipaas/core-utils'
import { DebugVerification, ExecutionStatus, StepOutput, StepOutputStatus, WorkflowActionType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { IsNull } from 'typeorm'
import { executionRepo, executionService } from '../execution/execution-service'
import { workflowVersionService } from '../workflow-version/workflow-version.service'

export const workflowDebugVerification = (log: FastifyBaseLogger) => ({
    async verify({ workflowId, versionId, projectId }: { workflowId: string, versionId: string, projectId: string }): Promise<DebugVerification> {
        const version = await workflowVersionService(log).getWorkflowVersionOrThrow({ workflowId, versionId })
        const execution = await executionRepo().findOne({
            where: { projectId, workflowId, workflowVersionId: version.id, status: ExecutionStatus.SUCCEEDED, stepNameToTest: IsNull() },
            order: { created: 'DESC' },
        })
        if (isNil(execution) || new Date(execution.created).getTime() < new Date(version.updated).getTime()) {
            return UNVERIFIED
        }
        const steps = await executionService(log).getStepsOrNull({ execution })
        return {
            verified: true,
            executionId: execution.id,
            verifiedAt: execution.finishTime ?? execution.updated,
            executedStepNames: isNil(steps) ? [] : succeededStepNames(steps),
        }
    },
})

function succeededStepNames(steps: Record<string, StepOutput>): string[] {
    return Object.entries(steps).flatMap(([name, output]) => {
        const own = output.status === StepOutputStatus.SUCCEEDED ? [name] : []
        const nested = output.type === WorkflowActionType.LOOP_ON_ITEMS
            ? (output.output?.iterations ?? []).flatMap(succeededStepNames)
            : []
        return [...own, ...nested]
    })
}

const UNVERIFIED: DebugVerification = { verified: false, executionId: null, verifiedAt: null, executedStepNames: [] }
