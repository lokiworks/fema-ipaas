import { apId, ApplicationError, assertNotNullOrUndefined, Cursor, ErrorCode, isNil, Metadata, SeekPage, TenantId, tryCatch, UserId, WorkflowId, WorkflowVersionId, WorkspaceId } from '@fema-ipaas/core-utils'
import { apDayjs, apDayjsDuration } from '@fema-ipaas/server-utils'
import { CreateWorkflowRequest, PopulatedWorkflow, SharedTemplate, TelemetryEventName, TemplateStatus, TemplateType, TriggerSource, UncategorizedFolderId, UserWithMetaInformation, Workflow, workflowConnectorUtil, WorkflowCreator, WorkflowOperationRequest, WorkflowOperationStatus, WorkflowOperationType, WorkflowStatus, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { EntityManager, In, IsNull, Not } from 'typeorm'
import { transaction } from '../../core/db/transaction'
import { distributedLock } from '../../database/redis-connections'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import Paginator, { Order } from '../../helper/pagination/paginator'
import { rejectedPromiseHandler } from '../../helper/promise-handler'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { SystemJobName } from '../../helper/system-jobs/common'
import { systemJobsSchedule } from '../../helper/system-jobs/system-job'
import { telemetry } from '../../helper/telemetry.utils'
import { triggerSourceService } from '../../trigger/trigger-source/trigger-source-service'
import { workspaceService } from '../../workspace/workspace-service'
import { workflowFolderService } from '../folder/folder.service'
import { workflowVersionMigrationService } from '../workflow-version/workflow-version-migration.service'
import { workflowVersionRepo, workflowVersionService } from '../workflow-version/workflow-version.service'
import { workflowExecutionCache } from './workflow-execution-cache'
import { workflowPublishUtils } from './workflow-publish-utils'
import { workflowSideEffects } from './workflow-service-side-effects'
import { WorkflowEntity } from './workflow.entity'
import { workflowRepo } from './workflow.repo'



export const workflowService = (log: FastifyBaseLogger) => ({
    async create({ workspaceId, request, externalId, ownerId, templateId, createdBy, ip, emitEvents = true }: CreateParams): Promise<PopulatedWorkflow> {
        const folderId = await getFolderIdFromRequest({ workspaceId, folderId: request.folderId, folderName: request.folderName, log })
        const newWorkflow: NewWorkflow = {
            id: apId(),
            workspaceId,
            folderId,
            status: WorkflowStatus.DISABLED,
            ownerId,
            publishedVersionId: null,
            externalId: externalId ?? apId(),
            metadata: request.metadata,
            operationStatus: WorkflowOperationStatus.NONE,
            templateId,
            createdBy,
        }
        const { savedWorkflow, savedWorkflowVersion } = await transaction(async (entityManager) => {
            const workflow = await workflowRepo(entityManager).save(newWorkflow)
            const workflowVersion = await workflowVersionService(log).createEmptyVersion({
                workflowId: workflow.id,
                displayName: request.displayName,
                notes: [],
                schemaVersion: null,
                entityManager,
            })
            return { savedWorkflow: workflow, savedWorkflowVersion: workflowVersion }
        })

        rejectedPromiseHandler(
            telemetry(log).trackWorkspace(savedWorkflow.workspaceId, {
                name: TelemetryEventName.CREATED_WORKFLOW,
                payload: {
                    workflowId: savedWorkflow.id,
                },
            }),
            log,
        )

        log.info({ workflow: { id: savedWorkflow.id }, workspace: { id: workspaceId }, displayName: request.displayName }, 'Workflow created')
        const createdWorkflow = {
            ...savedWorkflow,
            version: savedWorkflowVersion,
        }
        if (emitEvents) {
            workflowSideEffects(log).onCreated({
                tenantId: await workspaceService(log).getTenantId(workspaceId),
                workspaceId,
                userId: ownerId,
                ip,
                workflow: createdWorkflow,
            })
        }
        return createdWorkflow
    },

    async list({
        workspaceIds,
        tenantId,
        cursorRequest,
        limit = Paginator.NO_LIMIT,
        folderId,
        folderIds,
        status,
        name,
        connectionExternalIds,
        agentExternalIds,
        externalIds,
        versionState = WorkflowVersionState.DRAFT,
        includeTriggerSource = true,
    }: ListParams): Promise<SeekPage<PopulatedWorkflow>> {
        const decodedCursor = paginationHelper.decodeCursor(cursorRequest)
        const paginator = buildPaginator({
            entity: WorkflowEntity,
            alias: 'ff',
            query: {
                limit,
                orderBy: [
                    { field: 'status', order: Order.DESC },
                    { field: 'updated', order: Order.DESC },
                ],
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })

        const queryBuilder = workflowRepo().createQueryBuilder('ff').where({ operationStatus: Not(WorkflowOperationStatus.DELETING) })

        if (workspaceIds) {
            queryBuilder.andWhere({ workspaceId: In(workspaceIds) })
        }
        else {
            queryBuilder
                .innerJoin('workspace', 'workspace', 'workspace.id = ff."workspaceId"')
                .andWhere('workspace."tenantId" = :tenantId', { tenantId })
        }

        if (folderId !== undefined) {
            queryBuilder.andWhere({ folderId: folderId === UncategorizedFolderId ? IsNull() : folderId })
        }

        if (folderIds !== undefined) {
            queryBuilder.andWhere({ folderId: In(folderIds) })
        }

        if (status !== undefined) {
            queryBuilder.andWhere({ status: In(status) })
        }

        const latestVersionSubquery = workflowVersionRepo()
            .createQueryBuilder('fv_sub')
            .select('fv_sub.id')
            .where('fv_sub."workflowId" = ff.id')
            .orderBy('fv_sub.created', 'DESC')
            .limit(1)

        if (versionState === WorkflowVersionState.DRAFT) {
            queryBuilder.leftJoinAndMapOne(
                'ff.version',
                'workflow_version',
                'latest_version',
                `latest_version."workflowId" = ff.id AND latest_version.id = (${latestVersionSubquery.getQuery()})`,
            )
        }
        else {
            queryBuilder.leftJoin(
                'workflow_version',
                'latest_version',
                `latest_version."workflowId" = ff.id AND latest_version.id = (${latestVersionSubquery.getQuery()})`,
            )
            queryBuilder.innerJoinAndMapOne(
                'ff.version',
                'workflow_version',
                'published_version',
                'published_version.id = ff.publishedVersionId',
            )
        }

        if (includeTriggerSource) {
            queryBuilder.leftJoinAndMapOne(
                'ff.triggerSource',
                'trigger_source',
                'ts',
                'ts."workflowId" = ff.id AND ts.deleted IS NULL',
            )
        }

        if (name !== undefined) {
            queryBuilder.andWhere('LOWER(latest_version."displayName") LIKE LOWER(:name)', { name: `%${name}%` })
        }

        if (externalIds !== undefined) {
            queryBuilder.andWhere('ff."externalId" IN (:...externalIds)', { externalIds })
        }

        if (connectionExternalIds !== undefined) {
            queryBuilder.andWhere('latest_version."connectionIds" && :connectionExternalIds', { connectionExternalIds })
        }

        if (agentExternalIds !== undefined) {
            queryBuilder.andWhere('latest_version."agentIds" && :agentExternalIds', { agentExternalIds })
        }

        const paginationResult = await paginator.paginate<Workflow & { version: WorkflowVersion | null, triggerSource?: TriggerSource }>(queryBuilder)

        const populatedWorkflows = await Promise.all(paginationResult.data.map(async (workflow) => {
            if (isNil(workflow.version)) {
                throw new ApplicationError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: {
                        entityType: 'WorkflowVersion',
                        message: `workflowId=${workflow.id}`,
                    },
                })
            }
            const migratedVersion = await workflowVersionMigrationService(log).migrate(workflow.version, workflow.workspaceId)
            return {
                ...workflow,
                version: migratedVersion,
                triggerSource: includeTriggerSource && workflow.triggerSource
                    ? {
                        schedule: workflow.triggerSource.schedule,
                    }
                    : undefined,
            }
        }))
        return paginationHelper.createPage(populatedWorkflows, paginationResult.cursor)
    },
    async exists(id: WorkflowId): Promise<boolean> {
        return workflowRepo().existsBy({
            id,
        })
    },
    async getOneById(id: string): Promise<Workflow | null> {
        const workflow = await workflowRepo().findOneBy({
            id,
        })
        if (isNil(workflow)) {
            return null
        }
        const workspaceExists = await workspaceService(log).exists({
            workspaceId: workflow.workspaceId,
        })
        if (!workspaceExists) {
            return null
        }
        return workflow
    },
    async getOne({ id, workspaceId, entityManager }: GetOneParams): Promise<Workflow | null> {
        const workspaceExists = await workspaceService(log).exists({
            workspaceId,
        })
        if (!workspaceExists) {
            return null
        }
        return workflowRepo(entityManager).findOneBy({
            id,
            workspaceId,
        })
    },

    async getOneOrThrow(params: GetOneParams): Promise<Workflow> {
        const workflow = await this.getOne(params)
        assertWorkflowIsNotNull(workflow)
        return workflow
    },

    async getOnePopulated({
        id,
        workspaceId,
        versionId,
        removeConnectionsName = false,
        removeSampleData = false,
        entityManager,
    }: GetOnePopulatedParams): Promise<PopulatedWorkflow | null> {
        const workflow = await workflowRepo(entityManager).findOne({
            where: {
                id,
                workspaceId,
            },
        })

        const workspaceExists = await workspaceService(log).exists({
            workspaceId,
        })
        if (isNil(workflow) || !workspaceExists) {
            return null
        }

        const workflowVersion = await workflowVersionService(log).getWorkflowVersionOrThrow({
            workflowId: id,
            versionId,
            removeConnectionsName,
            removeSampleData,
            entityManager,
            workspaceId,
        })

        const triggerSource = await triggerSourceService(log).getByWorkflowId({
            workflowId: id,
            workspaceId,
            simulate: undefined,
        })

        return {
            ...workflow,
            version: workflowVersion,
            triggerSource: triggerSource ? {
                schedule: triggerSource.schedule,
            } : undefined,
        }
    },

    async getOnePopulatedOrThrow({
        id,
        workspaceId,
        versionId,
        removeConnectionsName = false,
        removeSampleData = false,
        entityManager,
    }: GetOnePopulatedParams): Promise<PopulatedWorkflow> {
        const workflow = await this.getOnePopulated({
            id,
            workspaceId,
            versionId,
            removeConnectionsName,
            removeSampleData,
            entityManager,
        })

        assertWorkflowIsNotNull(workflow)
        return workflow
    },

    async update({
        id,
        userId = null,
        workspaceId,
        tenantId,
        operation,
        previousWorkflow,
        ip,
        emitEvents = true,
    }: UpdateParams): Promise<PopulatedWorkflow> {
        const workflowBeforeOperation = emitEvents
            ? previousWorkflow ?? await this.getOnePopulatedOrThrow({ id, workspaceId })
            : undefined

        let previouslyPublishedVersion: WorkflowVersion | undefined
        if (operation.type === WorkflowOperationType.LOCK_AND_PUBLISH || operation.type === WorkflowOperationType.CHANGE_STATUS) {
            const workflow = await this.getOneOrThrow({
                id,
                workspaceId,
            })
            if (workflow.operationStatus === WorkflowOperationStatus.DELETING) {
                throw new ApplicationError({
                    code: ErrorCode.WORKFLOW_OPERATION_IN_PROGRESS,
                    params: {
                        message: 'This workflow is getting deleted.',
                    },
                })
            }
            if (operation.type === WorkflowOperationType.LOCK_AND_PUBLISH && workflow.status === WorkflowStatus.ENABLED && !isNil(workflow.publishedVersionId)) {
                previouslyPublishedVersion = await workflowVersionService(log).getWorkflowVersionOrThrow({ workflowId: id, versionId: workflow.publishedVersionId })
            }
        }

        switch (operation.type) {
            case WorkflowOperationType.LOCK_AND_PUBLISH: {
                const publishedWorkflow = await this.updatedPublishedVersionId({
                    id,
                    userId,
                    workspaceId,
                    tenantId,
                })
                const isRepublish = !isNil(previouslyPublishedVersion) && workflowPublishUtils.isSameTrigger({
                    published: previouslyPublishedVersion.trigger,
                    toPublish: publishedWorkflow.version.trigger,
                })
                await applyStatusChange({ id, workspaceId, newStatus: operation.request.status ?? WorkflowStatus.ENABLED, isRepublish }, log)
                break
            }

            case WorkflowOperationType.CHANGE_STATUS: {
                await applyStatusChange({ id, workspaceId, newStatus: operation.request.status }, log)
                break
            }

            case WorkflowOperationType.CHANGE_FOLDER: {
                await workflowRepo().update(id, {
                    folderId: operation.request.folderId,
                })
                log.info({ workflow: { id }, folderId: operation.request.folderId }, 'Workflow moved to folder')
                break
            }

            case WorkflowOperationType.UPDATE_METADATA: {
                await this.updateMetadata({
                    id,
                    workspaceId,
                    metadata: operation.request.metadata,
                })
                break
            }

            case WorkflowOperationType.UPDATE_MINUTES_SAVED: {
                await workflowRepo().update(id, {
                    timeSavedPerRun: operation.request.timeSavedPerRun,
                })
                break
            }

            case WorkflowOperationType.UPDATE_OWNER: {
                await workflowRepo().update(id, {
                    ownerId: operation.request.ownerId,
                })
                break
            }
            case WorkflowOperationType.ADD_NOTE:
            case WorkflowOperationType.UPDATE_NOTE:
            case WorkflowOperationType.DELETE_NOTE: {
                const lastVersion = await workflowVersionService(
                    log,
                ).getWorkflowVersionOrThrow({
                    workflowId: id,
                    versionId: undefined,
                })
                await workflowVersionService(log).applyOperation({
                    userId,
                    workspaceId,
                    tenantId,
                    workflowVersion: lastVersion,
                    userOperation: operation,
                })
                break
            }
            default: {
                const { version: lastVersion, createdNewDraft } = await createNewDraftIfVersionIsPublished({
                    workflowId: id,
                    workspaceId,
                    tenantId,
                    userId,
                    log,
                })
                const { error } = await tryCatch(() => workflowVersionService(log).applyOperation({
                    userId,
                    workspaceId,
                    tenantId,
                    workflowVersion: lastVersion,
                    userOperation: operation,
                }))
                if (!isNil(error)) {
                    if (createdNewDraft) {
                        await tryCatch(() => workflowVersionRepo().delete({ id: lastVersion.id, workflowId: id }))
                    }
                    throw error
                }
            }
        }

        const updatedWorkflow = await this.getOnePopulatedOrThrow({
            id,
            workspaceId,
        })
        if (!isNil(workflowBeforeOperation)) {
            workflowSideEffects(log).onOperationApplied({
                tenantId,
                workspaceId,
                userId,
                ip,
                workflow: updatedWorkflow,
                previousVersion: workflowBeforeOperation.version,
                previousStatus: workflowBeforeOperation.status,
                operation,
            })
        }
        return updatedWorkflow
    },
    async updatedPublishedVersionId({
        id,
        userId,
        workspaceId,
        tenantId,
    }: UpdatePublishedVersionIdParams): Promise<PopulatedWorkflow> {
        const workflowToUpdate = await this.getOneOrThrow({ id, workspaceId })

        const workflowVersionToPublish = await workflowVersionService(log).getWorkflowVersionOrThrow({
            workflowId: id,
            versionId: undefined,
        })

        if (workflowToUpdate.status === WorkflowStatus.ENABLED && !isNil(workflowToUpdate.publishedVersionId)) {
            await triggerSourceService(log).disable({
                workflowId: workflowToUpdate.id,
                workspaceId: workflowToUpdate.workspaceId,
                simulate: false,
                ignoreError: true,
            })
        }

        const publishedWorkflow = await transaction(async (entityManager) => {
            const lockedWorkflowVersion = await lockWorkflowVersionIfNotLocked({
                workflowVersion: workflowVersionToPublish,
                userId,
                workspaceId,
                tenantId,
                entityManager,
                log,
            })

            workflowToUpdate.publishedVersionId = lockedWorkflowVersion.id
            workflowToUpdate.status = WorkflowStatus.DISABLED
            const updatedWorkflow = await workflowRepo(entityManager).save(workflowToUpdate)
            await workflowExecutionCache(log).invalidate(updatedWorkflow.id)
            return {
                ...updatedWorkflow,
                version: lockedWorkflowVersion,
            }
        })
        // a static import here closes a circular graph (→ websockets → mcp/tools → mcp-utils → back here) that crashes module load.
        const { websocketService } = await import('../../core/websockets.service')
        websocketService.notifyWorkers().workflowPublished({ workflowId: publishedWorkflow.id, workflowVersionId: publishedWorkflow.version.id, workspaceId: publishedWorkflow.workspaceId })
        return publishedWorkflow
    },

    async delete({ id, workspaceId, previousWorkflow, userId, ip, emitEvents = true }: DeleteParams): Promise<void> {
        const deletedWorkflow = emitEvents
            ? previousWorkflow ?? await this.getOnePopulatedOrThrow({ id, workspaceId })
            : undefined
        const workflow = await this.getOneOrThrow({
            id,
            workspaceId,
        })
        if (workflow.operationStatus !== WorkflowOperationStatus.NONE) {
            throw new ApplicationError({
                code: ErrorCode.WORKFLOW_OPERATION_IN_PROGRESS,
                params: {
                    message: `Workflow ${id} is already being ${workflow.operationStatus}`,
                },
            })
        }
        await this.addDeleteWorkflowJob(workflow)
        await workflowRepo().update(id, {
            operationStatus: WorkflowOperationStatus.DELETING,
        })
        log.info({ workflow: { id }, workspace: { id: workspaceId } }, 'Workflow deletion requested')
        if (!isNil(deletedWorkflow)) {
            workflowSideEffects(log).onDeleted({
                tenantId: await workspaceService(log).getTenantId(workspaceId),
                workspaceId,
                userId,
                ip,
                workflow: deletedWorkflow,
            })
        }
    },

    async deleteAllByTenantId(tenantId: TenantId): Promise<void> {
        const workspaceIds = await workspaceService(log).getWorkspaceIdsByTenant(tenantId)
        const workflows = await workflowRepo().findBy({
            workspaceId: In(workspaceIds),
        })
        await Promise.all(workflows.map((workflow) => this.delete({ id: workflow.id, workspaceId: workflow.workspaceId, emitEvents: false })))
    },

    async getTemplate({
        workflowId,
        userMetadata,
        versionId,
        workspaceId,
    }: GetTemplateParams): Promise<SharedTemplate> {
        const workflow = await this.getOnePopulatedOrThrow({
            id: workflowId,
            workspaceId,
            versionId,
            removeConnectionsName: true,
            removeSampleData: true,
        })

        const template: SharedTemplate = {
            name: workflow.version.displayName,
            summary: '',
            description: '',
            connectors: Array.from(new Set(workflowConnectorUtil.getUsedConnectors(workflow.version.trigger))),
            workflows: [workflow.version],
            tags: [],
            blogUrl: '',
            metadata: {
                externalId: workflow.externalId,
            },
            author: userMetadata ? `${userMetadata.firstName} ${userMetadata.lastName}` : '',
            categories: [],
            type: TemplateType.SHARED,
            status: TemplateStatus.PUBLISHED,
        }
        return template
    },

    async count({ workspaceId, folderId, status }: CountParams): Promise<number> {
        if (folderId === undefined) {
            return workflowRepo().countBy({ workspaceId, status })
        }

        return workflowRepo().countBy({
            folderId: folderId !== UncategorizedFolderId ? folderId : IsNull(),
            workspaceId,
            status,
        })
    },

    async existsByWorkspaceAndStatus(params: ExistsByWorkspaceAndStatusParams): Promise<boolean> {
        const { workspaceId, status, entityManager } = params

        return workflowRepo(entityManager).existsBy({
            workspaceId,
            status,
        })
    },

    async updateMetadata({
        id,
        workspaceId,
        metadata,
    }: UpdateMetadataParams): Promise<PopulatedWorkflow> {
        const workflowToUpdate = await this.getOneOrThrow({
            id,
            workspaceId,
        })

        workflowToUpdate.metadata = metadata

        await workflowRepo().save(workflowToUpdate)

        return this.getOnePopulatedOrThrow({
            id,
            workspaceId,
        })
    },

    async updateLastModified({ workflowId, workspaceId, entityManager }: UpdateLastModifiedParams): Promise<void> {
        await workflowRepo(entityManager).update({
            id: workflowId,
            workspaceId,
        }, {
            updated: dayjs().toISOString(),
        })
    },

    addDeleteWorkflowJob: async (workflow: Workflow): Promise<void> => {
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.DELETE_WORKFLOW,
                data: {
                    workflow,
                    preDeleteDone: false,
                },
                jobId: `delete-workflow-${workflow.id}`,
            },
            schedule: {
                type: 'one-time',
                date: apDayjs(),
            },
            customConfig: {
                backoff: {
                    type: 'exponential',
                    delay: apDayjsDuration(5, 'second').asMilliseconds(),
                },
            },
        })
    },

    async countWorkflowsByWorkspaces(workspaceIds: WorkspaceId[]): Promise<Map<WorkspaceId, number>> {
        if (workspaceIds.length === 0) return new Map()
        
        const result = await workflowRepo()
            .createQueryBuilder('workflow')
            .select('workflow.workspaceId', 'workspaceId')
            .addSelect('COUNT(*)', 'count')
            .where('workflow.workspaceId IN (:...workspaceIds)', { workspaceIds })
            .groupBy('workflow.workspaceId')
            .getRawMany()
        
        return new Map(result.map(r => [r.workspaceId, parseInt(r.count)]))
    },

    async countActiveWorkflowsByWorkspaces(workspaceIds: WorkspaceId[]): Promise<Map<WorkspaceId, number>> {
        if (workspaceIds.length === 0) return new Map()
        
        const result = await workflowRepo()
            .createQueryBuilder('workflow')
            .select('workflow.workspaceId', 'workspaceId')
            .addSelect('COUNT(*)', 'count')
            .where('workflow.workspaceId IN (:...workspaceIds)', { workspaceIds })
            .andWhere('workflow.status = :status', { status: WorkflowStatus.ENABLED })
            .andWhere('workflow.operationStatus != :deleting', { deleting: WorkflowOperationStatus.DELETING })
            .groupBy('workflow.workspaceId')
            .getRawMany()
        
        return new Map(result.map(r => [r.workspaceId, parseInt(r.count)]))
    },
})


