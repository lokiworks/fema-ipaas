import { isNil, tryCatch } from '@fema/core-utils'
import { EngineOperationType, EngineResponseStatus, ExecuteTriggerHookJobData, WorkerJobType, WorkflowVersion } from '@fema/shared'
import { workerSettings } from '../../config/worker-settings'
import { JobContext, JobHandler, JobResultKind, SynchronousJobResult } from '../types'
import { isSandboxTimeout } from '../utils/sandbox-helpers'
import { buildSynchronousResult } from '../utils/synchronous-result'
import { getWebhookUrl } from '../utils/webhook-url'

export const executeTriggerHookJob: JobHandler<ExecuteTriggerHookJobData, SynchronousJobResult> = {
    jobType: WorkerJobType.EXECUTE_TRIGGER_HOOK,
    async execute(ctx: JobContext, data: ExecuteTriggerHookJobData): Promise<SynchronousJobResult> {
        const timeoutInSeconds = workerSettings.getSettings().TRIGGER_HOOKS_TIMEOUT_SECONDS

        const resolved = await ctx.resolver.resolve({ tenantId: data.tenantId, publicApiUrl: ctx.publicApiUrl, engineToken: ctx.engineToken, workflow: { id: data.workflowId, versionId: data.workflowVersionId, workspaceId: data.workspaceId } })

        if (resolved.kind === 'workflow-not-found') {
            ctx.log.info({ workflowVersion: { id: data.workflowVersionId } }, 'Workflow version not found for trigger hook, skipping')
            return { kind: JobResultKind.SYNCHRONOUS, status: EngineResponseStatus.OK, response: undefined }
        }

        if (resolved.kind === 'disabled') {
            ctx.log.info({ workflow: { id: data.workflowId } }, 'Failed to resolve connectors for trigger hook, skipping')
            return { kind: JobResultKind.SYNCHRONOUS, status: EngineResponseStatus.OK, response: undefined }
        }

        // resolved.kind === 'ready' — workflowVersion is guaranteed present when workflow: is passed to resolve
        if (isNil(resolved.workflowVersion)) {
            return { kind: JobResultKind.SYNCHRONOUS, status: EngineResponseStatus.OK, response: undefined }
        }
        const workflowVersion: WorkflowVersion = resolved.workflowVersion

        const { data: result, error } = await tryCatch(async () => {
            return ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: EngineOperationType.EXECUTE_TRIGGER_HOOK,
                operation: {
                    hookType: data.hookType,
                    workflowVersion,
                    webhookUrl: getWebhookUrl(ctx.publicApiUrl, data.workflowId, data.test),
                    triggerPayload: isNil(data.triggerPayload) ? undefined : { type: 'inline', value: data.triggerPayload },
                    isRepublish: data.isRepublish,
                    test: data.test,
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
        })

        if (error) {
            if (isSandboxTimeout(error)) {
                return { kind: JobResultKind.SYNCHRONOUS, status: EngineResponseStatus.TIMEOUT, response: undefined }
            }
            throw error
        }

        return buildSynchronousResult(result)
    },
}
