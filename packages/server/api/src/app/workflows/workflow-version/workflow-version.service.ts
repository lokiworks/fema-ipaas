import { apId, ApplicationError, Cursor, ErrorCode, isNil, sanitizeObjectForPostgresql, SeekPage, TenantId, UserId, WorkflowId, WorkflowVersionId, WorkspaceId } from '@fema/core-utils'
import { LATEST_WORKFLOW_SCHEMA_VERSION, Note, WorkflowOperationRequest, workflowOperations, WorkflowOperationType, workflowStructureUtil, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState } from '@fema/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { EntityManager, FindOneOptions } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { userService } from '../../user/user-service'
import { sampleDataService } from '../step-run/sample-data.service'
import { WorkflowVersionEntity } from './workflow-version-entity'
import { workflowVersionMigrationService } from './workflow-version-migration.service'
import { workflowVersionSideEffects } from './workflow-version-side-effects'
import { workflowVersionValidationUtil } from './workflow-version-validator-util'

export const workflowVersionRepo = repoFactory(WorkflowVersionEntity)

export const workflowVersionService = (log: FastifyBaseLogger) => ({
    async applyOperation({
        workflowVersion,
        workspaceId,
        userId,
        userOperation,
        entityManager,
        tenantId,
    }: ApplyOperationParams): Promise<WorkflowVersion> {
        let operations: WorkflowOperationRequest[] = []
        let mutatedWorkflowVersion: WorkflowVersion = workflowVersion

        switch (userOperation.type) {
            case WorkflowOperationType.USE_AS_DRAFT: {
                const previousVersion = await workflowVersionService(log).getWorkflowVersionOrThrow({
                    workflowId: workflowVersion.workflowId,
                    versionId: userOperation.request.versionId,
                    removeConnectionsName: false,
                })
                operations = [{
                    type: WorkflowOperationType.IMPORT_WORKFLOW,
                    request: {
                        trigger: previousVersion.trigger,
                        displayName: previousVersion.displayName,
                        schemaVersion: previousVersion.schemaVersion,
                        notes: previousVersion.notes,
                    },
                }]
                if (
                    previousVersion.trigger.type === WorkflowTriggerType.CONNECTOR &&
                    !isNil(previousVersion.trigger.settings.sampleData)
                ) {
                    operations.push({
                        type: WorkflowOperationType.UPDATE_SAMPLE_DATA_INFO,
                        request: {
                            stepName: previousVersion.trigger.name,
                            sampleDataSettings: previousVersion.trigger.settings.sampleData,
                        },
                    })
                }
                break
            }
            case WorkflowOperationType.SAVE_SAMPLE_DATA: {
                const sampleDataSettings = await sampleDataService(log).saveSampleDataFileIdsInStep({
                    workspaceId,
                    workflowVersionId: mutatedWorkflowVersion.id,
                    stepName: userOperation.request.stepName,
                    payload: userOperation.request.payload,
                    type: userOperation.request.type,
                })
                operations = [{
                    type: WorkflowOperationType.UPDATE_SAMPLE_DATA_INFO,
                    request: {
                        stepName: userOperation.request.stepName,
                        sampleDataSettings,
                    },
                }]
                break
            }
            default: {
                operations = [userOperation]
                break
            }
        }
        for (const operation of operations) {
            mutatedWorkflowVersion = await applySingleOperation({
                workspaceId,
                workflowVersion: mutatedWorkflowVersion,
                operation,
                tenantId,
                log,
                userId,
                entityManager,
            })
            if (operation.type === WorkflowOperationType.ADD_NOTE) {
                const noteIndex = mutatedWorkflowVersion.notes.findIndex((note) => note.id === operation.request.id)
                if (noteIndex !== -1) {
                    mutatedWorkflowVersion.notes[noteIndex] = { ...mutatedWorkflowVersion.notes[noteIndex], ownerId: userId }
                }
            }
        }

        mutatedWorkflowVersion.updated = dayjs().toISOString()
        if (userId) {
            mutatedWorkflowVersion.updatedBy = userId
        }
        mutatedWorkflowVersion.connectionIds = workflowStructureUtil.extractConnectionIds(mutatedWorkflowVersion)
        mutatedWorkflowVersion.agentIds = workflowStructureUtil.extractAgentIds(mutatedWorkflowVersion)
        return workflowVersionRepo(entityManager).save(sanitizeObjectForPostgresql(mutatedWorkflowVersion))
    },

    async getOne(id: WorkflowVersionId): Promise<WorkflowVersion | null> {
        if (isNil(id)) {
            return null
        }
        return findOne(log, {
            where: {
                id,
            },
        })
    },

    async exists(id: WorkflowVersionId): Promise<boolean> {
        return workflowVersionRepo().exists({
            where: {
                id,
            },
        })
    },
    async getLatestVersion(workflowId: WorkflowId, state: WorkflowVersionState): Promise<WorkflowVersion | null> {
        return findOne(log, {
            where: {
                workflowId,
                state,
            },
            order: {
                created: 'DESC',
            },
        })
    },

    async getLatestVersionsByWorkflowIds(workflowIds: WorkflowId[], workspaceId?: WorkspaceId): Promise<Map<WorkflowId, WorkflowVersion>> {
        if (workflowIds.length === 0) {
            return new Map()
        }
        const latestVersions = await workflowVersionRepo()
            .createQueryBuilder('fv')
            .where('fv.workflowId IN (:...workflowIds)', { workflowIds })
            .distinctOn(['fv.workflowId'])
            .orderBy('fv.workflowId')
            .addOrderBy('fv.created', 'DESC')
            .getMany()
        const migratedEntries = await Promise.all(
            latestVersions.map(async (version) => {
                const migrated = await workflowVersionMigrationService(log).migrate(version, workspaceId)
                return [version.workflowId, migrated] as const
            }),
        )
        return new Map(migratedEntries)
    },

    async getLatestLockedVersionOrThrow(workflowId: WorkflowId): Promise<WorkflowVersion> {
        const lockedVersion = await this.getLatestVersion(workflowId, WorkflowVersionState.LOCKED)
        if (isNil(lockedVersion)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: workflowId,
                    entityType: 'WorkflowVersion',
                },
            })
        }
        return lockedVersion
    },
    async getOneOrThrow(id: WorkflowVersionId): Promise<WorkflowVersion> {
        const workflowVersion = await workflowVersionService(log).getOne(id)

        if (isNil(workflowVersion)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: id,
                    entityType: 'WorkflowVersion',
                },
            })
        }

        return workflowVersion
    },
    async list({
        cursorRequest,
        limit,
        workflowId,
    }: ListWorkflowVersionParams): Promise<SeekPage<WorkflowVersion>> {
        const decodedCursor = paginationHelper.decodeCursor(cursorRequest)
        const paginator = buildPaginator({
            entity: WorkflowVersionEntity,
            query: {
                limit,
                order: 'DESC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const paginationResult = await paginator.paginate(
            workflowVersionRepo().createQueryBuilder()
                .where({
                    workflowId,
                }),
        )
        const promises = paginationResult.data.map(async (workflowVersion) => {
            return {
                ...workflowVersion,
                updatedByUser: isNil(workflowVersion.updatedBy) ? null : await userService(log).getMetaInformation({
                    id: workflowVersion.updatedBy,
                }),
            }
        })
        return paginationHelper.createPage<WorkflowVersion>(
            await Promise.all(promises),
            paginationResult.cursor,
        )
    },
    async getWorkflowVersionOrThrow({
        workflowId,
        versionId,
        removeConnectionsName = false,
        removeSampleData = false,
        entityManager,
        workspaceId,
    }: GetWorkflowVersionOrThrowParams): Promise<WorkflowVersion> {
        const workflowVersion: WorkflowVersion | null = await findOne(log, {
            where: {
                workflowId,
                id: versionId,
            },
            //This is needed to return draft by default because it is always the latest one
            order: {
                created: 'DESC',
            },
        }, entityManager, workspaceId)

        if (isNil(workflowVersion)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: versionId,
                    entityType: 'WorkflowVersion',
                    message: `workflowId=${workflowId}`,
                },
            })
        }

        return this.removeConnectionsAndSampleDataFromWorkflowVersion(
            workflowVersion,
            removeConnectionsName,
            removeSampleData,
        )
    },
    async createEmptyVersion({
        workflowId,
        displayName,
        notes,
        schemaVersion,
        entityManager,
    }: CreateEmptyVersionParams): Promise<WorkflowVersion> {
        const workflowVersion: NewWorkflowVersion = {
            id: apId(),
            displayName,
            workflowId,
            trigger: {
                type: WorkflowTriggerType.EMPTY,
                name: 'trigger',
                settings: {},
                valid: false,
                displayName: 'Select Trigger',
                lastUpdatedDate: dayjs().toISOString(),
            },
            schemaVersion: schemaVersion ?? LATEST_WORKFLOW_SCHEMA_VERSION,
            connectionIds: [],
            agentIds: [],
            valid: false,
            state: WorkflowVersionState.DRAFT,
            notes,
        }
        return workflowVersionRepo(entityManager).save(workflowVersion)
    },
    removeConnectionsAndSampleDataFromWorkflowVersion(
        workflowVersion: WorkflowVersion,
        removeConnectionNames: boolean,
        removeSampleData: boolean,
    ): WorkflowVersion {
        return workflowStructureUtil.transferWorkflow(workflowVersion, (step) => {
            const settings = { ...step.settings }
            if (removeConnectionNames && !isNil(settings.input)) {
                settings.input = removeConnectionsFromInput(settings.input)
            }
            if (removeSampleData && !isNil(settings.sampleData)) {
                settings.sampleData = {
                    ...settings.sampleData,
                    sampleDataFileId: undefined,
                    sampleDataInputFileId: undefined,
                    lastTestDate: undefined,
                }
            }
            return { ...step, settings }
        })
    },
})



