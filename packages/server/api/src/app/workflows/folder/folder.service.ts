import { apId, ApplicationError, Cursor, ErrorCode, isNil, SeekPage, WorkspaceId } from '@fema/core-utils'
import { CreateFolderRequest, Folder, FolderDto, FolderId, UpdateFolderRequest } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { workflowService } from '../workflow/workflow.service'
import { FolderEntity } from './folder.entity'

export const folderRepo = repoFactory(FolderEntity)

export const workflowFolderService = (log: FastifyBaseLogger) => ({
    async delete(params: DeleteParams): Promise<void> {
        const { workspaceId, folderId } = params
        const folder = await this.getOneOrThrow({ workspaceId, folderId })
        await folderRepo().delete({
            id: folder.id,
            workspaceId,
        })
    },
    async update(params: UpdateParams): Promise<FolderDto> {
        const { workspaceId, folderId, request } = params
        const folder = await this.getOneOrThrow({ workspaceId, folderId })
        const folderWithDisplayName = await this.getOneByDisplayNameCaseInsensitive({
            workspaceId,
            displayName: request.displayName,
        })
        if (folderWithDisplayName && folderWithDisplayName.id !== folderId) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'Folder displayName is used' },
            })
        }
        await folderRepo().update(folder.id, {
            displayName: request.displayName,
        })
        return this.getOneOrThrow({ workspaceId, folderId })
    },
    async upsert(params: UpsertParams): Promise<FolderDto> {
        const { workspaceId, request } = params
        const folderWithDisplayName = await this.getOneByDisplayNameCaseInsensitive({
            workspaceId,
            displayName: request.displayName,
        })
        if (!isNil(folderWithDisplayName)) {
            return this.update({
                workspaceId,
                folderId: folderWithDisplayName.id,
                request,
            })
        }
        const folderId = apId()
        await folderRepo().upsert({
            id: folderId,
            workspaceId,
            displayName: request.displayName,
            externalId: folderId,
        }, ['workspaceId', 'displayName'])
        const folder = await folderRepo().findOneByOrFail({ workspaceId, id: folderId })
        return {
            ...folder,
            numberOfWorkflows: 0,
        }
    },
    async listAllByWorkspace(params: ListAllParams): Promise<Folder[]> {
        const { workspaceId } = params
        return folderRepo().find({ where: { workspaceId } })
    },
    async upsertByExternalId(params: UpsertByExternalIdParams): Promise<Folder> {
        const { workspaceId, externalId, displayName, displayOrder } = params
        const existing = await folderRepo().findOneBy({ workspaceId, externalId })
        if (!isNil(existing)) {
            await folderRepo().update(existing.id, {
                displayName,
                displayOrder,
            })
            return folderRepo().findOneByOrFail({ id: existing.id, workspaceId })
        }
        const folderId = apId()
        await folderRepo().insert({
            id: folderId,
            workspaceId,
            displayName,
            displayOrder,
            externalId,
        })
        return folderRepo().findOneByOrFail({ id: folderId, workspaceId })
    },
    async deleteByExternalId(params: DeleteByExternalIdParams): Promise<void> {
        const { workspaceId, externalId } = params
        const existing = await folderRepo().findOneBy({ workspaceId, externalId })
        if (isNil(existing)) {
            return
        }
        await folderRepo().delete({ id: existing.id, workspaceId })
    },
    async list(params: ListParams): Promise<SeekPage<FolderDto>> {
        const { workspaceId, cursorRequest, limit } = params
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
            .where('folder.workspaceId = :workspaceId', { workspaceId })
            .addSelect((subQuery) => subQuery
                .select('COUNT(*)::int')
                .from('workflow', 'workflow')
                .where('workflow."folderId" = folder.id'), 'numberOfWorkflows')

        const paginationResponse = await paginator.paginate<FolderDto>(queryBuilder)
        return paginationHelper.createPage(paginationResponse.data, paginationResponse.cursor)
    },
    async getOneByDisplayNameCaseInsensitive(params: GetOneByDisplayNameParams): Promise<Folder | null> {
        const { workspaceId, displayName } = params
        return folderRepo().createQueryBuilder('folder')
            .where('folder.workspaceId = :workspaceId', { workspaceId })
            .andWhere('LOWER(folder.displayName) = LOWER(:displayName)', { displayName })
            .getOne()
    },
    async getOneOrThrow(params: GetOneOrThrowParams): Promise<FolderDto> {
        const { workspaceId, folderId } = params
        const folder = await folderRepo().findOneBy({ workspaceId, id: folderId })
        if (!folder) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    message: `Folder ${folderId} is not found`,
                },
            })
        }
        const numberOfWorkflows = await workflowService(log).count({ workspaceId, folderId })
        return {
            ...folder,
            numberOfWorkflows,
        }
    },
})

type DeleteParams = {
    workspaceId: WorkspaceId
    folderId: FolderId
}

type UpdateParams = {
    workspaceId: WorkspaceId
    folderId: FolderId
    request: UpdateFolderRequest
}

type UpsertParams = {
    workspaceId: WorkspaceId
    request: CreateFolderRequest
}

type ListParams = {
    workspaceId: WorkspaceId
    cursorRequest: Cursor | null
    limit: number
}

type GetOneByDisplayNameParams = {
    workspaceId: WorkspaceId
    displayName: string
}

type GetOneOrThrowParams = {
    workspaceId: WorkspaceId
    folderId: FolderId
}

type ListAllParams = {
    workspaceId: WorkspaceId
}

type UpsertByExternalIdParams = {
    workspaceId: WorkspaceId
    externalId: string
    displayName: string
    displayOrder: number
}

type DeleteByExternalIdParams = {
    workspaceId: WorkspaceId
    externalId: string
}