const lockWorkflowVersionIfNotLocked = async ({
    workflowVersion,
    userId,
    workspaceId,
    tenantId,
    entityManager,
    log,
}: LockWorkflowVersionIfNotLockedParams): Promise<WorkflowVersion> => {
    if (workflowVersion.state === WorkflowVersionState.LOCKED) {
        return workflowVersion
    }

    return workflowVersionService(log).applyOperation({
        userId,
        workspaceId,
        tenantId,
        workflowVersion,
        userOperation: {
            type: WorkflowOperationType.LOCK_WORKFLOW,
            request: {},
        },
        entityManager,
    })
}


async function applyStatusChange(params: {
    id: WorkflowId
    workspaceId: WorkspaceId
    newStatus: WorkflowStatus
    isRepublish?: boolean
}, log: FastifyBaseLogger): Promise<void> {
    const triggerTimeout = system.getNumberOrThrow(AppSystemProp.TRIGGER_TIMEOUT_SECONDS)
    await distributedLock(log).runExclusive({
        key: `workflow-status-change-${params.id}`,
        timeoutInSeconds: triggerTimeout + 30,
        fn: async () => {
            const workflowToUpdate = await workflowService(log).getOneOrThrow({
                id: params.id,
                workspaceId: params.workspaceId,
            })
            if (workflowToUpdate.status === params.newStatus) {
                return
            }

            const publishedWorkflowVersionId = workflowToUpdate.publishedVersionId
            assertNotNullOrUndefined(publishedWorkflowVersionId, 'publishedWorkflowVersionId is required')
            const publishedWorkflowVersion = await workflowVersionService(log).getWorkflowVersionOrThrow({
                workflowId: workflowToUpdate.id,
                versionId: publishedWorkflowVersionId,
            })

            await workflowSideEffects(log).preUpdateStatus({
                workflowToUpdate,
                publishedWorkflowVersion,
                newStatus: params.newStatus,
                templateId: workflowToUpdate.templateId ?? undefined,
                isRepublish: params.isRepublish,
            })

            await workflowRepo().save({
                ...workflowToUpdate,
                status: params.newStatus,
                publishedVersionId: publishedWorkflowVersion.id,
            })
            await workflowExecutionCache(log).invalidate(params.id)
        },
    })
}

