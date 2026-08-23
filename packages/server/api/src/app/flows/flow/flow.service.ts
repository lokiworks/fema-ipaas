import { apId, assertNotNullOrUndefined, Cursor, ErrorCode, FlowId, FlowVersionId, isNil, Metadata, PlatformError, PlatformId, SeekPage, tryCatch, UserId, WorkspaceId } from '@fema/core-utils'
import { apDayjs, apDayjsDuration } from '@fema/server-utils'
import { CreateFlowRequest, Flow, flowConnectorUtil, FlowCreator, FlowOperationRequest, FlowOperationStatus, FlowOperationType, FlowStatus, FlowTriggerType, FlowVersion, FlowVersionState, PopulatedFlow, SharedTemplate, TelemetryEventName, TemplateStatus, TemplateType, TriggerSource, UncategorizedFolderId, UserWithMetaInformation } from '@fema/shared'
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
import { flowVersionMigrationService } from '../flow-version/flow-version-migration.service'
import { flowVersionRepo, flowVersionService } from '../flow-version/flow-version.service'
import { flowFolderService } from '../folder/folder.service'
import { flowExecutionCache } from './flow-execution-cache'
import { flowPublishUtils } from './flow-publish-utils'
import { flowSideEffects } from './flow-service-side-effects'
import { FlowEntity } from './flow.entity'
import { flowRepo } from './flow.repo'



