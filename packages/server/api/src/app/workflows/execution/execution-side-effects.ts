import { isNil } from '@fema-ipaas/core-utils'
import { ApplicationEventName,
    Execution,
    isExecutionStateTerminal,
    TenantId,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { applicationEvents } from '../../helper/application-events'
import { otelExecutionMetrics } from '../../helper/otel-execution-metrics'
import { executionHooks } from './execution-hooks'
import { waitpointService } from './waitpoint/waitpoint-service'

export const executionSideEffects = (log: FastifyBaseLogger) => ({
    async onFinish({ execution, tenantId }: ExecutionSideEffectParams): Promise<void> {
        if (!isExecutionStateTerminal({
            status: execution.status,
            ignoreInternalError: true,
        })) {
            return
        }
        await waitpointService(log).deleteByExecutionId(execution.id)
        await executionHooks(log).onFinish(execution)
        otelExecutionMetrics.recordExecution({
            status: execution.status,
            durationMs: durationOf(execution),
        })
        applicationEvents(log).sendWorkerEvent({
            workspaceId: execution.workspaceId,
            tenantId,
            action: ApplicationEventName.EXECUTION_FINISHED,
            data: {
                execution,
            },
        })
    },
    async onResume({ execution, tenantId }: ExecutionSideEffectParams): Promise<void> {
        applicationEvents(log).sendWorkerEvent({
            workspaceId: execution.workspaceId,
            tenantId,
            action: ApplicationEventName.EXECUTION_RESUMED,
            data: {
                execution,
            },
        })
    },
    async onRetry({ execution, tenantId }: ExecutionSideEffectParams): Promise<void> {
        applicationEvents(log).sendWorkerEvent({
            workspaceId: execution.workspaceId,
            tenantId,
            action: ApplicationEventName.EXECUTION_RETRIED,
            data: {
                execution,
            },
        })
    },
    async onStart({ execution, tenantId }: ExecutionSideEffectParams): Promise<void> {
        applicationEvents(log).sendWorkerEvent({
            workspaceId: execution.workspaceId,
            tenantId,
            action: ApplicationEventName.EXECUTION_STARTED,
            data: {
                execution,
            },
        })
    },
})

type ExecutionSideEffectParams = {
    execution: Execution
    tenantId: TenantId
}

function durationOf(execution: Execution): number | undefined {
    if (isNil(execution.startTime) || isNil(execution.finishTime)) {
        return undefined
    }
    return new Date(execution.finishTime).getTime() - new Date(execution.startTime).getTime()
}
