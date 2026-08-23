import { PassThrough, Readable } from 'node:stream'
import { MultipartFile } from '@fastify/multipart'
import { EventPayload, Execution, FAIL_PARENT_ON_FAILURE_HEADER, FileCompression, FileType, PARENT_RUN_ID_HEADER } from '@fema/shared'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import mime from 'mime-types'
import { fileService } from '../file/file.service'
import { enforceByteLimit, filesService, fileTooLargeError } from '../file/files-service'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { workspaceService } from '../workspace/workspace-service'

const BINARY_CONTENT_TYPE_PATTERNS = [
    /^image\//,
    /^video\//,
    /^audio\//,
    /^application\/pdf$/,
    /^application\/zip$/,
    /^application\/gzip$/,
    /^application\/octet-stream$/,
    /^text\/csv$/,
]

export function isBinaryContentType(contentType: string | undefined): boolean {
    if (!contentType) return false
    const baseContentType = contentType.split(';')[0].trim().toLowerCase()
    return BINARY_CONTENT_TYPE_PATTERNS.some(pattern => pattern.test(baseContentType))
}

export function isMultipartContentType(contentType: string | undefined): boolean {
    return contentType?.trim().toLowerCase().startsWith('multipart/') ?? false
}

export async function convertRequest(
    request: FastifyRequest,
    workspaceId: string,
    workflowId: string,
): Promise<EventPayload> {
    const contentType = request.headers['content-type']
    const isBinary = isBinaryContentType(contentType)
    return {
        method: request.method,
        headers: request.headers as Record<string, string>,
        body: await convertBody(request, workspaceId, workflowId),
        queryParams: request.query as Record<string, string>,
        // Streamed bodies (binary/multipart) are consumed straight to storage, so there is no
        // raw payload to forward; rawBody is captured only for the string-parsed signed types.
        rawBody: isBinary ? undefined : request.rawBody,
    }
}

export function extractHeaderFromRequest(request: FastifyRequest): Pick<Execution, 'parentRunId' | 'failParentOnFailure'> {
    return {
        parentRunId: request.headers[PARENT_RUN_ID_HEADER] as string,
        failParentOnFailure: request.headers[FAIL_PARENT_ON_FAILURE_HEADER] === 'true',
    }
}

async function convertBody(
    request: FastifyRequest,
    workspaceId: string,
    workflowId: string,
): Promise<unknown> {
    if (request.isMultipart()) {
        const tenantId = await workspaceService(request.log).getTenantId(workspaceId)
        const maxFileSizeInBytes = system.getNumberOrThrow(AppSystemProp.MAX_FILE_SIZE_MB) * 1024 * 1024
        const jsonResult: Record<string, unknown> = {}
        for await (const part of request.parts()) {
            if (part.type === 'file') {
                const url = await saveStepFileAndConstructUrl({
                    log: request.log,
                    data: failIfTruncated(part.file, maxFileSizeInBytes),
                    fileName: part.filename,
                    workflowId,
                    tenantId,
                    workspaceId,
                })
                jsonResult[part.fieldname] = appendMultiValue(jsonResult[part.fieldname], url)
            }
            else {
                jsonResult[part.fieldname] = appendMultiValue(jsonResult[part.fieldname], part.value)
            }
        }
        return jsonResult
    }

    const contentType = request.headers['content-type']
    if (isBinaryContentType(contentType)) {
        const tenantId = await workspaceService(request.log).getTenantId(workspaceId)
        const extension = mime.extension(contentType?.split(';')[0] || '') || 'bin'
        const maxFileSizeInBytes = system.getNumberOrThrow(AppSystemProp.MAX_FILE_SIZE_MB) * 1024 * 1024
        const url = await saveStepFileAndConstructUrl({
            log: request.log,
            data: (request.body as Readable).pipe(enforceByteLimit(maxFileSizeInBytes)),
            fileName: `file.${extension}`,
            workflowId,
            tenantId,
            workspaceId,
        })
        return { fileUrl: url }
    }

    return request.body
}

async function saveStepFileAndConstructUrl(params: SaveStepFileParams): Promise<string> {
    const { log, data, fileName, workflowId, tenantId, workspaceId } = params
    const file = await fileService(log).save({
        data,
        metadata: { stepName: 'trigger', workflowId },
        fileName,
        type: FileType.WORKFLOW_STEP_FILE,
        compression: FileCompression.NONE,
        workspaceId,
        tenantId,
    })
    return filesService.constructReadUrl({
        fileId: file.id,
        fileType: FileType.WORKFLOW_STEP_FILE,
        tenantId,
    })
}

// When a part exceeds busboy's fileSize limit it ends the stream cleanly and flags `truncated`
// rather than emitting an error, so a truncated file would otherwise be persisted before
// @fastify/multipart surfaces the limit. Erroring at end-of-stream fails the upload instead.
function failIfTruncated(file: MultipartFile['file'], maxBytes: number): Readable {
    return file.pipe(new PassThrough({
        flush(callback) {
            callback(file.truncated ? fileTooLargeError(maxBytes) : null)
        },
    }))
}

// A repeated multipart field name collects into an array, matching the previous body shape.
function appendMultiValue(existing: unknown, value: unknown): unknown {
    if (existing === undefined) {
        return value
    }
    return Array.isArray(existing) ? [...existing, value] : [existing, value]
}

type SaveStepFileParams = {
    log: FastifyBaseLogger
    data: Readable
    fileName: string
    workflowId: string
    tenantId: string
    workspaceId: string
}
