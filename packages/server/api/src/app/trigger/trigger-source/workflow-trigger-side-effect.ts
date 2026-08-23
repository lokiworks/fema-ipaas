import {
    TriggerBase,
    TriggerStrategy,
    WebhookRenewStrategy,
} from '@fema/connector-sdk'
import { ApplicationError, ErrorCode, isNil, tryCatch, WorkflowId, WorkflowVersionId } from '@fema/core-utils'
import { ApEnvironment, EngineResponse, EngineResponseStatus, ExecuteTriggerResponse, LATEST_JOB_DATA_SCHEMA_VERSION, ScheduleOptions, TriggerHookType, TriggerSourceScheduleType, WorkerJobType, WorkflowTriggerType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { jobQueue, JobType } from '../../workers/job-queue/job-queue'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { workspaceService } from '../../workspace/workspace-service'
import { appEventRoutingService } from '../app-event-routing/app-event-routing.service'

const environment = system.getOrThrow<ApEnvironment>(AppSystemProp.ENVIRONMENT)

export const workflowTriggerSideEffect = (log: FastifyBaseLogger) => {
    return {
        async enable(params: EnableWorkflowTriggerParams): Promise<ActiveTriggerReturn> {
            if (environment === ApEnvironment.TESTING) {
                return {
                    scheduleOptions: undefined,
                }
            }
            const { workflowId, workflowVersionId, workspaceId, simulate, connectorTrigger, isRepublish } = params

            const tenantId = await workspaceService(log).getTenantId(workspaceId)
            const engineHelperResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteTriggerResponse<TriggerHookType.ON_ENABLE>>>({
                jobType: WorkerJobType.EXECUTE_TRIGGER_HOOK,
                hookType: TriggerHookType.ON_ENABLE,
                workflowId,
                workflowVersionId,
                tenantId,
                workspaceId,
                test: simulate,
                isRepublish,
            }, log)

            assertEngineResponseIsOk(engineHelperResponse, workflowId, workflowVersionId)

            switch (connectorTrigger.type) {
                case TriggerStrategy.APP_WEBHOOK: {
                    return handleAppWebhookTrigger({
                        engineHelperResponse,
                        log,
                        ...params,
                    })
                }
                case TriggerStrategy.WEBHOOK: {
                    return handleWebhookTrigger({
                        engineHelperResponse,
                        log,
                        ...params,
                    })
                }
                case TriggerStrategy.POLLING: {
                    return handlePollingTrigger({
                        engineHelperResponse,
                        log,
                        ...params,
                    })
                }
                case TriggerStrategy.MANUAL: {
                    return {
                        scheduleOptions: undefined,
                    }
                }
            }
        },
        async disable(params: DisableWorkflowTriggerParams): Promise<void> {
            if (environment === ApEnvironment.TESTING) {
                return
            }
            const { workflowId, workflowVersionId, workspaceId, simulate, connectorTrigger } = params
            const tenantId = await workspaceService(log).getTenantId(workspaceId)
            const { error, data: engineHelperResponse } = await tryCatch(
                () => userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteTriggerResponse<TriggerHookType.ON_DISABLE>>>({
                    jobType: WorkerJobType.EXECUTE_TRIGGER_HOOK,
                    hookType: TriggerHookType.ON_DISABLE,
                    workflowId,
                    workflowVersionId,
                    test: simulate,
                    workspaceId,
                    tenantId,
                }, log),
            )
            if (!isNil(error)) {
                if (!params.ignoreError) {
                    throw error
                }
                log.warn({ workflow: { id: workflowId }, error: error.message }, '[workflowTriggerSideEffect#disable] Ignored error during trigger disable')
            }
            else if (!params.ignoreError) {
                assertEngineResponseIsOk(engineHelperResponse!, workflowId, workflowVersionId)
            }
            switch (connectorTrigger.type) {
                case TriggerStrategy.APP_WEBHOOK:
                    await appEventRoutingService.deleteListeners({
                        workspaceId,
                        workflowId,
                    })
                    break
                case TriggerStrategy.WEBHOOK: {
                    const renewConfiguration = connectorTrigger.renewConfiguration
                    if (renewConfiguration?.strategy === WebhookRenewStrategy.CRON) {
                        await jobQueue(log).removeRepeatingJob({
                            workflowVersionId,
                        })
                    }
                    break
                }
                case TriggerStrategy.POLLING:
                    await jobQueue(log).removeRepeatingJob({
                        workflowVersionId,
                    })
                    break
                case TriggerStrategy.MANUAL:
                    break
            }
        },

    }
}

async function handleAppWebhookTrigger({ engineHelperResponse, workflowId, workspaceId, connectorName }: ActiveTriggerParams): Promise<ActiveTriggerReturn> {
    for (const listener of engineHelperResponse.response?.listeners ?? []) {
        await appEventRoutingService.createListeners({
            workspaceId,
            workflowId,
            appName: connectorName,
            events: listener.events,
            identifierValue: listener.identifierValue,
        })
    }
    return {
        scheduleOptions: undefined,
    }
}

async function handleWebhookTrigger({ workflowId, workflowVersionId, workspaceId, connectorTrigger, log }: ActiveTriggerParams): Promise<ActiveTriggerReturn> {
    const renewConfiguration = connectorTrigger.renewConfiguration
    switch (renewConfiguration?.strategy) {
        case WebhookRenewStrategy.CRON: {
            const tenantId = await workspaceService(log).getTenantId(workspaceId)
            await jobQueue(log).add({
                id: workflowVersionId,
                type: JobType.REPEATING,
                data: {
                    schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                    workspaceId,
                    workflowVersionId,
                    workflowId,
                    jobType: WorkerJobType.RENEW_WEBHOOK,
                    tenantId,
                },
                scheduleOptions: {
                    type: TriggerSourceScheduleType.CRON_EXPRESSION,
                    cronExpression: renewConfiguration.cronExpression,
                    timezone: 'UTC',
                },
            })
            break
        }
        default:
            break
    }
    return {
        scheduleOptions: undefined,
    }
}

async function handlePollingTrigger({ engineHelperResponse, workflowId, workflowVersionId, workspaceId, log }: ActiveTriggerParams): Promise<ActiveTriggerReturn> {
    const pollIntervalMinutes = system.getNumberOrThrow(AppSystemProp.TRIGGER_DEFAULT_POLL_INTERVAL)
    const defaultScheduleOptions: ScheduleOptions = {
        type: TriggerSourceScheduleType.INTERVAL,
        intervalMs: pollIntervalMinutes * 60_000,
    }
    const scheduleOptions = engineHelperResponse.response?.scheduleOptions ?? defaultScheduleOptions
    const tenantId = await workspaceService(log).getTenantId(workspaceId)
    await jobQueue(log).add({
        id: workflowVersionId,
        type: JobType.REPEATING,
        data: {
            schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
            workspaceId,
            workflowVersionId,
            workflowId,
            triggerType: WorkflowTriggerType.CONNECTOR,
            jobType: WorkerJobType.EXECUTE_POLLING,
            tenantId,
        },
        scheduleOptions,
    })
    return {
        scheduleOptions,
    }
}

function assertEngineResponseIsOk(engineHelperResponse: EngineResponse<ExecuteTriggerResponse<TriggerHookType.ON_ENABLE | TriggerHookType.ON_DISABLE>>, workflowId: WorkflowId, workflowVersionId: WorkflowVersionId) {
    if (isNil(engineHelperResponse) || engineHelperResponse.status !== EngineResponseStatus.OK) {
        throw new ApplicationError({
            code: ErrorCode.TRIGGER_UPDATE_STATUS,
            params: {
                workflowId,
                workflowVersionId,
                standardOutput: '',
                standardError: engineHelperResponse?.error ?? 'Engine response is undefined',
            },
        }, `workflowId=${workflowId} standardError=${engineHelperResponse?.error ?? 'Engine response is undefined'}`)
    }
}



type EnableWorkflowTriggerParams = {
    workflowId: WorkflowId
    workflowVersionId: WorkflowVersionId
    connectorName: string
    workspaceId: string
    connectorTrigger: TriggerBase
    simulate: boolean
    isRepublish?: boolean
}

type DisableWorkflowTriggerParams = EnableWorkflowTriggerParams & {
    ignoreError: boolean
}

type ActiveTriggerParams = EnableWorkflowTriggerParams & {
    log: FastifyBaseLogger
    engineHelperResponse: EngineResponse<ExecuteTriggerResponse<TriggerHookType.ON_ENABLE>>
}

type ActiveTriggerReturn = {
    scheduleOptions?: ScheduleOptions
}