async function findOne(log: FastifyBaseLogger, options: FindOneOptions, entityManager?: EntityManager, workspaceId?: WorkspaceId): Promise<WorkflowVersion | null> {
    const workflowVersion = await workflowVersionRepo(entityManager).findOne(options)
    if (isNil(workflowVersion)) {
        return null
    }
    return workflowVersionMigrationService(log).migrate(workflowVersion, workspaceId)
}


async function applySingleOperation({
    workspaceId,
    workflowVersion,
    operation,
    tenantId,
    log,
    userId,
    entityManager,
}: ApplySingleOperationParams): Promise<WorkflowVersion> {
    await workflowVersionSideEffects(log).preApplyOperation({
        workspaceId,
        workflowVersion,
        operation,
        entityManager,
    })
    const preparedOperation = await workflowVersionValidationUtil(log).prepareRequest({ tenantId, request: operation, userId })
    const updatedWorkflowVersion = workflowOperations.apply(workflowVersion, preparedOperation)
    return updatedWorkflowVersion
}

function removeConnectionsFromInput(
    obj: Record<string, unknown>,
): Record<string, unknown> {
    if (isNil(obj)) {
        return obj
    }
    const replacedObj: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
            replacedObj[key] = value
        }
        else if (typeof value === 'object' && value !== null) {
            replacedObj[key] = removeConnectionsFromInput(value as Record<string, unknown>)
        }
        else if (typeof value === 'string') {
            const replacedValue = value.replace(/\{{connections\.[^}]*}}/g, '')
            replacedObj[key] = replacedValue === '' ? undefined : replacedValue
        }
        else {
            replacedObj[key] = value
        }
    }
    return replacedObj
}

type GetWorkflowVersionOrThrowParams = {
    workflowId: WorkflowId
    versionId: WorkflowVersionId | undefined
    removeConnectionsName?: boolean
    removeSampleData?: boolean
    entityManager?: EntityManager
    workspaceId?: WorkspaceId
}

type NewWorkflowVersion = Omit<WorkflowVersion, 'created' | 'updated'>

type CreateEmptyVersionParams = {
    workflowId: WorkflowId
    displayName: string
    notes: Note[]
    schemaVersion: string | undefined | null
    entityManager?: EntityManager
}

type ApplySingleOperationParams = {
    workspaceId: WorkspaceId
    workflowVersion: WorkflowVersion
    operation: WorkflowOperationRequest
    tenantId: TenantId
    log: FastifyBaseLogger
    userId: UserId | null
    entityManager?: EntityManager
}

type ListWorkflowVersionParams = {
    workflowId: WorkflowId
    cursorRequest: Cursor | null
    limit: number
}

type ApplyOperationParams = {
    userId: UserId | null
    workspaceId: WorkspaceId
    tenantId: TenantId
    workflowVersion: WorkflowVersion
    userOperation: WorkflowOperationRequest
    entityManager?: EntityManager
}

