import { isNil } from '@fema-ipaas/core-utils'
import { EngineOperationType, EngineResponseStatus, RenewWebhookJobData, TriggerHookType, WorkerJobType, WorkflowVersion } from '@fema-ipaas/shared'
import { workerSettings } from '../../config/worker-settings'
import { FireAndForgetJobResult, JobContext, JobHandler, JobResultKind } from '../types'
import { getWebhookUrl } from '../utils/webhook-url'

export const renewWebhookJob: JobHandler<RenewWebhookJobData, FireAndForgetJobResult> = {
    jobType: WorkerJobType.RENEW_WEBHOOK,
    async execute(ctx: JobContext, data: RenewWebhookJobData): Promise<FireAndForgetJobResult> {
        const timeoutInSeconds = workerSettings.getSettings().TRIGGER_HOOKS_TIMEOUT_SECONDS

        const resolved = await ctx.resolver.resolve({ tenantId: data.tenantId, publicApiUrl: ctx.publicApiUrl, engineToken: ctx.engineToken, workflow: { id: data.workflowId, versionId: data.workflowVersionId, projectId: data.projectId } })

        if (resolved.kind === 'workflow-not-found') {
            ctx.log.info({ workflowVersion: { id: data.workflowVersionId } }, 'Workflow version not found for renew webhook, skipping')
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }

        if (resolved.kind === 'disabled') {
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }

        // resolved.kind === 'ready' — workflowVersion is guaranteed present when workflow: is passed to resolve
        if (isNil(resolved.workflowVersion)) {
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }
        const workflowVersion: WorkflowVersion = resolved.workflowVersion

        await ctx.runtime.execute({
            workerIndex: ctx.workerIndex,
            log: ctx.log,
            operationType: EngineOperationType.EXECUTE_TRIGGER_HOOK,
            operation: {
                hookType: TriggerHookType.RENEW,
                workflowVersion,
                webhookUrl: getWebhookUrl(ctx.publicApiUrl, data.workflowId),
                test: false,
                projectId: data.projectId,
                tenantId: data.tenantId,
                engineToken: ctx.engineToken,
                internalApiUrl: ctx.internalApiUrl,
                publicApiUrl: ctx.publicApiUrl,
                timeoutInSeconds,
            },
            timeoutInSeconds,
            provision: resolved.provision,
        })

        return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
    },
}
