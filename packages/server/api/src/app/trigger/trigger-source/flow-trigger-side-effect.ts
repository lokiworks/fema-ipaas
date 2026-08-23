import {
    TriggerBase,
    TriggerStrategy,
    WebhookRenewStrategy,
} from '@fema/connector-sdk'
import { ErrorCode, FlowId, FlowVersionId, isNil, PlatformError, tryCatch } from '@fema/core-utils'
import { ApEnvironment, EngineResponse, EngineResponseStatus, ExecuteTriggerResponse, FlowTriggerType, LATEST_JOB_DATA_SCHEMA_VERSION, ScheduleOptions, TriggerHookType, TriggerSourceScheduleType, WorkerJobType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { jobQueue, JobType } from '../../workers/job-queue/job-queue'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { workspaceService } from '../../workspace/workspace-service'
import { appEventRoutingService } from '../app-event-routing/app-event-routing.service'

const environment = system.getOrThrow<ApEnvironment>(AppSystemProp.ENVIRONMENT)

export const flowTriggerSideEffect = (log: FastifyBaseLogger) => {
    return {
        async enable(params: EnableFlowTriggerParams): Promise<ActiveTriggerReturn> {
            if (environment === ApEnvironment.TESTING) {
                return {
                    scheduleOptions: undefined,
                }
            }
            const { flowId, flowVersionId, workspaceId, simulate, connectorTrigger, isRepublish } = params

            const platformId = await workspaceService(log).getPlatformId(workspaceId)
            const engineHelperResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteTriggerResponse<TriggerHookType.ON_ENABLE>>>({
                jobType: WorkerJobType.EXECUTE_TRIGGER_HOOK,
                hookType: TriggerHookType.ON_ENABLE,
                flowId,
                flowVersionId,
                platformId,
                workspaceId,
                test: simulate,
                isRepublish,
            }, log)

            assertEngineResponseIsOk(engineHelperResponse, flowId, flowVersionId)

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
        async disable(params: DisableFlowTriggerParams): Promise<void> {
            if (environment === ApEnvironment.TESTING) {
                return
            }
            const { flowId, flowVersionId, workspaceId, simulate, connectorTrigger } = params
            const platformId = await workspaceService(log).getPlatformId(workspaceId)
            const { error, data: engineHelperResponse } = await tryCatch(
                () => userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteTriggerResponse<TriggerHookType.ON_DISABLE>>>({
                    jobType: WorkerJobType.EXECUTE_TRIGGER_HOOK,
                    hookType: TriggerHookType.ON_DISABLE,
                    flowId,
                    flowVersionId,
                    test: simulate,
                    workspaceId,
                    platformId,
                }, log),
            )
            if (!isNil(error)) {
                if (!params.ignoreError) {
                    throw error
                }
                log.warn({ flow: { id: flowId }, error: error.message }, '[flowTriggerSideEffect#disable] Ignored error during trigger disable')
            }
            else if (!params.ignoreError) {
                assertEngineResponseIsOk(engineHelperResponse!, flowId, flowVersionId)
            }
            switch (connectorTrigger.type) {
                case TriggerStrategy.APP_WEBHOOK:
                    await appEventRoutingService.deleteListeners({
                        workspaceId,
                        flowId,
                    })
                    break
                case TriggerStrategy.WEBHOOK: {
                    const renewConfiguration = connectorTrigger.renewConfiguration
                    if (renewConfiguration?.strategy === WebhookRenewStrategy.CRON) {
                        await jobQueue(log).removeRepeatingJob({
                            flowVersionId,
                        })
                    }
                    break
                }
                case TriggerStrategy.POLLING:
                    await jobQueue(log).removeRepeatingJob({
                        flowVersionId,
                    })
                    break
                case TriggerStrategy.MANUAL:
                    break
            }
        },

    }
}

async function handleAppWebhookTrigger({ engineHelperResponse, flowId, workspaceId, connectorName }: ActiveTriggerParams): Promise<ActiveTriggerReturn> {
    for (const listener of engineHelperResponse.response?.listeners ?? []) {
        await appEventRoutingService.createListeners({
            workspaceId,
            flowId,
            appName: connectorName,
            events: listener.events,
            identifierValue: listener.identifierValue,
        })
    }
    return {
        scheduleOptions: undefined,
    }
}

async function handleWebhookTrigger({ flowId, flowVersionId, workspaceId, connectorTrigger, log }: ActiveTriggerParams): Promise<ActiveTriggerReturn> {
    const renewConfiguration = connectorTrigger.renewConfiguration
    switch (renewConfiguration?.strategy) {
        case WebhookRenewStrategy.CRON: {
            const platformId = await workspaceService(log).getPlatformId(workspaceId)
            await jobQueue(log).add({
                id: flowVersionId,
                type: JobType.REPEATING,
                data: {
                    schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                    workspaceId,
                    flowVersionId,
                    flowId,
                    jobType: WorkerJobType.RENEW_WEBHOOK,
                    platformId,
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

async function handlePollingTrigger({ engineHelperResponse, flowId, flowVersionId, workspaceId, log }: ActiveTriggerParams): Promise<ActiveTriggerReturn> {
    const pollIntervalMinutes = system.getNumberOrThrow(AppSystemProp.TRIGGER_DEFAULT_POLL_INTERVAL)
    const defaultScheduleOptions: ScheduleOptions = {
        type: TriggerSourceScheduleType.INTERVAL,
        intervalMs: pollIntervalMinutes * 60_000,
    }
    const scheduleOptions = engineHelperResponse.response?.scheduleOptions ?? defaultScheduleOptions
    const platformId = await workspaceService(log).getPlatformId(workspaceId)
    await jobQueue(log).add({
        id: flowVersionId,
        type: JobType.REPEATING,
        data: {
            schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
            workspaceId,
            flowVersionId,
            flowId,
            triggerType: FlowTriggerType.CONNECTOR,
            jobType: WorkerJobType.EXECUTE_POLLING,
            platformId,
        },
        scheduleOptions,
    })
    return {
        scheduleOptions,
    }
}

function assertEngineResponseIsOk(engineHelperResponse: EngineResponse<ExecuteTriggerResponse<TriggerHookType.ON_ENABLE | TriggerHookType.ON_DISABLE>>, flowId: FlowId, flowVersionId: FlowVersionId) {
    if (isNil(engineHelperResponse) || engineHelperResponse.status !== EngineResponseStatus.OK) {
        throw new PlatformError({
            code: ErrorCode.TRIGGER_UPDATE_STATUS,
            params: {
                flowId,
                flowVersionId,
                standardOutput: '',
                standardError: engineHelperResponse?.error ?? 'Engine response is undefined',
            },
        }, `flowId=${flowId} standardError=${engineHelperResponse?.error ?? 'Engine response is undefined'}`)
    }
}



type EnableFlowTriggerParams = {
    flowId: FlowId
    flowVersionId: FlowVersionId
    connectorName: string
    workspaceId: string
    connectorTrigger: TriggerBase
    simulate: boolean
    isRepublish?: boolean
}

type DisableFlowTriggerParams = EnableFlowTriggerParams & {
    ignoreError: boolean
}

type ActiveTriggerParams = EnableFlowTriggerParams & {
    log: FastifyBaseLogger
    engineHelperResponse: EngineResponse<ExecuteTriggerResponse<TriggerHookType.ON_ENABLE>>
}

type ActiveTriggerReturn = {
    scheduleOptions?: ScheduleOptions
}