export const getFolderIdFromRequest = async ({ workspaceId, folderId, folderName, log }: { workspaceId: string, folderId: string | undefined, folderName: string | undefined, log: FastifyBaseLogger }) => {
    if (folderId) {
        return folderId
    }
    if (folderName) {
        return (await workflowFolderService(log).upsert({
            workspaceId,
            request: {
                workspaceId,
                displayName: folderName,
            },
        })).id
    }
    return null
}

const assertWorkflowIsNotNull: <T extends Workflow>(
    workflow: T | null
) => asserts workflow is T = <T>(workflow: T | null) => {
    if (isNil(workflow)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {},
        })
    }
}

type CreateParams = EventEmissionParams & {
    workspaceId: WorkspaceId
    request: CreateWorkflowRequest
    ownerId?: UserId
    externalId?: string
    templateId?: string
    createdBy?: WorkflowCreator
}

type ListParamsBase = {
    cursorRequest?: Cursor
    limit?: number
    folderId?: string
    folderIds?: string[]
    status?: WorkflowStatus[]
    name?: string
    versionState?: WorkflowVersionState
    externalIds?: string[]
    connectionExternalIds?: string[]
    agentExternalIds?: string[]
    includeTriggerSource?: boolean
}

type ListParams = ListParamsBase & (
    | { workspaceIds: WorkspaceId[], tenantId?: never }
    | { workspaceIds?: never, tenantId: TenantId }
)

