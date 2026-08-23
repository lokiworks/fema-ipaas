import {
    EngineOperationType,
    ExecuteExtractConnectorMetadataJobData,
    WorkerJobType,
} from '@fema/shared'
import { workerSettings } from '../../config/worker-settings'
import { JobContext, JobHandler, SynchronousJobResult } from '../types'
import { buildSynchronousResult } from '../utils/synchronous-result'

export const extractConnectorInfoJob: JobHandler<ExecuteExtractConnectorMetadataJobData, SynchronousJobResult> = {
    jobType: WorkerJobType.EXECUTE_EXTRACT_CONNECTOR_INFORMATION,
    async execute(ctx: JobContext, data: ExecuteExtractConnectorMetadataJobData): Promise<SynchronousJobResult> {
        const timeoutInSeconds = workerSettings.getSettings().TRIGGER_TIMEOUT_SECONDS

        const resolved = await ctx.resolver.resolve({ tenantId: data.tenantId, publicApiUrl: ctx.publicApiUrl, engineToken: ctx.engineToken, connectors: [data.connector] })
        if (resolved.kind !== 'ready') {
            throw new Error(`Unexpected resolve outcome "${resolved.kind}" for connector-only job`)
        }

        const result = await ctx.runtime.execute({
            workerIndex: ctx.workerIndex,
            log: ctx.log,
            operationType: EngineOperationType.EXTRACT_CONNECTOR_METADATA,
            operation: {
                ...data.connector,
                tenantId: data.tenantId,
                timeoutInSeconds,
            },
            timeoutInSeconds,
            provision: resolved.provision,
        })

        return buildSynchronousResult(result)
    },
}
