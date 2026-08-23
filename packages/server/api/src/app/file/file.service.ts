import { Readable } from 'node:stream'
import { buffer as streamToBuffer } from 'node:stream/consumers'
import { apId, assertNotNullOrUndefined, ErrorCode, isMultipartFile, isNil, PlatformError, WorkspaceId } from '@fema/core-utils'
import { File, FileCompression, FileId, FileLocation, FileType, Workspace } from '@fema/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In, LessThan, LessThanOrEqual } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { exceptionHandler } from '../helper/exception-handler'
import { jwtUtils } from '../helper/jwt-utils'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { workspaceRepo } from '../workspace/workspace-repo'
import { fileCompressor } from './file-compressor'
import { FileEntity } from './file.entity'
import { s3Helper } from './s3-helper'

const ALLOWED_SIGNED_FILE_TYPES: FileType[] = [FileType.WORKFLOW_STEP_FILE, FileType.EXECUTION_LOG_SLICE]

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/tiff', 'image/bmp', 'image/ico', 'image/avif', 'image/apng']

export const fileRepo = repoFactory<File>(FileEntity)
const EXECUTION_DATA_RETENTION_DAYS = system.getNumberOrThrow(AppSystemProp.EXECUTION_DATA_RETENTION_DAYS)

type BaseFile = Pick<File, 'id' | 'workspaceId' | 'platformId' | 'type' | 'fileName' | 'compression' | 'size' | 'metadata' | 'created' | 'updated'>

