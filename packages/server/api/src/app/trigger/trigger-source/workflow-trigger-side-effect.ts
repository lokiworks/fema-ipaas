import {
    TriggerBase,
    TriggerStrategy,
    WebhookRenewStrategy,
} from '@fema-ipaas/connector-sdk'
import { ApplicationError, ErrorCode, isNil, tryCatch, WorkflowId, WorkflowVersionId } from '@fema-ipaas/core-utils'
import { EngineResponse, EngineResponseStatus, ExecuteTriggerResponse, LATEST_JOB_DATA_SCHEMA_VERSION, RuntimeEnvironment, ScheduleOptions, TriggerHookType, TriggerSourceScheduleType, WorkerJobType, WorkflowTriggerType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { projectService } from '../../project/project-service'
import { jobQueue, JobType } from '../../workers/job-queue/job-queue'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { appEventRoutingService } from '../app-event-routing/app-event-routing.service'

const environment = system.getOrThrow<RuntimeEnvironment>(AppSystemProp.ENVIRONMENT)

export const workflowTriggerSideEffect = (log: FastifyBaseLogger) => {
    return {
        async enable(params: EnableWorkflowTriggerParams): Promise<ActiveTriggerReturn> {
            if (environment === RuntimeEnvironment.TESTING) {
                return {
                    scheduleOptions: undefined,
                }
            }
            const { workflowId, workflowVersionId, projectId, simulate, connectorTrigger, isRepublish } = params

            const tenantId = await projectService(log).getTenantId(projectId)
            const engineHelperResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteTriggerResponse<TriggerHookType.ON_ENABLE>>>({
                jobType: WorkerJobType.EXECUTE_TRIGGER_HOOK,
                hookType: TriggerHookType.ON_ENABLE,
                workflowId,
                workflowVersionId,
                tenantId,
                projectId,
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
            if (environment === RuntimeEnvironment.TESTING) {
                return
            }
            const { workflowId, workflowVersionId, projectId, simulate, connectorTrigger } = params
            const tenantId = await projectService(log).getTenantId(projectId)
            const { error, data: engineHelperResponse } = await tryCatch(
                () => userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteTriggerResponse<TriggerHookType.ON_DISABLE>>>({
                    jobType: WorkerJobType.EXECUTE_TRIGGER_HOOK,
                    hookType: TriggerHookType.ON_DISABLE,
                    workflowId,
                    workflowVersionId,
                    test: simulate,
                    projectId,
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
                        projectId,
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

async function handleAppWebhookTrigger({ engineHelperResponse, workflowId, projectId, connectorName }: ActiveTriggerParams): Promise<ActiveTriggerReturn> {
    for (const listener of engineHelperResponse.response?.listeners ?? []) {
        await appEventRoutingService.createListeners({
            projectId,
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

async function handleWebhookTrigger({ workflowId, workflowVersionId, projectId, connectorTrigger, log }: ActiveTriggerParams): Promise<ActiveTriggerReturn> {
    const renewConfiguration = connectorTrigger.renewConfiguration
    switch (renewConfiguration?.strategy) {
        case WebhookRenewStrategy.CRON: {
            const tenantId = await projectService(log).getTenantId(projectId)
            await jobQueue(log).add({
                id: workflowVersionId,
                type: JobType.REPEATING,
                data: {
                    schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                    projectId,
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

async function handlePollingTrigger({ engineHelperResponse, workflowId, workflowVersionId, projectId, log }: ActiveTriggerParams): Promise<ActiveTriggerReturn> {
    const pollIntervalMinutes = system.getNumberOrThrow(AppSystemProp.TRIGGER_DEFAULT_POLL_INTERVAL)
    const defaultScheduleOptions: ScheduleOptions = {
        type: TriggerSourceScheduleType.INTERVAL,
        intervalMs: pollIntervalMinutes * 60_000,
    }
    const scheduleOptions = engineHelperResponse.response?.scheduleOptions ?? defaultScheduleOptions
    const tenantId = await projectService(log).getTenantId(projectId)
    await jobQueue(log).add({
        id: workflowVersionId,
        type: JobType.REPEATING,
        data: {
            schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
            projectId,
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
    projectId: string
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