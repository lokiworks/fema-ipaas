import { ApplicationError, ErrorCode, generateId, isNil, WorkflowId } from '@fema-ipaas/core-utils'
import { PopulatedTriggerSource, TemplateTelemetryEventType, TriggerSource, WorkflowVersion } from '@fema-ipaas/shared'
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
            const { workflowVersion, projectId, simulate, templateId, isRepublish } = params
            log.info({
                workflow: { id: workflowVersion.workflowId },
                workflowVersion: { id: workflowVersion.id },
                project: { id: projectId },
                simulate,
            }, '[triggerSourceService#enable] Enabling trigger source')
            const connectorTrigger = await triggerUtils(log).getConnectorTriggerOrThrow({ workflowVersion, projectId })
            const existingTriggerSource = await triggerSourceRepo().findOne({
                where: {
                    workflowId: workflowVersion.workflowId,
                    projectId,
                    simulate,
                },
                withDeleted: true,
            })
            if (!isNil(existingTriggerSource)) {
                await jobQueue(log).removeRepeatingJob({ workflowVersionId: existingTriggerSource.workflowVersionId })
            }
            await triggerSourceRepo().softDelete({
                workflowId: workflowVersion.workflowId,
                projectId,
                simulate,
            })
            log.info('[triggerSourceService#enable] Soft deleted trigger source')
            const triggerSourceWithouSchedule: Omit<TriggerSource, 'created' | 'updated' | 'schedule'> = {
                id: generateId(),
                type: connectorTrigger.type,
                projectId,
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
                projectId,
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
            const { projectId, id } = params
            return triggerSourceRepo().findOne({
                where: {
                    id,
                    projectId,
                },
            })
        },
        async getByWorkflowId(params: GetWorkflowIdParamsWithProjectId): Promise<TriggerSource | null> {
            const { workflowId, simulate, projectId } = params
            return triggerSourceRepo().findOne({
                where: {
                    workflowId,
                    simulate,
                    ...(projectId ? { projectId } : {}),
                },
            })
        },
        async getByWorkflowIds(params: GetByWorkflowIdsParams): Promise<Map<WorkflowId, TriggerSource>> {
            const { workflowIds, projectId } = params
            if (workflowIds.length === 0) {
                return new Map()
            }
            const triggerSources = await triggerSourceRepo().find({
                where: {
                    workflowId: In(workflowIds),
                    projectId,
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
        async getOrThrow({ projectId, id }: GetTriggerParams): Promise<TriggerSource> {
            const triggerSource = await triggerSourceRepo().findOne({
                where: {
                    id,
                    projectId,
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
            const { projectId, workflowId, simulate, templateId } = params
            log.info({
                workflow: { id: workflowId },
                project: { id: projectId },
                simulate,
            }, '[triggerSourceService#disable] Disabling trigger source')
            const triggerSource = await triggerSourceRepo().findOneBy({
                workflowId,
                projectId,
                simulate,
            })
            if (isNil(triggerSource)) {
                return
            }
            const workflowVersion = await workflowVersionService(log).getOneOrThrow(triggerSource.workflowVersionId)
            const connectorTrigger = await triggerUtils(log).getConnectorTrigger({ workflowVersion, projectId })
            if (!isNil(connectorTrigger)) {
                await workflowTriggerSideEffect(log).disable({
                    workflowId: triggerSource.workflowId,
                    workflowVersionId: triggerSource.workflowVersionId,
                    projectId,
                    connectorName: triggerSource.connectorName,
                    connectorTrigger,
                    simulate,
                    ignoreError: params.ignoreError,
                })
                log.info('[triggerSourceService#disable] Disabled workflow trigger side effect')
            }
            await triggerSourceRepo().softDelete({
                id: triggerSource.id,
                projectId,
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
    projectId?: string
    simulate: boolean
}

type GetByWorkflowIdsParams = {
    workflowIds: WorkflowId[]
    projectId: string
}

type GetWorkflowIdParamsWithProjectId = {
    workflowId: string
    projectId: string
    simulate: boolean | undefined
}

type GetTriggerParams = {
    projectId: string
    id: string
}

type DisableTriggerParams = {
    projectId: string
    workflowId: string
    simulate: boolean
    ignoreError: boolean
    templateId?: string
}

type EnableTriggerParams = {
    workflowVersion: WorkflowVersion
    projectId: string
    simulate: boolean
    templateId?: string
    isRepublish?: boolean
}
