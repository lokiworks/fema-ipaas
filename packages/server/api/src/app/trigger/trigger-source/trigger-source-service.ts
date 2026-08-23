import { apId, ErrorCode, FlowId, isNil, PlatformError } from '@fema/core-utils'
import { FlowVersion, PopulatedTriggerSource, TemplateTelemetryEventType, TriggerSource } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { flowVersionService } from '../../flows/flow-version/flow-version.service'
import { templateTelemetryService } from '../../template/template-telemetry/template-telemetry.service'
import { jobQueue } from '../../workers/job-queue/job-queue'
import { flowTriggerSideEffect } from './flow-trigger-side-effect'
import { TriggerSourceEntity } from './trigger-source-entity'
import { triggerUtils } from './trigger-utils'

export const triggerSourceRepo = repoFactory(TriggerSourceEntity)

export const triggerSourceService = (log: FastifyBaseLogger) => {
    return {
        async enable(params: EnableTriggerParams): Promise<TriggerSource> {
            const { flowVersion, workspaceId, simulate, templateId, isRepublish } = params
            log.info({
                flow: { id: flowVersion.flowId },
                flowVersion: { id: flowVersion.id },
                workspace: { id: workspaceId },
                simulate,
            }, '[triggerSourceService#enable] Enabling trigger source')
            const connectorTrigger = await triggerUtils(log).getConnectorTriggerOrThrow({ flowVersion, workspaceId })
            const existingTriggerSource = await triggerSourceRepo().findOne({
                where: {
                    flowId: flowVersion.flowId,
                    workspaceId,
                    simulate,
                },
                withDeleted: true,
            })
            if (!isNil(existingTriggerSource)) {
                await jobQueue(log).removeRepeatingJob({ flowVersionId: existingTriggerSource.flowVersionId })
            }
            await triggerSourceRepo().softDelete({
                flowId: flowVersion.flowId,
                workspaceId,
                simulate,
            })
            log.info('[triggerSourceService#enable] Soft deleted trigger source')
            const triggerSourceWithouSchedule: Omit<TriggerSource, 'created' | 'updated' | 'schedule'> = {
                id: apId(),
                type: connectorTrigger.type,
                workspaceId,
                flowId: flowVersion.flowId,
                triggerName: connectorTrigger.name,
                flowVersionId: flowVersion.id,
                connectorName: flowVersion.trigger.settings.connectorName,
                connectorVersion: flowVersion.trigger.settings.connectorVersion,
                simulate,
            }
            const triggerSource = await triggerSourceRepo().save(triggerSourceWithouSchedule)
            const { scheduleOptions } = await flowTriggerSideEffect(log).enable({
                flowId: flowVersion.flowId,
                flowVersionId: flowVersion.id,
                workspaceId,
                connectorName: flowVersion.trigger.settings.connectorName,
                connectorTrigger,
                simulate,
                isRepublish,
            })

            if (templateId) {
                templateTelemetryService(log).sendEvent({
                    eventType: TemplateTelemetryEventType.ACTIVATE,
                    templateId,
                    flowId: flowVersion.flowId,
                })
            }

            log.info('[triggerSourceService#enable] Enabled flow trigger side effect')
            return triggerSourceRepo().save({
                ...triggerSource,
                schedule: scheduleOptions,
            })
        },
        async get(params: GetTriggerParams): Promise<TriggerSource | null> {
            const { workspaceId, id } = params
            return triggerSourceRepo().findOne({
                where: {
                    id,
                    workspaceId,
                },
            })
        },
        async getByFlowId(params: GetFlowIdParamsWithWorkspaceId): Promise<TriggerSource | null> {
            const { flowId, simulate, workspaceId } = params
            return triggerSourceRepo().findOne({
                where: {
                    flowId,
                    simulate,
                    ...(workspaceId ? { workspaceId } : {}),
                },
            })
        },
        async getByFlowIds(params: GetByFlowIdsParams): Promise<Map<FlowId, TriggerSource>> {
            const { flowIds, workspaceId } = params
            if (flowIds.length === 0) {
                return new Map()
            }
            const triggerSources = await triggerSourceRepo().find({
                where: {
                    flowId: In(flowIds),
                    workspaceId,
                },
            })
            const result = new Map<FlowId, TriggerSource>()
            for (const ts of triggerSources) {
                result.set(ts.flowId, ts)
            }
            return result
        },
        async getByFlowIdPopulated(params: GetByFlowIdParams): Promise<PopulatedTriggerSource | null> {
            const { flowId, simulate } = params
            return triggerSourceRepo().findOne({
                where: {
                    flowId,
                    simulate,
                },
                relations: {
                    flow: true,
                },
            })
        },
        async getOrThrow({ workspaceId, id }: GetTriggerParams): Promise<TriggerSource> {
            const triggerSource = await triggerSourceRepo().findOne({
                where: {
                    id,
                    workspaceId,
                },
            })
            if (isNil(triggerSource)) {
                throw new PlatformError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: {
                        entityType: 'trigger',
                        entityId: id,
                    },
                })
            }
            return triggerSource
        },
        async existsByFlowId(params: ExistsByFlowIdParams): Promise<boolean> {
            const { flowId, simulate } = params
            return triggerSourceRepo().existsBy({
                flowId,
                simulate,
            })
        },
        async disable(params: DisableTriggerParams): Promise<void> {
            const { workspaceId, flowId, simulate, templateId } = params
            log.info({
                flow: { id: flowId },
                workspace: { id: workspaceId },
                simulate,
            }, '[triggerSourceService#disable] Disabling trigger source')
            const triggerSource = await triggerSourceRepo().findOneBy({
                flowId,
                workspaceId,
                simulate,
            })
            if (isNil(triggerSource)) {
                return
            }
            const flowVersion = await flowVersionService(log).getOneOrThrow(triggerSource.flowVersionId)
            const connectorTrigger = await triggerUtils(log).getConnectorTrigger({ flowVersion, workspaceId })
            if (!isNil(connectorTrigger)) {
                await flowTriggerSideEffect(log).disable({
                    flowId: triggerSource.flowId,
                    flowVersionId: triggerSource.flowVersionId,
                    workspaceId,
                    connectorName: triggerSource.connectorName,
                    connectorTrigger,
                    simulate,
                    ignoreError: params.ignoreError,
                })
                log.info('[triggerSourceService#disable] Disabled flow trigger side effect')
            }
            await triggerSourceRepo().softDelete({
                id: triggerSource.id,
                workspaceId,
            })
            log.info('[triggerSourceService#disable] Soft deleted trigger source')
            if (templateId) {
                templateTelemetryService(log).sendEvent({
                    eventType: TemplateTelemetryEventType.DEACTIVATE,
                    templateId,
                    flowId,
                })
            }
        },
    }
}

type ExistsByFlowIdParams = {
    flowId: string
    simulate: boolean
}

type GetByFlowIdParams = {
    flowId: string
    workspaceId?: string
    simulate: boolean
}

type GetByFlowIdsParams = {
    flowIds: FlowId[]
    workspaceId: string
}

type GetFlowIdParamsWithWorkspaceId = {
    flowId: string
    workspaceId: string
    simulate: boolean | undefined
}

type GetTriggerParams = {
    workspaceId: string
    id: string
}

type DisableTriggerParams = {
    workspaceId: string
    flowId: string
    simulate: boolean
    ignoreError: boolean
    templateId?: string
}

type EnableTriggerParams = {
    flowVersion: FlowVersion
    workspaceId: string
    simulate: boolean
    templateId?: string
    isRepublish?: boolean
}