type GetOneParams = {
    id: WorkflowId
    workspaceId: WorkspaceId
    entityManager?: EntityManager
}

type GetOnePopulatedParams = GetOneParams & {
    versionId?: WorkflowVersionId
    removeConnectionsName?: boolean
    removeSampleData?: boolean
}

type GetTemplateParams = {
    workflowId: WorkflowId
    userMetadata: UserWithMetaInformation | null
    workspaceId: WorkspaceId
    versionId: WorkflowVersionId | undefined
}

type CountParams = {
    workspaceId: WorkspaceId
    folderId?: string
    status?: WorkflowStatus
}

type UpdateParams = EventEmissionParams & {
    id: WorkflowId
    userId?: UserId | null
    workspaceId: WorkspaceId
    operation: WorkflowOperationRequest
    tenantId: TenantId
    previousWorkflow?: PopulatedWorkflow
}

type UpdatePublishedVersionIdParams = {
    id: WorkflowId
    userId: UserId | null
    tenantId: TenantId
    workspaceId: WorkspaceId
}

type DeleteParams = EventEmissionParams & {
    id: WorkflowId
    workspaceId: WorkspaceId
    userId?: UserId
    previousWorkflow?: PopulatedWorkflow
}

type EventEmissionParams = {
    ip?: string
    emitEvents?: boolean
}


