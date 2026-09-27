import { ApplicationError, ErrorCode, generateId, isNil, TenantId, tryCatch, UserId } from '@fema-ipaas/core-utils'
import {
    CreateDataErasureRequestBody,
    DataErasureRequest,
    ErasureMatchedWorkflow,
    ErasureStatus,
    FileCompression,
    FileType,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import { In, IsNull, Not } from 'typeorm'
import { z } from 'zod'
import { repoFactory } from '../core/db/repo-factory'
import { fileCompressor } from '../file/file-compressor'
import { fileRepo, fileService } from '../file/file.service'
import { encryptUtils } from '../helper/encryption'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { projectRepo } from '../project/project-repo'
import { executionRepo } from '../workflows/execution/execution-service'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { DataErasureRequestEntity, DataErasureRequestSchema } from './data-erasure.entity'
import { personalDataEraser } from './personal-data-eraser'

export const dataErasureRepo = repoFactory(DataErasureRequestEntity)

export const dataErasureService = (log: FastifyBaseLogger) => ({
    async list({ tenantId }: { tenantId: TenantId }): Promise<DataErasureRequest[]> {
        const rows = await dataErasureRepo().find({ where: { tenantId }, order: { created: 'DESC' }, take: LIST_LIMIT })
        return rows.map(toModel)
    },

    async create({ tenantId, userId, request }: { tenantId: TenantId, userId: UserId, request: CreateDataErasureRequestBody }): Promise<DataErasureRequest> {
        const value = personalDataEraser.normalize({ kind: request.kind, value: request.value })
        const id = generateId()
        await dataErasureRepo().save({
            id,
            created: dayjs().toISOString(),
            updated: dayjs().toISOString(),
            tenantId,
            kind: request.kind,
            valueHint: personalDataEraser.hintOf({ kind: request.kind, value }),
            subjectHint: personalDataEraser.maskName(request.subjectName),
            reason: request.reason,
            requestedById: userId,
            status: ErasureStatus.SCANNING,
            scannedRuns: 0,
            matchedRuns: 0,
            erasedRuns: 0,
            matchedWorkflows: [],
            matchedExecutionIds: [],
            firstMatchAt: null,
            lastMatchAt: null,
            finishedAt: null,
            error: null,
            valueEncrypted: await encryptUtils.encryptString(value),
        })
        await enqueue({ log, requestId: id, phase: ErasureStatus.SCANNING })
        return toModel(await findOrThrow({ id, tenantId }))
    },

    async confirm({ id, tenantId }: RequestRef): Promise<DataErasureRequest> {
        const request = await findOrThrow({ id, tenantId })
        if (request.status !== ErasureStatus.AWAITING_CONFIRMATION) {
            invalid('Only a scanned request can be confirmed')
        }
        await dataErasureRepo().update({ id, tenantId }, { status: ErasureStatus.ERASING })
        await enqueue({ log, requestId: id, phase: ErasureStatus.ERASING })
        return toModel(await findOrThrow({ id, tenantId }))
    },

    async cancel({ id, tenantId }: RequestRef): Promise<DataErasureRequest> {
        const request = await findOrThrow({ id, tenantId })
        if (request.status !== ErasureStatus.AWAITING_CONFIRMATION) {
            invalid('Only a request waiting for confirmation can be canceled')
        }
        await dataErasureRepo().update({ id, tenantId }, { status: ErasureStatus.CANCELED, valueEncrypted: null, matchedExecutionIds: [], finishedAt: dayjs().toISOString() })
        return toModel(await findOrThrow({ id, tenantId }))
    },

    async process({ requestId }: { requestId: string }): Promise<void> {
        const request = await dataErasureRepo().findOneBy({ id: requestId })
        if (isNil(request) || isNil(request.valueEncrypted)) {
            return
        }
        const value = await encryptUtils.decryptString(request.valueEncrypted)
        const { error } = await tryCatch(async () => {
            if (request.status === ErasureStatus.SCANNING) {
                await scan({ log, request, value })
            }
            else if (request.status === ErasureStatus.ERASING) {
                await erase({ log, request, value })
            }
        })
        if (error) {
            log.error({ error, dataErasure: { id: requestId } }, '[dataErasureService#process] Erasure job failed')
            await dataErasureRepo().update({ id: requestId }, { status: ErasureStatus.FAILED, error: error.message, valueEncrypted: null, finishedAt: dayjs().toISOString() })
        }
    },
})

async function scan({ log, request, value }: JobParams): Promise<void> {
    const projects = await projectRepo().find({ where: { tenantId: request.tenantId }, select: ['id'] })
    const projectIds = projects.map((project) => project.id)
    const limit = pLimit(READ_CONCURRENCY)
    const scanPage = async ({ offset, found }: { offset: number, found: ScanHit[] }): Promise<{ scanned: number, found: ScanHit[] }> => {
        const page = projectIds.length === 0 || offset >= MAX_SCANNED_RUNS ? [] : await executionRepo().find({
            where: [
                { projectId: In(projectIds), displayLogsFileId: Not(IsNull()) },
                { projectId: In(projectIds), logsFileId: Not(IsNull()) },
            ],
            select: ['id', 'projectId', 'workflowId', 'created', 'logsFileId', 'displayLogsFileId'],
            order: { created: 'DESC', id: 'ASC' },
            skip: offset,
            take: SCAN_PAGE_SIZE,
        })
        const hits = await Promise.all(page.map((execution) => limit(async () => {
            const texts = await Promise.all([execution.displayLogsFileId, execution.logsFileId]
                .filter((fileId): fileId is string => !isNil(fileId))
                .map((fileId) => readText({ log, fileId, projectId: execution.projectId })))
            const sliceTexts = await readSliceTexts({ log, execution, texts })
            const hit = [...texts, ...sliceTexts].some((text) => personalDataEraser.contains({ text, value }))
            return hit ? [{ id: execution.id, workflowId: execution.workflowId, projectId: execution.projectId, created: String(execution.created) }] : []
        })))
        const nextFound = [...found, ...hits.flat()]
        await dataErasureRepo().update({ id: request.id }, { scannedRuns: offset + page.length })
        return page.length < SCAN_PAGE_SIZE ? { scanned: offset + page.length, found: nextFound } : scanPage({ offset: offset + page.length, found: nextFound })
    }
    const { scanned, found } = await scanPage({ offset: 0, found: [] })
    const matchedWorkflows = await summarizeWorkflows({ log, hits: found })
    const sortedDates = found.map((hit) => hit.created).sort()
    const done = found.length === 0
    await dataErasureRepo().update({ id: request.id }, {
        status: done ? ErasureStatus.DONE : ErasureStatus.AWAITING_CONFIRMATION,
        scannedRuns: scanned,
        matchedRuns: found.length,
        matchedWorkflows,
        matchedExecutionIds: found.map((hit) => hit.id),
        firstMatchAt: sortedDates[0] ?? null,
        lastMatchAt: sortedDates[sortedDates.length - 1] ?? null,
        ...(done ? { valueEncrypted: null, finishedAt: dayjs().toISOString() } : {}),
    })
}

async function erase({ log, request, value }: JobParams): Promise<void> {
    const executions = request.matchedExecutionIds.length === 0 ? [] : await executionRepo().find({
        where: { id: In(request.matchedExecutionIds) },
        select: ['id', 'projectId', 'logsFileId', 'displayLogsFileId'],
    })
    const limit = pLimit(READ_CONCURRENCY)
    const results = await Promise.all(executions.map((execution) => limit(async () => {
        const hitSliceFileIds = await deleteMatchingSlices({ log, execution, value })
        const erased = await Promise.all([execution.displayLogsFileId, execution.logsFileId]
            .filter((fileId): fileId is string => !isNil(fileId))
            .map((fileId) => eraseFile({ log, fileId, projectId: execution.projectId, value, hitSliceFileIds })))
        return erased.some(Boolean) ? 1 : 0
    })))
    await dataErasureRepo().update({ id: request.id }, {
        status: ErasureStatus.DONE,
        erasedRuns: results.reduce<number>((sum, count) => sum + count, 0),
        valueEncrypted: null,
        matchedExecutionIds: [],
        finishedAt: dayjs().toISOString(),
    })
    log.info({ dataErasure: { id: request.id }, counts: executions.length }, '[dataErasureService#erase] Personal data erased')
}

async function eraseFile({ log, fileId, projectId, value, hitSliceFileIds }: EraseFileParams): Promise<boolean> {
    const file = await readLog({ log, fileId, projectId })
    if (isNil(file)) {
        return false
    }
    const { steps, erased } = personalDataEraser.eraseSteps({ steps: file.executionState.steps, value, hitSliceFileIds })
    if (erased === 0) {
        return false
    }
    const serialized = Buffer.from(JSON.stringify({ ...file, executionState: { ...file.executionState, steps } }))
    const data = await fileCompressor.compress({ data: serialized, compression: FileCompression.ZSTD })
    const existing = await fileRepo().findOneBy({ id: fileId, projectId })
    if (isNil(existing)) {
        return false
    }
    await fileService(log).save({
        fileId,
        projectId,
        tenantId: existing.tenantId ?? undefined,
        type: FileType.EXECUTION_LOG,
        data,
        size: data.length,
        compression: FileCompression.ZSTD,
    })
    await fileRepo().update({ id: fileId }, { created: existing.created })
    return true
}

async function deleteMatchingSlices({ log, execution, value }: { log: FastifyBaseLogger, execution: ExecutionFiles, value: string }): Promise<Set<string>> {
    if (isNil(execution.logsFileId)) {
        return new Set()
    }
    const raw = await readLog({ log, fileId: execution.logsFileId, projectId: execution.projectId })
    const refs = isNil(raw) ? [] : personalDataEraser.sliceRefs(raw.executionState.steps)
    const hits = await Promise.all(refs.map(async (ref) => {
        const text = await readText({ log, fileId: ref.fileId, projectId: execution.projectId, type: FileType.EXECUTION_LOG_SLICE })
        return personalDataEraser.contains({ text, value }) ? [ref.fileId] : []
    }))
    const hitIds = hits.flat()
    await Promise.all(hitIds.map((fileId) => fileService(log).delete({ fileId, projectId: execution.projectId })))
    return new Set(hitIds)
}

async function readSliceTexts({ log, execution, texts }: { log: FastifyBaseLogger, execution: ExecutionFiles, texts: string[] }): Promise<string[]> {
    if (isNil(execution.logsFileId)) {
        return []
    }
    const rawText = texts[texts.length - 1] ?? ''
    const { data: raw } = await tryCatch(async () => ExecutionLogShape.parse(JSON.parse(rawText)))
    const refs = isNil(raw) ? [] : personalDataEraser.sliceRefs(raw.executionState.steps)
    return Promise.all(refs.map((ref) => readText({ log, fileId: ref.fileId, projectId: execution.projectId, type: FileType.EXECUTION_LOG_SLICE })))
}

async function readLog({ log, fileId, projectId }: { log: FastifyBaseLogger, fileId: string, projectId: string }): Promise<ExecutionLog | null> {
    const text = await readText({ log, fileId, projectId })
    if (text.length === 0) {
        return null
    }
    const { data } = await tryCatch(async () => ExecutionLogShape.parse(JSON.parse(text)))
    return data ?? null
}

async function readText({ log, fileId, projectId, type }: { log: FastifyBaseLogger, fileId: string, projectId: string, type?: FileType }): Promise<string> {
    const file = await fileService(log).getDataOrUndefined({ projectId, fileId, type: type ?? FileType.EXECUTION_LOG })
    return isNil(file) ? '' : file.data.toString('utf-8')
}

async function summarizeWorkflows({ log, hits }: { log: FastifyBaseLogger, hits: ScanHit[] }): Promise<ErasureMatchedWorkflow[]> {
    const counts = hits.reduce<Map<string, { projectId: string, count: number }>>((acc, hit) => new Map(acc).set(hit.workflowId, { projectId: hit.projectId, count: (acc.get(hit.workflowId)?.count ?? 0) + 1 }), new Map())
    const byProject = [...counts.entries()].reduce<Map<string, string[]>>((acc, [workflowId, entry]) => new Map(acc).set(entry.projectId, [...(acc.get(entry.projectId) ?? []), workflowId]), new Map())
    const names = await Promise.all([...byProject.entries()].map(async ([projectId, workflowIds]) => {
        const versions = await workflowVersionService(log).getLatestVersionsByWorkflowIds(workflowIds, projectId)
        return [...versions.entries()].map(([workflowId, version]): [string, string] => [workflowId, version.displayName])
    }))
    const nameOf = new Map(names.flat())
    return [...counts.entries()]
        .map(([workflowId, entry]) => ({ workflowId, displayName: nameOf.get(workflowId) ?? workflowId, count: entry.count }))
        .sort((a, b) => b.count - a.count)
}

async function enqueue({ log, requestId, phase }: { log: FastifyBaseLogger, requestId: string, phase: ErasureStatus }): Promise<void> {
    await systemJobsSchedule(log).upsertJob({
        job: {
            name: SystemJobName.DATA_ERASURE,
            data: { requestId },
            jobId: `data-erasure-${requestId}-${phase}`,
        },
        schedule: { type: 'one-time', date: dayjs() },
    })
}

async function findOrThrow({ id, tenantId }: RequestRef): Promise<DataErasureRequestSchema> {
    const request = await dataErasureRepo().findOneBy({ id, tenantId })
    if (isNil(request)) {
        throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType: 'DataErasureRequest' } })
    }
    return request
}