const saveFileToDb = async (baseFile: BaseFile, data: Buffer | null) => {
    assertNotNullOrUndefined(data, 'data is required')
    return fileRepo().save({
        ...baseFile,
        location: FileLocation.DB,
        data,
    })
}
export const fileService = (log: FastifyBaseLogger) => ({
    async save(params: SaveParams): Promise<File> {
        const baseFile: BaseFile = {
            id: params.fileId ?? apId(),
            workspaceId: params.workspaceId,
            platformId: params.platformId,
            type: params.type,
            fileName: params.fileName,
            compression: params.compression,
            size: params.size,
            metadata: params.metadata,
            created: dayjs().toISOString(),
            updated: dayjs().toISOString(),
        }
        const location = getLocationForFile(params.type)
        switch (location) {
            case FileLocation.DB: {
                if (params.data instanceof Readable) {
                    const data = await streamToBuffer(params.data)
                    return saveFileToDb({ ...baseFile, size: data.length }, data)
                }
                return saveFileToDb(baseFile, params.data)
            }
            case FileLocation.S3: {
                const s3Key = await s3Helper(log).constructS3Key(params.platformId, params.workspaceId, params.type, baseFile.id)
                // A stream can be consumed once, so it has no S3-error DB fallback.
                if (params.data instanceof Readable) {
                    const size = await s3Helper(log).uploadStream(s3Key, params.data)
                    return fileRepo().save({ ...baseFile, size, location: FileLocation.S3, s3Key })
                }
                try {
                    if (!isNil(params.data)) {
                        await s3Helper(log).uploadFile(s3Key, params.data)
                    }
                    return await fileRepo().save({ ...baseFile, location: FileLocation.S3, s3Key })
                }
                catch (error) {
                    exceptionHandler.handle(error, log)
                    return saveFileToDb(baseFile, params.data)
                }
            }
        }
    },
    async exists(params: GetOneParams): Promise<boolean> {
        const file = await fileRepo().findOneBy({
            workspaceId: params.workspaceId,
            id: params.fileId,
            type: normalizeTypeFilter(params.type),
        })
        return !isNil(file)
    },
    async getFile({ workspaceId, fileId, type }: GetOneParams): Promise<File | null> {
        const file = await fileRepo().findOneBy({
            workspaceId,
            id: fileId,
            type: normalizeTypeFilter(type),
        })
        return file
    },
    async getFileOrThrow(params: GetOneParams): Promise<File> {
        const file = !isNil(params.fileId) ? await this.getFile(params) : undefined
        if (isNil(file)) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'file',
                    entityId: params.fileId,
                    message: 'File not found',
                },
            })
        }
        return file
    },
    async getDataOrUndefined({ workspaceId, fileId, type }: GetOneParams): Promise<GetDataResponse | undefined> {
        try {
            return await this.getDataOrThrow({ workspaceId, fileId, type })
        }
        catch (error) {
            log.error({
                error,
            }, '[FileService#getData] error')
            return undefined
        }

    },
    async getDataOrThrow({ workspaceId, fileId, type }: GetOneParams): Promise<GetDataResponse> {
        const file = await fileRepo().findOneBy({
            workspaceId,
            id: fileId,
            type: normalizeTypeFilter(type),
        })
        if (isNil(file)) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'file',
                    entityId: fileId,
                    message: 'File not found',
                },
            })
        }
        const data = await fileCompressor.decompress({
            data: file.location === FileLocation.DB ? file.data : await s3Helper(log).getFile(file.s3Key!),
            compression: file.compression,
        })
        return {
            metadata: file.metadata ?? undefined,
            data,
            fileName: file.fileName ?? undefined,
        }
    },
    async delete(params: { workspaceId: WorkspaceId, fileId: FileId }): Promise<void> {
        const file = await fileRepo().findOneBy({
            id: params.fileId,
            workspaceId: params.workspaceId,
        })
        if (isNil(file)) {
            return
        }
        if (!isNil(file.s3Key)) {
            await s3Helper(log).deleteFiles([file.s3Key])
        }
        await fileRepo().delete({ id: file.id })
    },
    async deleteStaleBulk(types: FileType[]) {
        const maximumFilesToDeletePerIteration = 4000
        const maximumFilesToDeletePerRun = 1_000_000
        const customRetentionWorkspaces = await workspaceRepo().find({
            select: ['id', 'executionDataRetentionDays'],
            where: {
                executionDataRetentionDays: LessThan(EXECUTION_DATA_RETENTION_DAYS),
            },
        })
        const cleanupPasses: CleanupPass[] = [
            ...Array.from(groupWorkspaceIdsByRetentionDays(customRetentionWorkspaces), ([retentionDays, workspaceIds]) => ({
                retentionDateBoundary: dayjs().subtract(retentionDays, 'days').toISOString(),
                workspaceIds,
            })),
            {
                retentionDateBoundary: dayjs().subtract(EXECUTION_DATA_RETENTION_DAYS, 'days').toISOString(),
                workspaceIds: undefined,
            },
        ]
        let totalAffected = 0
        // Iterate one type at a time with an equality predicate AND an explicit ORDER BY created ASC
        // so the select hits the (type, created) index (idx_file_type_created_desc) as an index scan.
        // Either a `type IN (...)` predicate OR a missing ORDER BY makes the planner fall back to a
        // sequential scan of the file table (150M+ rows) for any type that is >10% of it — its
        // LIMIT-cost heuristic estimates the seq scan will find 4000 hits in ~2000 pages, but the
        // cleanup deletes wade through dead tuples and hit statement_timeout, so the cleanup never
        // drains and the backlog grows. The delete is by primary key only.
        // Cap the work per run so a large backlog drains across the hourly schedule instead of one
        // multi-hour run (which could outlive its worker lock); the next run resumes from the oldest.
        for (const pass of cleanupPasses) {
            for (const type of types) {
                let affected: undefined | number = undefined
                while ((isNil(affected) || affected === maximumFilesToDeletePerIteration) && totalAffected < maximumFilesToDeletePerRun) {
                    const staleFiles = await fileRepo().find({
                        select: ['id', 's3Key'],
                        where: {
                            type,
                            created: LessThanOrEqual(pass.retentionDateBoundary),
                            ...(pass.workspaceIds ? { workspaceId: In(pass.workspaceIds) } : {}),
                        },
                        order: { created: 'ASC' },
                        take: maximumFilesToDeletePerIteration,
                    })

                    if (staleFiles.length === 0) {
                        affected = 0
                        break
                    }

                    const s3Keys = staleFiles.filter(f => !isNil(f.s3Key)).map(f => f.s3Key!)
                    await s3Helper(log).deleteFiles(s3Keys)

                    const result = await fileRepo().delete({
                        id: In(staleFiles.map(file => file.id)),
                    })
                    affected = result.affected || 0
                    totalAffected += affected
                    log.info({
                        counts: affected,
                        type,
                    }, '[FileService#deleteStaleBulk] iteration completed')
                }
            }
        }
        log.info({
            totalAffected,
            types,
        }, '[FileService#deleteStaleBulk] completed')
    },
    async getFileByToken(token: string): Promise<Omit<File, 'data'>> {
        try {
            const decodedToken = await jwtUtils.decodeAndVerify<FileToken>({
                jwt: token,
                key: await jwtUtils.getJwtSecret(),
            })
            const fileType = decodedToken.fileType ?? FileType.WORKFLOW_STEP_FILE
            if (!ALLOWED_SIGNED_FILE_TYPES.includes(fileType)) {
                throw new Error(`File type ${fileType} not allowed for signed download`)
            }
            return await this.getFileOrThrow({
                fileId: decodedToken.fileId,
                type: fileType,
            })
        }
        catch (e) {
            throw new PlatformError({
                code: ErrorCode.INVALID_BEARER_TOKEN,
                params: {
                    message: 'invalid token or expired for the step file',
                },
            })
        }
    },
    extractBufferOrUndefined(value: unknown): Buffer | undefined {
        if (value === undefined || value === null) {
            return undefined
        }
        if (Buffer.isBuffer(value)) {
            return value
        }
        if (typeof value === 'string') {
            return Buffer.from(value, 'utf-8')
        }
        if (value instanceof Uint8Array) {
            return Buffer.from(value)
        }
        throw new PlatformError({
            code: ErrorCode.VALIDATION,
            params: { message: 'File data must be a Buffer' },
        })
    },
    async uploadPublicAsset(params: UploadPublicAssetParams): Promise<string | undefined> {
        const { file, type, platformId, allowedMimeTypes = IMAGE_MIME_TYPES, maxFileSizeInBytes, metadata } = params

        if (isNil(file)) {
            return undefined
        }

        if (!isMultipartFile(file)) {
            throw new PlatformError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'File must be a multipart file',
                },
            })
        }

        if (!allowedMimeTypes.includes(file.mimetype ?? '')) {
            throw new PlatformError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`,
                },
            })
        }

        if (!isNil(maxFileSizeInBytes) && file.data.length > maxFileSizeInBytes) {
            throw new PlatformError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: `File size exceeds ${Math.round(maxFileSizeInBytes / (1024 * 1024))}MB limit`,
                },
            })
        }

        const savedFile = await this.save({
            data: file.data,
            size: file.data.length,
            type,
            compression: FileCompression.NONE,
            platformId,
            fileName: file.filename,
            metadata: {
                ...metadata,
                mimetype: file.mimetype ?? '',
            },
        })

        return `${system.get(AppSystemProp.FRONTEND_URL)}/api/v1/platforms/assets/${savedFile.id}`
    },
})

type GetDataResponse = {
    metadata?: Record<string, string>
    data: Buffer
    fileName?: string
}

function normalizeTypeFilter(type: FileType | FileType[] | undefined) {
    return Array.isArray(type) ? In(type) : type
}

function groupWorkspaceIdsByRetentionDays(workspaces: Pick<Workspace, 'id' | 'executionDataRetentionDays'>[]): Map<number, WorkspaceId[]> {
    const retentionDaysToWorkspaceIds = new Map<number, WorkspaceId[]>()
    for (const workspace of workspaces) {
        const effectiveRetentionDays = getEffectiveExecutionDataRetentionDays(workspace.executionDataRetentionDays)
        if (effectiveRetentionDays >= EXECUTION_DATA_RETENTION_DAYS) {
            continue
        }
        const workspaceIds = retentionDaysToWorkspaceIds.get(effectiveRetentionDays) ?? []
        workspaceIds.push(workspace.id)
        retentionDaysToWorkspaceIds.set(effectiveRetentionDays, workspaceIds)
    }
    return retentionDaysToWorkspaceIds
}

export function getLocationForFile(type: FileType) {
    const FILE_LOCATION = system.getOrThrow<FileLocation>(AppSystemProp.FILE_STORAGE_LOCATION)
    if (type === FileType.WORKFLOW_BUNDLE || isExecutionDataFileThatExpires(type)) {
        return FILE_LOCATION
    }
    return FileLocation.DB
}

export function getDownloadName(file: Pick<File, 'id' | 'fileName' | 'type'>): string {
    return file.fileName ?? `${file.id}.${file.type === FileType.EXECUTION_LOG_SLICE ? 'json' : 'bin'}`
}

export function getEffectiveExecutionDataRetentionDays(executionDataRetentionDays: number | null | undefined): number {
    if (isNil(executionDataRetentionDays)) {
        return EXECUTION_DATA_RETENTION_DAYS
    }
    const pausedWorkflowTimeoutDays = system.getNumberOrThrow(AppSystemProp.PAUSED_WORKFLOW_TIMEOUT_DAYS)
    return Math.min(EXECUTION_DATA_RETENTION_DAYS, Math.max(executionDataRetentionDays, pausedWorkflowTimeoutDays))
}

function isExecutionDataFileThatExpires(type: FileType) {
    switch (type) {
        case FileType.EXECUTION_LOG:
        case FileType.EXECUTION_LOG_SLICE:
        case FileType.WORKFLOW_STEP_FILE:
        case FileType.TRIGGER_PAYLOAD:
        case FileType.TRIGGER_EVENT_FILE:
        case FileType.WEBHOOK_PAYLOAD:
            return true
        case FileType.PLATFORM_ASSET:
        case FileType.USER_PROFILE_PICTURE:
        case FileType.SAMPLE_DATA:
        case FileType.SAMPLE_DATA_INPUT:
        case FileType.PACKAGE_ARCHIVE:
        case FileType.WORKSPACE_RELEASE:
        case FileType.WORKFLOW_VERSION_BACKUP:
        case FileType.KNOWLEDGE_BASE:
            return false
        default:
            throw new Error(`File type ${type} is not supported`)
    }
}

type SaveParams = {
    fileId?: FileId | undefined
    workspaceId?: WorkspaceId
    data: Buffer | Readable | null
    size?: number
    type: FileType
    platformId?: string
    fileName?: string
    compression: FileCompression
    metadata?: Record<string, string>
}

type GetOneParams = {
    fileId?: FileId
    workspaceId?: WorkspaceId
    type?: FileType | FileType[]
}

type FileToken = {
    fileId: string
    fileType?: FileType
}

type CleanupPass = {
    retentionDateBoundary: string
    workspaceIds: WorkspaceId[] | undefined
}

type UploadPublicAssetParams = {
    file: unknown
    type: FileType
    platformId: string
    allowedMimeTypes?: string[]
    maxFileSizeInBytes?: number
    metadata?: Record<string, string>
}