type NewWorkflow = Omit<Workflow, 'created' | 'updated'>

type LockWorkflowVersionIfNotLockedParams = {
    workflowVersion: WorkflowVersion
    userId: UserId | null
    workspaceId: WorkspaceId
    tenantId: TenantId
    entityManager: EntityManager
    log: FastifyBaseLogger
}

type ExistsByWorkspaceAndStatusParams = {
    workspaceId: WorkspaceId
    status: WorkflowStatus
    entityManager: EntityManager
}

type UpdateMetadataParams = {
    id: WorkflowId
    workspaceId: WorkspaceId
    metadata: Metadata | null | undefined
}

type UpdateLastModifiedParams = {
    workflowId: WorkflowId
    workspaceId: WorkspaceId
    entityManager?: EntityManager
}

/** When the latest version is locked (published snapshot), creates a new draft and imports it. */
async function createNewDraftIfVersionIsPublished({
    workflowId,
    workspaceId,
    tenantId,
    userId,
    log,
}: {
    workflowId: WorkflowId
    workspaceId: WorkspaceId
    tenantId: TenantId
    userId: UserId | null
    log: FastifyBaseLogger
}): Promise<{ version: WorkflowVersion, createdNewDraft: boolean }> {
    let lastVersion = await workflowVersionService(log).getWorkflowVersionOrThrow({
        workflowId,
        versionId: undefined,
    })
    const createdNewDraft = lastVersion.state === WorkflowVersionState.LOCKED
    if (lastVersion.state === WorkflowVersionState.LOCKED) {
        const lockedVersion = lastVersion
        const operations: WorkflowOperationRequest[] = [{
            type: WorkflowOperationType.IMPORT_WORKFLOW,
            request: lockedVersion,
        }]
        if (
            lockedVersion.trigger.type === WorkflowTriggerType.CONNECTOR &&
            !isNil(lockedVersion.trigger.settings.sampleData)
        ) {
            operations.push({
                type: WorkflowOperationType.UPDATE_SAMPLE_DATA_INFO,
                request: {
                    stepName: lockedVersion.trigger.name,
                    sampleDataSettings: lockedVersion.trigger.settings.sampleData,
                },
            })
        }
        lastVersion = await transaction(async (entityManager) => {
            let draftVersion = await workflowVersionService(log).createEmptyVersion({
                workflowId,
                displayName: lockedVersion.displayName,
                notes: lockedVersion.notes,
                schemaVersion: lockedVersion.schemaVersion,
                entityManager,
            })
            for (const operation of operations) {
                draftVersion = await workflowVersionService(log).applyOperation({
                    userId,
                    workspaceId,
                    tenantId,
                    workflowVersion: draftVersion,
                    userOperation: operation,
                    entityManager,
                })
            }
            return draftVersion
        })
    }
    return { version: lastVersion, createdNewDraft }
}