function toModel(request: DataErasureRequestSchema): DataErasureRequest {
    return {
        id: request.id,
        created: request.created,
        updated: request.updated,
        tenantId: request.tenantId,
        kind: request.kind,
        valueHint: request.valueHint,
        subjectHint: request.subjectHint,
        reason: request.reason,
        requestedById: request.requestedById,
        status: request.status,
        scannedRuns: request.scannedRuns,
        matchedRuns: request.matchedRuns,
        erasedRuns: request.erasedRuns,
        matchedWorkflows: request.matchedWorkflows,
        firstMatchAt: request.firstMatchAt,
        lastMatchAt: request.lastMatchAt,
        finishedAt: request.finishedAt,
        error: request.error,
    }
}

function invalid(message: string): never {
    throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
}

const LIST_LIMIT = 50
const SCAN_PAGE_SIZE = 200
const MAX_SCANNED_RUNS = 200_000
const READ_CONCURRENCY = 8

const ExecutionLogShape = z.looseObject({
    executionState: z.looseObject({
        steps: z.record(z.string(), z.unknown()),
        tags: z.array(z.string()).optional(),
    }),
})

type ExecutionLog = z.infer<typeof ExecutionLogShape>

type RequestRef = {
    id: string
    tenantId: TenantId
}

type JobParams = {
    log: FastifyBaseLogger
    request: DataErasureRequestSchema
    value: string
}

type ExecutionFiles = {
    id: string
    projectId: string
    logsFileId?: string | null
    displayLogsFileId?: string | null
}

type ScanHit = {
    id: string
    workflowId: string
    projectId: string
    created: string
}

type EraseFileParams = {
    log: FastifyBaseLogger
    fileId: string
    projectId: string
    value: string
    hitSliceFileIds: ReadonlySet<string>
}
