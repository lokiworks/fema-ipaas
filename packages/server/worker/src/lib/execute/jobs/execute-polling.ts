import { isNil } from '@fema/core-utils'
import { EngineOperationType, EngineResponseStatus, ExecuteTriggerResponse, PollingJobData, RunEnvironment, StreamStepProgress, TriggerHookType, WorkerJobType, WorkflowVersion } from '@fema/shared'
import { workerSettings } from '../../config/worker-settings'
import { FireAndForgetJobResult, JobContext, JobHandler, JobResultKind } from '../types'
import { recordTriggerRun } from '../utils/trigger-run-recorder'
import { getWebhookUrl } from '../utils/webhook-url'

export const executePollingJob: JobHandler<PollingJobData, FireAndForgetJobResult> = {
    jobType: WorkerJobType.EXECUTE_POLLING,
    async execute(ctx: JobContext, data: PollingJobData): Promise<FireAndForgetJobResult> {
        const timeoutInSeconds = workerSettings.getSettings().TRIGGER_TIMEOUT_SECONDS

        const resolved = await ctx.resolver.resolve({ tenantId: data.tenantId, publicApiUrl: ctx.publicApiUrl, engineToken: ctx.engineToken, workflow: { id: data.workflowId, versionId: data.workflowVersionId, workspaceId: data.workspaceId } })

        if (resolved.kind === 'workflow-not-found') {
            ctx.log.info({ workflowVersion: { id: data.workflowVersionId } }, 'Workflow version not found for polling trigger, skipping')
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }

        if (resolved.kind === 'disabled') {
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }

        // resolved.kind === 'ready' — workflowVersion is guaranteed present when workflow: is passed to resolve
        if (isNil(resolved.workflowVersion)) {
            throw new Error('workflowVersion missing after resolve')
        }
        const workflowVersion: WorkflowVersion = resolved.workflowVersion

        try {
            const result = await ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: EngineOperationType.EXECUTE_TRIGGER_HOOK,
                operation: {
                    hookType: TriggerHookType.RUN,
                    workflowVersion,
                    webhookUrl: getWebhookUrl(ctx.publicApiUrl, data.workflowId),
                    test: false,
                    workspaceId: data.workspaceId,
                    tenantId: data.tenantId,
                    engineToken: ctx.engineToken,
                    internalApiUrl: ctx.internalApiUrl,
                    publicApiUrl: ctx.publicApiUrl,
                    timeoutInSeconds,
                },
                timeoutInSeconds,
                provision: resolved.provision,
            })

            if (result.status === EngineResponseStatus.OK) {
                const triggerResult = result.response as ExecuteTriggerResponse<TriggerHookType.RUN>
                if (triggerResult.output.length > 0) {
                    await ctx.apiClient.submitPayloads({
                        workflowVersionId: data.workflowVersionId,
                        workspaceId: data.workspaceId,
                        payloads: triggerResult.output,
                        environment: RunEnvironment.PRODUCTION,
                        streamStepProgress: StreamStepProgress.NONE,
                    })
                }
            }

            await recordTriggerRun({ apiClient: ctx.apiClient, log: ctx.log, workflowVersion, tenantId: data.tenantId, status: result.status })

            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK, logs: result.logs }
        }
        catch (e) {
            ctx.log.error({ error: String(e) }, 'Polling trigger failed, will retry on next scheduled cycle')
            await recordTriggerRun({ apiClient: ctx.apiClient, log: ctx.log, workflowVersion, tenantId: data.tenantId, status: EngineResponseStatus.INTERNAL_ERROR })
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }
    },
}
