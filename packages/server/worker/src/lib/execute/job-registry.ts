import { JobData, WorkerJobType } from '@fema/shared'
import { executeActionJob } from './jobs/execute-action'
import { executeFlowJob } from './jobs/execute-flow'
import { executePollingJob } from './jobs/execute-polling'
import { executePropertyJob } from './jobs/execute-property'
import { executeTokenRefreshJob } from './jobs/execute-token-refresh'
import { executeTriggerHookJob } from './jobs/execute-trigger-hook'
import { executeValidationJob } from './jobs/execute-validation'
import { executeWebhookJob } from './jobs/execute-webhook'
import { extractConnectorInfoJob } from './jobs/extract-connector-info'
import { renewWebhookJob } from './jobs/renew-webhook'
import { resolveConnectionIdentifierJob } from './jobs/resolve-connection-identifier'
import { JobHandler } from './types'

export async function getHandler(jobType: WorkerJobType): Promise<JobHandler<JobData>> {
    const eager = registry[jobType]
    if (eager !== undefined) {
        return eager
    }
    const cached = lazyCache.get(jobType)
    if (cached !== undefined) {
        return cached
    }
    const loader = lazyLoaders[jobType]
    if (loader === undefined) {
        throw new Error(`No handler registered for job type ${jobType}`)
    }
    const handler = await loader()
    lazyCache.set(jobType, handler)
    return handler
}

const registry: Partial<Record<WorkerJobType, JobHandler>> = {
    [WorkerJobType.EXECUTE_FLOW]: executeFlowJob,
    [WorkerJobType.EXECUTE_POLLING]: executePollingJob,
    [WorkerJobType.EXECUTE_WEBHOOK]: executeWebhookJob,
    [WorkerJobType.RENEW_WEBHOOK]: renewWebhookJob,
    [WorkerJobType.EXECUTE_TRIGGER_HOOK]: executeTriggerHookJob,
    [WorkerJobType.EXECUTE_PROPERTY]: executePropertyJob,
    [WorkerJobType.EXECUTE_VALIDATION]: executeValidationJob,
    [WorkerJobType.EXECUTE_RESOLVE_CONNECTION_IDENTIFIER]: resolveConnectionIdentifierJob,
    [WorkerJobType.EXECUTE_TOKEN_REFRESH]: executeTokenRefreshJob,
    [WorkerJobType.EXECUTE_EXTRACT_CONNECTOR_INFORMATION]: extractConnectorInfoJob,
    [WorkerJobType.EXECUTE_ACTION]: executeActionJob,
}

const lazyLoaders: Partial<Record<WorkerJobType, () => Promise<JobHandler>>> = {}

const lazyCache = new Map<WorkerJobType, JobHandler>()
