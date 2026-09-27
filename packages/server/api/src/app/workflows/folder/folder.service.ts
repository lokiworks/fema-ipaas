import { ApplicationError, Cursor, ErrorCode, generateId, isNil, ProjectId, SeekPage } from '@fema-ipaas/core-utils'
import { CreateFolderRequest, Folder, FOLDER_LIMIT_PER_PROJECT, FOLDER_MAX_DEPTH, FolderDto, FolderId, UpdateFolderRequest } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { IsNull } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { transaction } from '../../core/db/transaction'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { workflowRepo } from '../workflow/workflow.repo'
import { workflowService } from '../workflow/workflow.service'
import { folderTreeUtils } from './folder-tree-utils'
import { FolderEntity } from './folder.entity'

export const folderRepo = repoFactory(FolderEntity)

export const workflowFolderService = (log: FastifyBaseLogger) => ({
    async delete(params: DeleteParams): Promise<void> {
        const { projectId, folderId } = params
        const folder = await this.getOneOrThrow({ projectId, folderId })
        const parentId = folder.parentId ?? null
        await transaction(async (entityManager) => {
            const all = await folderRepo(entityManager).findBy({ projectId })
            const children = all.filter((candidate) => candidate.parentId === folder.id)
            const siblingNames = all
                .filter((candidate) => (candidate.parentId ?? null) === parentId && candidate.id !== folder.id)
                .map((candidate) => candidate.displayName)
            const renames = folderTreeUtils.planMoveUp({ children, siblingNames })
            for (const rename of renames) {
                await folderRepo(entityManager).update({ id: rename.id, projectId }, { parentId, displayName: rename.displayName })
            }
            await workflowRepo(entityManager).update({ projectId, folderId: folder.id }, { folderId: parentId })
            await folderRepo(entityManager).delete({ id: folder.id, projectId })
        })
    },
    async update(params: UpdateParams): Promise<FolderDto> {
        const { projectId, folderId, request } = params
        const folder = await this.getOneOrThrow({ projectId, folderId })
        const displayName = folderTreeUtils.assertValidName(request.displayName)
        await this.assertNameAvailable({ projectId, parentId: folder.parentId ?? null, displayName, excludeFolderId: folder.id })
        await folderRepo().update(folder.id, {
            displayName,
        })
        return this.getOneOrThrow({ projectId, folderId })
    },
    async create(params: UpsertParams): Promise<FolderDto> {
        const { projectId, request } = params
        const displayName = folderTreeUtils.assertValidName(request.displayName)
        const parentId = request.parentId ?? null
        const all = await folderRepo().findBy({ projectId })
        if (all.length >= FOLDER_LIMIT_PER_PROJECT) {
            throw folderValidationError('folderLimitReached')
        }
        if (!isNil(parentId)) {
            const parent = all.find((candidate) => candidate.id === parentId)
            if (isNil(parent)) {
                throw folderValidationError('folderParentNotFound')
            }
            if (folderTreeUtils.depthOf({ folderId: parentId, folders: all }) >= FOLDER_MAX_DEPTH) {
                throw folderValidationError('folderTooDeep')
            }
        }
        await this.assertNameAvailable({ projectId, parentId, displayName })
        const folderId = generateId()
        await folderRepo().insert({
            id: folderId,
            projectId,
            displayName,
            externalId: folderId,
            parentId,
        })
        const folder = await folderRepo().findOneByOrFail({ projectId, id: folderId })
        return {
            ...folder,
            numberOfWorkflows: 0,
        }
    },
    async assertNameAvailable({ projectId, parentId, displayName, excludeFolderId }: AssertNameAvailableParams): Promise<void> {
        const siblings = await folderRepo().findBy({ projectId, parentId: isNil(parentId) ? IsNull() : parentId })
        const taken = siblings.some((sibling) => sibling.id !== excludeFolderId && sibling.displayName.trim().toLowerCase() === displayName.trim().toLowerCase())
        if (taken) {
            throw folderValidationError('folderNameTaken')
        }
    },
    async upsert(params: UpsertParams): Promise<FolderDto> {
        const { projectId, request } = params
        const folderWithDisplayName = await this.getOneByDisplayNameCaseInsensitive({
            projectId,
            displayName: request.displayName,
        })
        if (!isNil(folderWithDisplayName)) {
            return this.getOneOrThrow({ projectId, folderId: folderWithDisplayName.id })
        }
        const folderId = generateId()
        await folderRepo().upsert({
            id: folderId,
            projectId,
            displayName: request.displayName,
            externalId: folderId,
            parentId: null,
        }, { conflictPaths: ['projectId', 'displayName'], indexPredicate: '"parentId" IS NULL' })
        const folder = await folderRepo().findOneByOrFail({ projectId, displayName: request.displayName, parentId: IsNull() })
        return {
            ...folder,
            numberOfWorkflows: 0,
        }
    },
    async listAllByProject(params: ListAllParams): Promise<Folder[]> {
        const { projectId } = params
        return folderRepo().find({ where: { projectId } })
    },
    async upsertByExternalId(params: UpsertByExternalIdParams): Promise<Folder> {
        const { projectId, externalId, displayName, displayOrder } = params
        const existing = await folderRepo().findOneBy({ projectId, externalId })
        if (!isNil(existing)) {
            await folderRepo().update(existing.id, {
                displayName,
                displayOrder,
            })
            return folderRepo().findOneByOrFail({ id: existing.id, projectId })
        }
        const folderId = generateId()
        await folderRepo().insert({
            id: folderId,
            projectId,
            displayName,
            displayOrder,
            externalId,
        })
        return folderRepo().findOneByOrFail({ id: folderId, projectId })
    },
    async deleteByExternalId(params: DeleteByExternalIdParams): Promise<void> {
        const { projectId, externalId } = params
        const existing = await folderRepo().findOneBy({ projectId, externalId })
        if (isNil(existing)) {
            return
        }
        await folderRepo().delete({ id: existing.id, projectId })
    },
    async list(params: ListParams): Promise<SeekPage<FolderDto>> {
        const { projectId, cursorRequest, limit } = params
        const decodedCursor = paginationHelper.decodeCursor(cursorRequest)
        const paginator = buildPaginator({
            entity: FolderEntity,
            query: {
                limit,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        
        const queryBuilder = folderRepo()
            .createQueryBuilder('folder')
            .where('folder.projectId = :projectId', { projectId })
            .addSelect((subQuery) => subQuery
                .select('COUNT(*)::int')
                .from('workflow', 'workflow')
                .where('workflow."folderId" = folder.id'), 'numberOfWorkflows')

        const paginationResponse = await paginator.paginate<FolderDto>(queryBuilder)
        return paginationHelper.createPage(paginationResponse.data, paginationResponse.cursor)
    },
    async getOneByDisplayNameCaseInsensitive(params: GetOneByDisplayNameParams): Promise<Folder | null> {
        const { projectId, displayName } = params
        return folderRepo().createQueryBuilder('folder')
            .where('folder.projectId = :projectId', { projectId })
            .andWhere('folder."parentId" IS NULL')
            .andWhere('LOWER(folder.displayName) = LOWER(:displayName)', { displayName })
            .getOne()
    },
    async getOneOrThrow(params: GetOneOrThrowParams): Promise<FolderDto> {
        const { projectId, folderId } = params
        const folder = await folderRepo().findOneBy({ projectId, id: folderId })
        if (!folder) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    message: `Folder ${folderId} is not found`,
                },
            })
        }
        const numberOfWorkflows = await workflowService(log).count({ projectId, folderId })
        return {
            ...folder,
            numberOfWorkflows,
        }
    },
})

function folderValidationError(message: string): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

type AssertNameAvailableParams = {
    projectId: ProjectId
    parentId: string | null
    displayName: string
    excludeFolderId?: string
}

type DeleteParams = {
    projectId: ProjectId
    folderId: FolderId
}

type UpdateParams = {
    projectId: ProjectId
    folderId: FolderId
    request: UpdateFolderRequest
}

type UpsertParams = {
    projectId: ProjectId
    request: CreateFolderRequest
}

type ListParams = {
    projectId: ProjectId
    cursorRequest: Cursor | null
    limit: number
}

type GetOneByDisplayNameParams = {
    projectId: ProjectId
    displayName: string
}

type GetOneOrThrowParams = {
    projectId: ProjectId
    folderId: FolderId
}

type ListAllParams = {
    projectId: ProjectId
}

type UpsertByExternalIdParams = {
    projectId: ProjectId
    externalId: string
    displayName: string
    displayOrder: number
}

type DeleteByExternalIdParams = {
    projectId: ProjectId
    externalId: string
}