export const flowService = (log: FastifyBaseLogger) => ({
    async create({ workspaceId, request, externalId, ownerId, templateId, createdBy, ip, emitEvents = true }: CreateParams): Promise<PopulatedFlow> {
        const folderId = await getFolderIdFromRequest({ workspaceId, folderId: request.folderId, folderName: request.folderName, log })
        const newFlow: NewFlow = {
            id: apId(),
            workspaceId,
            folderId,
            status: FlowStatus.DISABLED,
            ownerId,
            publishedVersionId: null,
            externalId: externalId ?? apId(),
            metadata: request.metadata,
            operationStatus: FlowOperationStatus.NONE,
            templateId,
            createdBy,
        }
        const { savedFlow, savedFlowVersion } = await transaction(async (entityManager) => {
            const flow = await flowRepo(entityManager).save(newFlow)
            const flowVersion = await flowVersionService(log).createEmptyVersion({
                flowId: flow.id,
                displayName: request.displayName,
                notes: [],
                schemaVersion: null,
                entityManager,
            })
            return { savedFlow: flow, savedFlowVersion: flowVersion }
        })

        rejectedPromiseHandler(
            telemetry(log).trackWorkspace(savedFlow.workspaceId, {
                name: TelemetryEventName.CREATED_FLOW,
                payload: {
                    flowId: savedFlow.id,
                },
            }),
            log,
        )

        log.info({ flow: { id: savedFlow.id }, workspace: { id: workspaceId }, displayName: request.displayName }, 'Flow created')
        const createdFlow = {
            ...savedFlow,
            version: savedFlowVersion,
        }
        if (emitEvents) {
            flowSideEffects(log).onCreated({
                platformId: await workspaceService(log).getPlatformId(workspaceId),
                workspaceId,
                userId: ownerId,
                ip,
                flow: createdFlow,
            })
        }
        return createdFlow
    },

    async list({
        workspaceIds,
        platformId,
        cursorRequest,
        limit = Paginator.NO_LIMIT,
        folderId,
        folderIds,
        status,
        name,
        connectionExternalIds,
        agentExternalIds,
        externalIds,
        versionState = FlowVersionState.DRAFT,
        includeTriggerSource = true,
    }: ListParams): Promise<SeekPage<PopulatedFlow>> {
        const decodedCursor = paginationHelper.decodeCursor(cursorRequest)
        const paginator = buildPaginator({
            entity: FlowEntity,
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

        const queryBuilder = flowRepo().createQueryBuilder('ff').where({ operationStatus: Not(FlowOperationStatus.DELETING) })

        if (workspaceIds) {
            queryBuilder.andWhere({ workspaceId: In(workspaceIds) })
        }
        else {
            queryBuilder
                .innerJoin('workspace', 'workspace', 'workspace.id = ff."workspaceId"')
                .andWhere('workspace."platformId" = :platformId', { platformId })
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

        const latestVersionSubquery = flowVersionRepo()
            .createQueryBuilder('fv_sub')
            .select('fv_sub.id')
            .where('fv_sub."flowId" = ff.id')
            .orderBy('fv_sub.created', 'DESC')
            .limit(1)

        if (versionState === FlowVersionState.DRAFT) {
            queryBuilder.leftJoinAndMapOne(
                'ff.version',
                'flow_version',
                'latest_version',
                `latest_version."flowId" = ff.id AND latest_version.id = (${latestVersionSubquery.getQuery()})`,
            )
        }
        else {
            queryBuilder.leftJoin(
                'flow_version',
                'latest_version',
                `latest_version."flowId" = ff.id AND latest_version.id = (${latestVersionSubquery.getQuery()})`,
            )
            queryBuilder.innerJoinAndMapOne(
                'ff.version',
                'flow_version',
                'published_version',
                'published_version.id = ff.publishedVersionId',
            )
        }

        if (includeTriggerSource) {
            queryBuilder.leftJoinAndMapOne(
                'ff.triggerSource',
                'trigger_source',
                'ts',
                'ts."flowId" = ff.id AND ts.deleted IS NULL',
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

        const paginationResult = await paginator.paginate<Flow & { version: FlowVersion | null, triggerSource?: TriggerSource }>(queryBuilder)

        const populatedFlows = await Promise.all(paginationResult.data.map(async (flow) => {
            if (isNil(flow.version)) {
                throw new PlatformError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: {
                        entityType: 'FlowVersion',
                        message: `flowId=${flow.id}`,
                    },
                })
            }
            const migratedVersion = await flowVersionMigrationService(log).migrate(flow.version, flow.workspaceId)
            return {
                ...flow,
                version: migratedVersion,
                triggerSource: includeTriggerSource && flow.triggerSource
                    ? {
                        schedule: flow.triggerSource.schedule,
                    }
                    : undefined,
            }
        }))
        return paginationHelper.createPage(populatedFlows, paginationResult.cursor)
    },
    async exists(id: FlowId): Promise<boolean> {
        return flowRepo().existsBy({
            id,
        })
    },
    async getOneById(id: string): Promise<Flow | null> {
        const flow = await flowRepo().findOneBy({
            id,
        })
        if (isNil(flow)) {
            return null
        }
        const workspaceExists = await workspaceService(log).exists({
            workspaceId: flow.workspaceId,
        })
        if (!workspaceExists) {
            return null
        }
        return flow
    },
    async getOne({ id, workspaceId, entityManager }: GetOneParams): Promise<Flow | null> {
        const workspaceExists = await workspaceService(log).exists({
            workspaceId,
        })
        if (!workspaceExists) {
            return null
        }
        return flowRepo(entityManager).findOneBy({
            id,
            workspaceId,
        })
    },

    async getOneOrThrow(params: GetOneParams): Promise<Flow> {
        const flow = await this.getOne(params)
        assertFlowIsNotNull(flow)
        return flow
    },

    async getOnePopulated({
        id,
        workspaceId,
        versionId,
        removeConnectionsName = false,
        removeSampleData = false,
        entityManager,
    }: GetOnePopulatedParams): Promise<PopulatedFlow | null> {
        const flow = await flowRepo(entityManager).findOne({
            where: {
                id,
                workspaceId,
            },
        })

        const workspaceExists = await workspaceService(log).exists({
            workspaceId,
        })
        if (isNil(flow) || !workspaceExists) {
            return null
        }

        const flowVersion = await flowVersionService(log).getFlowVersionOrThrow({
            flowId: id,
            versionId,
            removeConnectionsName,
            removeSampleData,
            entityManager,
            workspaceId,
        })

        const triggerSource = await triggerSourceService(log).getByFlowId({
            flowId: id,
            workspaceId,
            simulate: undefined,
        })

        return {
            ...flow,
            version: flowVersion,
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
    }: GetOnePopulatedParams): Promise<PopulatedFlow> {
        const flow = await this.getOnePopulated({
            id,
            workspaceId,
            versionId,
            removeConnectionsName,
            removeSampleData,
            entityManager,
        })

        assertFlowIsNotNull(flow)
        return flow
    },

    async update({
        id,
        userId = null,
        workspaceId,
        platformId,
        operation,
        previousFlow,
        ip,
        emitEvents = true,
    }: UpdateParams): Promise<PopulatedFlow> {
        const flowBeforeOperation = emitEvents
            ? previousFlow ?? await this.getOnePopulatedOrThrow({ id, workspaceId })
            : undefined

        let previouslyPublishedVersion: FlowVersion | undefined
        if (operation.type === FlowOperationType.LOCK_AND_PUBLISH || operation.type === FlowOperationType.CHANGE_STATUS) {
            const flow = await this.getOneOrThrow({
                id,
                workspaceId,
            })
            if (flow.operationStatus === FlowOperationStatus.DELETING) {
                throw new PlatformError({
                    code: ErrorCode.FLOW_OPERATION_IN_PROGRESS,
                    params: {
                        message: 'This flow is getting deleted.',
                    },
                })
            }
            if (operation.type === FlowOperationType.LOCK_AND_PUBLISH && flow.status === FlowStatus.ENABLED && !isNil(flow.publishedVersionId)) {
                previouslyPublishedVersion = await flowVersionService(log).getFlowVersionOrThrow({ flowId: id, versionId: flow.publishedVersionId })
            }
        }

        switch (operation.type) {
            case FlowOperationType.LOCK_AND_PUBLISH: {
                const publishedFlow = await this.updatedPublishedVersionId({
                    id,
                    userId,
                    workspaceId,
                    platformId,
                })
                const isRepublish = !isNil(previouslyPublishedVersion) && flowPublishUtils.isSameTrigger({
                    published: previouslyPublishedVersion.trigger,
                    toPublish: publishedFlow.version.trigger,
                })
                await applyStatusChange({ id, workspaceId, newStatus: operation.request.status ?? FlowStatus.ENABLED, isRepublish }, log)
                break
            }

            case FlowOperationType.CHANGE_STATUS: {
                await applyStatusChange({ id, workspaceId, newStatus: operation.request.status }, log)
                break
            }

            case FlowOperationType.CHANGE_FOLDER: {
                await flowRepo().update(id, {
                    folderId: operation.request.folderId,
                })
                log.info({ flow: { id }, folderId: operation.request.folderId }, 'Flow moved to folder')
                break
            }

            case FlowOperationType.UPDATE_METADATA: {
                await this.updateMetadata({
                    id,
                    workspaceId,
                    metadata: operation.request.metadata,
                })
                break
            }

            case FlowOperationType.UPDATE_MINUTES_SAVED: {
                await flowRepo().update(id, {
                    timeSavedPerRun: operation.request.timeSavedPerRun,
                })
                break
            }

            case FlowOperationType.UPDATE_OWNER: {
                await flowRepo().update(id, {
                    ownerId: operation.request.ownerId,
                })
                break
            }
            case FlowOperationType.ADD_NOTE:
            case FlowOperationType.UPDATE_NOTE:
            case FlowOperationType.DELETE_NOTE: {
                const lastVersion = await flowVersionService(
                    log,
                ).getFlowVersionOrThrow({
                    flowId: id,
                    versionId: undefined,
                })
                await flowVersionService(log).applyOperation({
                    userId,
                    workspaceId,
                    platformId,
                    flowVersion: lastVersion,
                    userOperation: operation,
                })
                break
            }
            default: {
                const { version: lastVersion, createdNewDraft } = await createNewDraftIfVersionIsPublished({
                    flowId: id,
                    workspaceId,
                    platformId,
                    userId,
                    log,
                })
                const { error } = await tryCatch(() => flowVersionService(log).applyOperation({
                    userId,
                    workspaceId,
                    platformId,
                    flowVersion: lastVersion,
                    userOperation: operation,
                }))
                if (!isNil(error)) {
                    if (createdNewDraft) {
                        await tryCatch(() => flowVersionRepo().delete({ id: lastVersion.id, flowId: id }))
                    }
                    throw error
                }
            }
        }

        const updatedFlow = await this.getOnePopulatedOrThrow({
            id,
            workspaceId,
        })
        if (!isNil(flowBeforeOperation)) {
            flowSideEffects(log).onOperationApplied({
                platformId,
                workspaceId,
                userId,
                ip,
                flow: updatedFlow,
                previousVersion: flowBeforeOperation.version,
                previousStatus: flowBeforeOperation.status,
                operation,
            })
        }
        return updatedFlow
    },
    async updatedPublishedVersionId({
        id,
        userId,
        workspaceId,
        platformId,
    }: UpdatePublishedVersionIdParams): Promise<PopulatedFlow> {
        const flowToUpdate = await this.getOneOrThrow({ id, workspaceId })

        const flowVersionToPublish = await flowVersionService(log).getFlowVersionOrThrow({
            flowId: id,
            versionId: undefined,
        })

        if (flowToUpdate.status === FlowStatus.ENABLED && !isNil(flowToUpdate.publishedVersionId)) {
            await triggerSourceService(log).disable({
                flowId: flowToUpdate.id,
                workspaceId: flowToUpdate.workspaceId,
                simulate: false,
                ignoreError: true,
            })
        }

        const publishedFlow = await transaction(async (entityManager) => {
            const lockedFlowVersion = await lockFlowVersionIfNotLocked({
                flowVersion: flowVersionToPublish,
                userId,
                workspaceId,
                platformId,
                entityManager,
                log,
            })

            flowToUpdate.publishedVersionId = lockedFlowVersion.id
            flowToUpdate.status = FlowStatus.DISABLED
            const updatedFlow = await flowRepo(entityManager).save(flowToUpdate)
            await flowExecutionCache(log).invalidate(updatedFlow.id)
            return {
                ...updatedFlow,
                version: lockedFlowVersion,
            }
        })
        // a static import here closes a circular graph (→ websockets → mcp/tools → mcp-utils → back here) that crashes module load.
        const { websocketService } = await import('../../core/websockets.service')
        websocketService.notifyWorkers().flowPublished({ flowId: publishedFlow.id, flowVersionId: publishedFlow.version.id, workspaceId: publishedFlow.workspaceId })
        return publishedFlow
    },

    async delete({ id, workspaceId, previousFlow, userId, ip, emitEvents = true }: DeleteParams): Promise<void> {
        const deletedFlow = emitEvents
            ? previousFlow ?? await this.getOnePopulatedOrThrow({ id, workspaceId })
            : undefined
        const flow = await this.getOneOrThrow({
            id,
            workspaceId,
        })
        if (flow.operationStatus !== FlowOperationStatus.NONE) {
            throw new PlatformError({
                code: ErrorCode.FLOW_OPERATION_IN_PROGRESS,
                params: {
                    message: `Flow ${id} is already being ${flow.operationStatus}`,
                },
            })
        }
        await this.addDeleteFlowJob(flow)
        await flowRepo().update(id, {
            operationStatus: FlowOperationStatus.DELETING,
        })
        log.info({ flow: { id }, workspace: { id: workspaceId } }, 'Flow deletion requested')
        if (!isNil(deletedFlow)) {
            flowSideEffects(log).onDeleted({
                platformId: await workspaceService(log).getPlatformId(workspaceId),
                workspaceId,
                userId,
                ip,
                flow: deletedFlow,
            })
        }
    },

    async deleteAllByPlatformId(platformId: PlatformId): Promise<void> {
        const workspaceIds = await workspaceService(log).getWorkspaceIdsByPlatform(platformId)
        const flows = await flowRepo().findBy({
            workspaceId: In(workspaceIds),
        })
        await Promise.all(flows.map((flow) => this.delete({ id: flow.id, workspaceId: flow.workspaceId, emitEvents: false })))
    },

    async getTemplate({
        flowId,
        userMetadata,
        versionId,
        workspaceId,
    }: GetTemplateParams): Promise<SharedTemplate> {
        const flow = await this.getOnePopulatedOrThrow({
            id: flowId,
            workspaceId,
            versionId,
            removeConnectionsName: true,
            removeSampleData: true,
        })

        const template: SharedTemplate = {
            name: flow.version.displayName,
            summary: '',
            description: '',
            connectors: Array.from(new Set(flowConnectorUtil.getUsedConnectors(flow.version.trigger))),
            flows: [flow.version],
            tags: [],
            blogUrl: '',
            metadata: {
                externalId: flow.externalId,
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
            return flowRepo().countBy({ workspaceId, status })
        }

        return flowRepo().countBy({
            folderId: folderId !== UncategorizedFolderId ? folderId : IsNull(),
            workspaceId,
            status,
        })
    },

    async existsByWorkspaceAndStatus(params: ExistsByWorkspaceAndStatusParams): Promise<boolean> {
        const { workspaceId, status, entityManager } = params

        return flowRepo(entityManager).existsBy({
            workspaceId,
            status,
        })
    },

    async updateMetadata({
        id,
        workspaceId,
        metadata,
    }: UpdateMetadataParams): Promise<PopulatedFlow> {
        const flowToUpdate = await this.getOneOrThrow({
            id,
            workspaceId,
        })

        flowToUpdate.metadata = metadata

        await flowRepo().save(flowToUpdate)

        return this.getOnePopulatedOrThrow({
            id,
            workspaceId,
        })
    },

    async updateLastModified({ flowId, workspaceId, entityManager }: UpdateLastModifiedParams): Promise<void> {
        await flowRepo(entityManager).update({
            id: flowId,
            workspaceId,
        }, {
            updated: dayjs().toISOString(),
        })
    },

    addDeleteFlowJob: async (flow: Flow): Promise<void> => {
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.DELETE_FLOW,
                data: {
                    flow,
                    preDeleteDone: false,
                },
                jobId: `delete-flow-${flow.id}`,
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

    async countFlowsByWorkspaces(workspaceIds: WorkspaceId[]): Promise<Map<WorkspaceId, number>> {
        if (workspaceIds.length === 0) return new Map()
        
        const result = await flowRepo()
            .createQueryBuilder('flow')
            .select('flow.workspaceId', 'workspaceId')
            .addSelect('COUNT(*)', 'count')
            .where('flow.workspaceId IN (:...workspaceIds)', { workspaceIds })
            .groupBy('flow.workspaceId')
            .getRawMany()
        
        return new Map(result.map(r => [r.workspaceId, parseInt(r.count)]))
    },

    async countActiveFlowsByWorkspaces(workspaceIds: WorkspaceId[]): Promise<Map<WorkspaceId, number>> {
        if (workspaceIds.length === 0) return new Map()
        
        const result = await flowRepo()
            .createQueryBuilder('flow')
            .select('flow.workspaceId', 'workspaceId')
            .addSelect('COUNT(*)', 'count')
            .where('flow.workspaceId IN (:...workspaceIds)', { workspaceIds })
            .andWhere('flow.status = :status', { status: FlowStatus.ENABLED })
            .andWhere('flow.operationStatus != :deleting', { deleting: FlowOperationStatus.DELETING })
            .groupBy('flow.workspaceId')
            .getRawMany()
        
        return new Map(result.map(r => [r.workspaceId, parseInt(r.count)]))
    },
})


const lockFlowVersionIfNotLocked = async ({
    flowVersion,
    userId,
    workspaceId,
    platformId,
    entityManager,
    log,
}: LockFlowVersionIfNotLockedParams): Promise<FlowVersion> => {
    if (flowVersion.state === FlowVersionState.LOCKED) {
        return flowVersion
    }

    return flowVersionService(log).applyOperation({
        userId,
        workspaceId,
        platformId,
        flowVersion,
        userOperation: {
            type: FlowOperationType.LOCK_FLOW,
            request: {},
        },
        entityManager,
    })
}


async function applyStatusChange(params: {
    id: FlowId
    workspaceId: WorkspaceId
    newStatus: FlowStatus
    isRepublish?: boolean
}, log: FastifyBaseLogger): Promise<void> {
    const triggerTimeout = system.getNumberOrThrow(AppSystemProp.TRIGGER_TIMEOUT_SECONDS)
    await distributedLock(log).runExclusive({
        key: `flow-status-change-${params.id}`,
        timeoutInSeconds: triggerTimeout + 30,
        fn: async () => {
            const flowToUpdate = await flowService(log).getOneOrThrow({
                id: params.id,
                workspaceId: params.workspaceId,
            })
            if (flowToUpdate.status === params.newStatus) {
                return
            }

            const publishedFlowVersionId = flowToUpdate.publishedVersionId
            assertNotNullOrUndefined(publishedFlowVersionId, 'publishedFlowVersionId is required')
            const publishedFlowVersion = await flowVersionService(log).getFlowVersionOrThrow({
                flowId: flowToUpdate.id,
                versionId: publishedFlowVersionId,
            })

            await flowSideEffects(log).preUpdateStatus({
                flowToUpdate,
                publishedFlowVersion,
                newStatus: params.newStatus,
                templateId: flowToUpdate.templateId ?? undefined,
                isRepublish: params.isRepublish,
            })

            await flowRepo().save({
                ...flowToUpdate,
                status: params.newStatus,
                publishedVersionId: publishedFlowVersion.id,
            })
            await flowExecutionCache(log).invalidate(params.id)
        },
    })
}

export const getFolderIdFromRequest = async ({ workspaceId, folderId, folderName, log }: { workspaceId: string, folderId: string | undefined, folderName: string | undefined, log: FastifyBaseLogger }) => {
    if (folderId) {
        return folderId
    }
    if (folderName) {
        return (await flowFolderService(log).upsert({
            workspaceId,
            request: {
                workspaceId,
                displayName: folderName,
            },
        })).id
    }
    return null
}

const assertFlowIsNotNull: <T extends Flow>(
    flow: T | null
) => asserts flow is T = <T>(flow: T | null) => {
    if (isNil(flow)) {
        throw new PlatformError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {},
        })
    }
}

type CreateParams = EventEmissionParams & {
    workspaceId: WorkspaceId
    request: CreateFlowRequest
    ownerId?: UserId
    externalId?: string
    templateId?: string
    createdBy?: FlowCreator
}

type ListParamsBase = {
    cursorRequest?: Cursor
    limit?: number
    folderId?: string
    folderIds?: string[]
    status?: FlowStatus[]
    name?: string
    versionState?: FlowVersionState
    externalIds?: string[]
    connectionExternalIds?: string[]
    agentExternalIds?: string[]
    includeTriggerSource?: boolean
}

type ListParams = ListParamsBase & (
    | { workspaceIds: WorkspaceId[], platformId?: never }
    | { workspaceIds?: never, platformId: PlatformId }
)

type GetOneParams = {
    id: FlowId
    workspaceId: WorkspaceId
    entityManager?: EntityManager
}

type GetOnePopulatedParams = GetOneParams & {
    versionId?: FlowVersionId
    removeConnectionsName?: boolean
    removeSampleData?: boolean
}

type GetTemplateParams = {
    flowId: FlowId
    userMetadata: UserWithMetaInformation | null
    workspaceId: WorkspaceId
    versionId: FlowVersionId | undefined
}

type CountParams = {
    workspaceId: WorkspaceId
    folderId?: string
    status?: FlowStatus
}

type UpdateParams = EventEmissionParams & {
    id: FlowId
    userId?: UserId | null
    workspaceId: WorkspaceId
    operation: FlowOperationRequest
    platformId: PlatformId
    previousFlow?: PopulatedFlow
}

type UpdatePublishedVersionIdParams = {
    id: FlowId
    userId: UserId | null
    platformId: PlatformId
    workspaceId: WorkspaceId
}

type DeleteParams = EventEmissionParams & {
    id: FlowId
    workspaceId: WorkspaceId
    userId?: UserId
    previousFlow?: PopulatedFlow
}

type EventEmissionParams = {
    ip?: string
    emitEvents?: boolean
}


type NewFlow = Omit<Flow, 'created' | 'updated'>

type LockFlowVersionIfNotLockedParams = {
    flowVersion: FlowVersion
    userId: UserId | null
    workspaceId: WorkspaceId
    platformId: PlatformId
    entityManager: EntityManager
    log: FastifyBaseLogger
}

type ExistsByWorkspaceAndStatusParams = {
    workspaceId: WorkspaceId
    status: FlowStatus
    entityManager: EntityManager
}

type UpdateMetadataParams = {
    id: FlowId
    workspaceId: WorkspaceId
    metadata: Metadata | null | undefined
}

type UpdateLastModifiedParams = {
    flowId: FlowId
    workspaceId: WorkspaceId
    entityManager?: EntityManager
}

/** When the latest version is locked (published snapshot), creates a new draft and imports it. */
async function createNewDraftIfVersionIsPublished({
    flowId,
    workspaceId,
    platformId,
    userId,
    log,
}: {
    flowId: FlowId
    workspaceId: WorkspaceId
    platformId: PlatformId
    userId: UserId | null
    log: FastifyBaseLogger
}): Promise<{ version: FlowVersion, createdNewDraft: boolean }> {
    let lastVersion = await flowVersionService(log).getFlowVersionOrThrow({
        flowId,
        versionId: undefined,
    })
    const createdNewDraft = lastVersion.state === FlowVersionState.LOCKED
    if (lastVersion.state === FlowVersionState.LOCKED) {
        const lockedVersion = lastVersion
        const operations: FlowOperationRequest[] = [{
            type: FlowOperationType.IMPORT_FLOW,
            request: lockedVersion,
        }]
        if (
            lockedVersion.trigger.type === FlowTriggerType.CONNECTOR &&
            !isNil(lockedVersion.trigger.settings.sampleData)
        ) {
            operations.push({
                type: FlowOperationType.UPDATE_SAMPLE_DATA_INFO,
                request: {
                    stepName: lockedVersion.trigger.name,
                    sampleDataSettings: lockedVersion.trigger.settings.sampleData,
                },
            })
        }
        lastVersion = await transaction(async (entityManager) => {
            let draftVersion = await flowVersionService(log).createEmptyVersion({
                flowId,
                displayName: lockedVersion.displayName,
                notes: lockedVersion.notes,
                schemaVersion: lockedVersion.schemaVersion,
                entityManager,
            })
            for (const operation of operations) {
                draftVersion = await flowVersionService(log).applyOperation({
                    userId,
                    workspaceId,
                    platformId,
                    flowVersion: draftVersion,
                    userOperation: operation,
                    entityManager,
                })
            }
            return draftVersion
        })
    }
    return { version: lastVersion, createdNewDraft }
}
