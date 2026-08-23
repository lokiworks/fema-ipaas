import { apId, ApplicationError, ErrorCode, isNil, WorkflowId } from '@fema/core-utils'
import { PopulatedTriggerSource, TemplateTelemetryEventType, TriggerSource, WorkflowVersion } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { templateTelemetryService } from '../../template/template-telemetry/template-telemetry.service'
import { jobQueue } from '../../workers/job-queue/job-queue'
import { workflowVersionService } from '../../workflows/workflow-version/workflow-version.service'
import { TriggerSourceEntity } from './trigger-source-entity'
import { triggerUtils } from './trigger-utils'
import { workflowTriggerSideEffect } from './workflow-trigger-side-effect'

export const triggerSourceRepo = repoFactory(TriggerSourceEntity)

export const triggerSourceService = (log: FastifyBaseLogger) => {
    return {
        async enable(params: EnableTriggerParams): Promise<TriggerSource> {
            const { workflowVersion, workspaceId, simulate, templateId, isRepublish } = params
            log.info({
                workflow: { id: workflowVersion.workflowId },
                workflowVersion: { id: workflowVersion.id },
                workspace: { id: workspaceId },
                simulate,
            }, '[triggerSourceService#enable] Enabling trigger source')
            const connectorTrigger = await triggerUtils(log).getConnectorTriggerOrThrow({ workflowVersion, workspaceId })
            const existingTriggerSource = await triggerSourceRepo().findOne({
                where: {
                    workflowId: workflowVersion.workflowId,
                    workspaceId,
                    simulate,
                },
                withDeleted: true,
            })
            if (!isNil(existingTriggerSource)) {
                await jobQueue(log).removeRepeatingJob({ workflowVersionId: existingTriggerSource.workflowVersionId })
            }
            await triggerSourceRepo().softDelete({
                workflowId: workflowVersion.workflowId,
                workspaceId,
                simulate,
            })
            log.info('[triggerSourceService#enable] Soft deleted trigger source')
            const triggerSourceWithouSchedule: Omit<TriggerSource, 'created' | 'updated' | 'schedule'> = {
                id: apId(),
                type: connectorTrigger.type,
                workspaceId,
                workflowId: workflowVersion.workflowId,
                triggerName: connectorTrigger.name,
                workflowVersionId: workflowVersion.id,
                connectorName: workflowVersion.trigger.settings.connectorName,
                connectorVersion: workflowVersion.trigger.settings.connectorVersion,
                simulate,
            }
            const triggerSource = await triggerSourceRepo().save(triggerSourceWithouSchedule)
            const { scheduleOptions } = await workflowTriggerSideEffect(log).enable({
                workflowId: workflowVersion.workflowId,
                workflowVersionId: workflowVersion.id,
                workspaceId,
                connectorName: workflowVersion.trigger.settings.connectorName,
                connectorTrigger,
                simulate,
                isRepublish,
            })

            if (templateId) {
                templateTelemetryService(log).sendEvent({
                    eventType: TemplateTelemetryEventType.ACTIVATE,
                    templateId,
                    workflowId: workflowVersion.workflowId,
                })
            }

            log.info('[triggerSourceService#enable] Enabled workflow trigger side effect')
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
        async getByWorkflowId(params: GetWorkflowIdParamsWithWorkspaceId): Promise<TriggerSource | null> {
            const { workflowId, simulate, workspaceId } = params
            return triggerSourceRepo().findOne({
                where: {
                    workflowId,
                    simulate,
                    ...(workspaceId ? { workspaceId } : {}),
                },
            })
        },
        async getByWorkflowIds(params: GetByWorkflowIdsParams): Promise<Map<WorkflowId, TriggerSource>> {
            const { workflowIds, workspaceId } = params
            if (workflowIds.length === 0) {
                return new Map()
            }
            const triggerSources = await triggerSourceRepo().find({
                where: {
                    workflowId: In(workflowIds),
                    workspaceId,
                },
            })
            const result = new Map<WorkflowId, TriggerSource>()
            for (const ts of triggerSources) {
                result.set(ts.workflowId, ts)
            }
            return result
        },
        async getByWorkflowIdPopulated(params: GetByWorkflowIdParams): Promise<PopulatedTriggerSource | null> {
            const { workflowId, simulate } = params
            return triggerSourceRepo().findOne({
                where: {
                    workflowId,
                    simulate,
                },
                relations: {
                    workflow: true,
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
                throw new ApplicationError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: {
                        entityType: 'trigger',
                        entityId: id,
                    },
                })
            }
            return triggerSource
        },
        async existsByWorkflowId(params: ExistsByWorkflowIdParams): Promise<boolean> {
            const { workflowId, simulate } = params
            return triggerSourceRepo().existsBy({
                workflowId,
                simulate,
            })
        },
        async disable(params: DisableTriggerParams): Promise<void> {
            const { workspaceId, workflowId, simulate, templateId } = params
            log.info({
                workflow: { id: workflowId },
                workspace: { id: workspaceId },
                simulate,
            }, '[triggerSourceService#disable] Disabling trigger source')
            const triggerSource = await triggerSourceRepo().findOneBy({
                workflowId,
                workspaceId,
                simulate,
            })
            if (isNil(triggerSource)) {
                return
            }
            const workflowVersion = await workflowVersionService(log).getOneOrThrow(triggerSource.workflowVersionId)
            const connectorTrigger = await triggerUtils(log).getConnectorTrigger({ workflowVersion, workspaceId })
            if (!isNil(connectorTrigger)) {
                await workflowTriggerSideEffect(log).disable({
                    workflowId: triggerSource.workflowId,
                    workflowVersionId: triggerSource.workflowVersionId,
                    workspaceId,
                    connectorName: triggerSource.connectorName,
                    connectorTrigger,
                    simulate,
                    ignoreError: params.ignoreError,
                })
                log.info('[triggerSourceService#disable] Disabled workflow trigger side effect')
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
                    workflowId,
                })
            }
        },
    }
}

type ExistsByWorkflowIdParams = {
    workflowId: string
    simulate: boolean
}

type GetByWorkflowIdParams = {
    workflowId: string
    workspaceId?: string
    simulate: boolean
}

type GetByWorkflowIdsParams = {
    workflowIds: WorkflowId[]
    workspaceId: string
}

type GetWorkflowIdParamsWithWorkspaceId = {
    workflowId: string
    workspaceId: string
    simulate: boolean | undefined
}

type GetTriggerParams = {
    workspaceId: string
    id: string
}

type DisableTriggerParams = {
    workspaceId: string
    workflowId: string
    simulate: boolean
    ignoreError: boolean
    templateId?: string
}

type EnableTriggerParams = {
    workflowVersion: WorkflowVersion
    workspaceId: string
    simulate: boolean
    templateId?: string
    isRepublish?: boolean
}
