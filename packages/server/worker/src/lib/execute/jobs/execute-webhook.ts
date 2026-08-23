import { isNil, parseToJsonIfPossible, tryCatch } from '@fema/core-utils'
import { ConnectorTrigger, EngineOperationType, EngineResponseStatus, ExecuteTriggerResponse, StreamStepProgress, TriggerHookType, WebhookJobData, WorkerJobType, WorkflowVersion } from '@fema/shared'
import { workerSettings } from '../../config/worker-settings'
import { FireAndForgetJobResult, JobContext, JobHandler, JobResultKind } from '../types'
import { isSandboxTimeout } from '../utils/sandbox-helpers'
import { recordTriggerRun } from '../utils/trigger-run-recorder'
import { getAppWebhookUrl, getWebhookUrl } from '../utils/webhook-url'

function getAppWebhookDetails(workflowVersion: WorkflowVersion, publicApiUrl: string, appWebhookSecretsJson: string): { appWebhookUrl?: string, webhookSecret?: string | Record<string, string> } {
    const trigger = workflowVersion.trigger as ConnectorTrigger
    const connectorName = trigger?.settings?.connectorName
    if (isNil(connectorName)) {
        return {}
    }
    const secrets = parseToJsonIfPossible(appWebhookSecretsJson) as Record<string, { webhookSecret: string | Record<string, string> }> | undefined
    const webhookSecret = secrets?.[connectorName]?.webhookSecret
    const connectorUrlName = connectorName.replace('@fema/connector-', '')
    return {
        appWebhookUrl: getAppWebhookUrl(publicApiUrl, connectorUrlName),
        webhookSecret,
    }
}

export const executeWebhookJob: JobHandler<WebhookJobData, FireAndForgetJobResult> = {
    jobType: WorkerJobType.EXECUTE_WEBHOOK,
    async execute(ctx: JobContext, data: WebhookJobData): Promise<FireAndForgetJobResult> {
        const settings = workerSettings.getSettings()
        const timeoutInSeconds = settings.TRIGGER_TIMEOUT_SECONDS

        const resolved = await ctx.resolver.resolve({ tenantId: data.tenantId, publicApiUrl: ctx.publicApiUrl, engineToken: ctx.engineToken, workflow: { id: data.workflowId, versionId: data.workflowVersionIdToRun, workspaceId: data.workspaceId } })

        if (resolved.kind === 'workflow-not-found') {
            ctx.log.info({ workflowVersion: { id: data.workflowVersionIdToRun } }, 'Workflow version not found for webhook, skipping')
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }

        if (resolved.kind === 'disabled') {
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }

        // resolved.kind === 'ready' — workflowVersion is guaranteed present when workflow: is passed to resolve
        if (isNil(resolved.workflowVersion)) {
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.INTERNAL_ERROR }
        }
        const workflowVersion: WorkflowVersion = resolved.workflowVersion

        const { appWebhookUrl, webhookSecret } = getAppWebhookDetails(workflowVersion, ctx.publicApiUrl, settings.APP_WEBHOOK_SECRETS)

        let realExecutionStarted = false
        const { data: execResult, error } = await tryCatch(async () => {
            if (data.saveSampleData) {
                const sampleResult = await ctx.runtime.execute({
                    workerIndex: ctx.workerIndex,
                    log: ctx.log,
                    operationType: EngineOperationType.EXECUTE_TRIGGER_HOOK,
                    operation: {
                        hookType: TriggerHookType.RUN,
                        workflowVersion,
                        webhookUrl: getWebhookUrl(ctx.publicApiUrl, data.workflowId, true),
                        triggerPayload: data.payload,
                        test: true,
                        workspaceId: data.workspaceId,
                        tenantId: data.tenantId,
                        engineToken: ctx.engineToken,
                        internalApiUrl: ctx.internalApiUrl,
                        publicApiUrl: ctx.publicApiUrl,
                        timeoutInSeconds,
                        appWebhookUrl,
                        webhookSecret,
                    },
                    timeoutInSeconds,
                    provision: resolved.provision,
                })

                if (sampleResult.status === EngineResponseStatus.OK) {
                    const sampleTriggerResult = sampleResult.response as ExecuteTriggerResponse<TriggerHookType.RUN>
                    if (sampleTriggerResult.output.length > 0) {
                        await ctx.apiClient.savePayloads({
                            workflowId: data.workflowId,
                            workflowVersionId: workflowVersion.id,
                            workspaceId: data.workspaceId,
                            payloads: sampleTriggerResult.output,
                        })
                    }
                }
            }

            if (!data.execute) {
                return null
            }

            realExecutionStarted = true
            const result = await ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: EngineOperationType.EXECUTE_TRIGGER_HOOK,
                operation: {
                    hookType: TriggerHookType.RUN,
                    workflowVersion,
                    webhookUrl: getWebhookUrl(ctx.publicApiUrl, data.workflowId),
                    triggerPayload: data.payload,
                    test: false,
                    workspaceId: data.workspaceId,
                    tenantId: data.tenantId,
                    engineToken: ctx.engineToken,
                    internalApiUrl: ctx.internalApiUrl,
                    publicApiUrl: ctx.publicApiUrl,
                    timeoutInSeconds,
                    appWebhookUrl,
                    webhookSecret,
                },
                timeoutInSeconds,
                provision: resolved.provision,
            })

            return result
        })

        if (error) {
            if (realExecutionStarted) {
                await recordTriggerRun({ apiClient: ctx.apiClient, log: ctx.log, workflowVersion, tenantId: data.tenantId, status: EngineResponseStatus.INTERNAL_ERROR })
            }
            if (isSandboxTimeout(error)) {
                ctx.log.warn({ workflowVersion: { id: data.workflowVersionIdToRun } }, 'Webhook execution timed out in sandbox')
                return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
            }
            throw error
        }

        if (isNil(execResult)) {
            return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK }
        }

        if (execResult.status === EngineResponseStatus.OK) {
            const triggerResult = execResult.response as ExecuteTriggerResponse<TriggerHookType.RUN>
            if (triggerResult.output.length > 0) {
                await ctx.apiClient.submitPayloads({
                    workflowVersionId: workflowVersion.id,
                    workspaceId: data.workspaceId,
                    payloads: triggerResult.output,
                    httpRequestId: data.requestId,
                    environment: data.runEnvironment,
                    streamStepProgress: StreamStepProgress.NONE,
                    parentRunId: data.parentRunId,
                    failParentOnFailure: data.failParentOnFailure,
                })
            }
        }

        await recordTriggerRun({ apiClient: ctx.apiClient, log: ctx.log, workflowVersion, tenantId: data.tenantId, status: execResult.status })

        return { kind: JobResultKind.FIRE_AND_FORGET, status: EngineResponseStatus.OK, logs: execResult.logs }
    },
}
