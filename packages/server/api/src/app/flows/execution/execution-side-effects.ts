import { ApplicationEventName,
    Execution,
    isExecutionStateTerminal,
    PlatformId,
} from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { applicationEvents } from '../../helper/application-events'
import { executionHooks } from './execution-hooks'
import { waitpointService } from './waitpoint/waitpoint-service'

export const executionSideEffects = (log: FastifyBaseLogger) => ({
    async onFinish({ execution, platformId }: ExecutionSideEffectParams): Promise<void> {
        if (!isExecutionStateTerminal({
            status: execution.status,
            ignoreInternalError: true,
        })) {
            return
        }
        await waitpointService(log).deleteByExecutionId(execution.id)
        await executionHooks(log).onFinish(execution)
        applicationEvents(log).sendWorkerEvent({
            workspaceId: execution.workspaceId,
            platformId,
            action: ApplicationEventName.EXECUTION_FINISHED,
            data: {
                execution,
            },
        })
    },
    async onResume({ execution, platformId }: ExecutionSideEffectParams): Promise<void> {
        applicationEvents(log).sendWorkerEvent({
            workspaceId: execution.workspaceId,
            platformId,
            action: ApplicationEventName.EXECUTION_RESUMED,
            data: {
                execution,
            },
        })
    },
    async onRetry({ execution, platformId }: ExecutionSideEffectParams): Promise<void> {
        applicationEvents(log).sendWorkerEvent({
            workspaceId: execution.workspaceId,
            platformId,
            action: ApplicationEventName.EXECUTION_RETRIED,
            data: {
                execution,
            },
        })
    },
    async onStart({ execution, platformId }: ExecutionSideEffectParams): Promise<void> {
        applicationEvents(log).sendWorkerEvent({
            workspaceId: execution.workspaceId,
            platformId,
            action: ApplicationEventName.EXECUTION_STARTED,
            data: {
                execution,
            },
        })
    },
})

type ExecutionSideEffectParams = {
    execution: Execution
    platformId: PlatformId
}
