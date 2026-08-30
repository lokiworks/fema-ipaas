import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { EngineOperationType, EngineResponseStatus, ExecutePropertyJobData, WorkerJobType } from '@fema-ipaas/shared'
import { workerSettings } from '../../config/worker-settings'
import { JobContext, JobHandler, JobResultKind, SynchronousJobResult } from '../types'
import { isSandboxTimeout } from '../utils/sandbox-helpers'
import { buildSynchronousResult } from '../utils/synchronous-result'

export const executePropertyJob: JobHandler<ExecutePropertyJobData, SynchronousJobResult> = {
    jobType: WorkerJobType.EXECUTE_PROPERTY,
    async execute(ctx: JobContext, data: ExecutePropertyJobData): Promise<SynchronousJobResult> {
        const timeoutInSeconds = workerSettings.getSettings().TRIGGER_TIMEOUT_SECONDS

        const resolved = await ctx.resolver.resolve({
            tenantId: data.tenantId,
            publicApiUrl: ctx.publicApiUrl,
            engineToken: ctx.engineToken,
            connectors: isNil(data.connector) ? [] : [data.connector],
        })
        if (resolved.kind !== 'ready') {
            throw new Error(`Unexpected resolve outcome "${resolved.kind}" for connector-only job`)
        }

        const { data: result, error } = await tryCatch(async () => {
            return ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: EngineOperationType.EXECUTE_PROPERTY,
                operation: {
                    connector: data.connector,
                    componentType: data.componentType,
                    propertyName: data.propertyName,
                    actionOrTriggerName: data.actionOrTriggerName,
                    workflowVersion: data.workflowVersion,
                    input: data.input,
                    sampleData: data.sampleData,
                    projectId: data.projectId,
                    searchValue: data.searchValue,
                    tenantId: data.tenantId,
                    engineToken: ctx.engineToken,
                    internalApiUrl: ctx.internalApiUrl,
                    publicApiUrl: ctx.publicApiUrl,
                    timeoutInSeconds,
                },
                timeoutInSeconds,
                provision: resolved.provision,
            })
        })

        if (error) {
            if (isSandboxTimeout(error)) {
                return { kind: JobResultKind.SYNCHRONOUS, status: EngineResponseStatus.TIMEOUT, response: {} }
            }
            throw error
        }

        return buildSynchronousResult(result)
    },
}
