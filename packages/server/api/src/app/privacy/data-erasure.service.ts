import { ApplicationError, ErrorCode, generateId, isNil, TenantId, tryCatch, UserId } from '@fema-ipaas/core-utils'
import {
    ConfirmDataErasureRequestBody,
    CreateDataErasureRequestBody,
    DataErasureReceipt,
    DataErasureReceiptPerson,
    DataErasureRequest,
    ERASURE_CONFIRM_WORDS,
    ErasureCounts,
    ErasureMatchedWorkflow,
    ErasureStatus,
    ErasureSubjectKind,
    FileCompression,
    FileType,
    MASKED_PLACEHOLDER,
    NotificationType,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import { ILike, In, IsNull, Not } from 'typeorm'
import { z } from 'zod'
import { repoFactory } from '../core/db/repo-factory'
import { fileCompressor } from '../file/file-compressor'
import { fileRepo, fileService } from '../file/file.service'
import { encryptUtils } from '../helper/encryption'
import { likePatternUtils } from '../helper/like-pattern'
import { IdentifierKind, searchableHash } from '../helper/searchable-hash'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { notificationService } from '../notification/notification.service'
import { projectRepo } from '../project/project-repo'
import { dedupedEventRepo } from '../trigger/deduped-event/deduped-event.service'
import { userService } from '../user/user-service'
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
            valueHash: await searchableHash.forStorage({ kind: identifierKindOf(request.kind), value }),
            confirmedById: null,
            confirmedAt: null,
            counts: null,
        })
        await enqueue({ log, requestId: id, phase: ErasureStatus.SCANNING })
        return toModel(await findOrThrow({ id, tenantId }))
    },

    async confirm({ id, tenantId, userId, request: body }: ConfirmParams): Promise<DataErasureRequest> {
        const request = await findOrThrow({ id, tenantId })
        if (request.status !== ErasureStatus.AWAITING_CONFIRMATION) {
            invalid('Only a scanned request can be confirmed')
        }
        if (isNil(request.valueEncrypted) || !personalDataEraser.confirmationMatches({ kind: request.kind, confirmation: body.confirmation, value: await encryptUtils.decryptString(request.valueEncrypted), words: ERASURE_CONFIRM_WORDS })) {
            invalid('The confirmation does not match the person to delete')
        }
        await dataErasureRepo().update({ id, tenantId }, { status: ErasureStatus.ERASING, confirmedById: userId, confirmedAt: dayjs().toISOString() })
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

    async receipt({ id, tenantId }: RequestRef): Promise<DataErasureReceipt> {
        const request = await findOrThrow({ id, tenantId })
        if (request.status !== ErasureStatus.DONE) {
            invalid('A receipt is only available once the request is done')
        }
        const [requestedBy, confirmedBy] = await Promise.all([
            personOf({ log, userId: request.requestedById }),
            isNil(request.confirmedById) ? null : personOf({ log, userId: request.confirmedById }),
        ])
        return {
            kind: 'personal-data-erasure-receipt',
            requestId: request.id,
            lookup: request.kind,
            valueHint: request.valueHint,
            valueHash: request.valueHash,
            valueHashAlgorithm: 'HMAC-SHA256',
            reason: request.reason,
            requestedBy,
            requestedAt: dayjs(request.created).toISOString(),
            confirmedBy,
            confirmedAt: isNil(request.confirmedAt) ? null : dayjs(request.confirmedAt).toISOString(),
            finishedAt: isNil(request.finishedAt) ? null : dayjs(request.finishedAt).toISOString(),
            status: request.status,
            matchedRuns: request.matchedRuns,
            counts: request.counts,
            action: RECEIPT_ACTION,
        }
    },

    async process({ requestId }: { requestId: string }): Promise<void> {
        const request = await dataErasureRepo().findOneBy({ id: requestId })
        if (isNil(request) || isNil(request.valueEncrypted)) {
            return
        }
        const value = await encryptUtils.decryptString(request.valueEncrypted)
        const needle = personalDataEraser.needleOf({ kind: request.kind, value })
        const { error } = await tryCatch(async () => {
            if (request.status === ErasureStatus.SCANNING) {
                await scan({ log, request, value, needle })
            }
            else if (request.status === ErasureStatus.ERASING) {
                await erase({ log, request, value, needle })
            }
        })
        if (error) {
            log.error({ error, dataErasure: { id: requestId } }, '[dataErasureService#process] Erasure job failed')
            await dataErasureRepo().update({ id: requestId }, { status: ErasureStatus.FAILED, error: error.message, valueEncrypted: null, finishedAt: dayjs().toISOString() })
        }
        await notifyIfFinished({ log, before: request })
    },
})

async function notifyIfFinished({ log, before }: { log: FastifyBaseLogger, before: DataErasureRequestSchema }): Promise<void> {
    const after = await dataErasureRepo().findOneBy({ id: before.id })
    if (isNil(after) || after.status === before.status || ![ErasureStatus.DONE, ErasureStatus.FAILED].includes(after.status)) {
        return
    }
    await notificationService(log).notify({
        tenantId: after.tenantId,
        recipientIds: [after.requestedById],
        type: after.status === ErasureStatus.DONE ? NotificationType.DATA_ERASURE_FINISHED : NotificationType.DATA_ERASURE_FAILED,
        title: after.valueHint,
        body: after.status === ErasureStatus.DONE ? null : after.error,
        link: '/tenant/security/privacy',
    })
}

async function scan({ log, request, value, needle }: JobParams): Promise<void> {
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
            const hit = [...texts, ...sliceTexts].some((text) => personalDataEraser.contains({ text, needle }))
            return hit ? [{ id: execution.id, workflowId: execution.workflowId, projectId: execution.projectId, created: String(execution.created) }] : []
        })))
        const nextFound = [...found, ...hits.flat()]
        await dataErasureRepo().update({ id: request.id }, { scannedRuns: offset + page.length })
        return page.length < SCAN_PAGE_SIZE ? { scanned: offset + page.length, found: nextFound } : scanPage({ offset: offset + page.length, found: nextFound })
    }
    const { scanned, found: scannedHits } = await scanPage({ offset: 0, found: [] })
    const identified = await findByRunIdentifier({ projectIds, value, known: new Set(scannedHits.map((hit) => hit.id)) })
    const hashed = await findBySearchHash({ projectIds, kind: request.kind, value, known: new Set([...scannedHits, ...identified].map((hit) => hit.id)) })
    const found = [...scannedHits, ...identified, ...hashed]
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
        ...(done ? { valueEncrypted: null, finishedAt: dayjs().toISOString(), counts: EMPTY_COUNTS } : {}),
    })
}

async function erase({ log, request, value, needle }: JobParams): Promise<void> {
    const executions = request.matchedExecutionIds.length === 0 ? [] : await executionRepo().find({
        where: { id: In(request.matchedExecutionIds) },
        select: ['id', 'projectId', 'logsFileId', 'displayLogsFileId'],
    })
    const limit = pLimit(READ_CONCURRENCY)
    const results = await Promise.all(executions.map((execution) => limit(async (): Promise<RunErasure> => {
        const hitSliceFileIds = await deleteMatchingSlices({ log, execution, needle })
        const eraseOne = async (fileId: string | null | undefined): Promise<boolean> => isNil(fileId) ? false : eraseFile({ log, fileId, projectId: execution.projectId, needle, hitSliceFileIds })
        const [display, raw] = await Promise.all([eraseOne(execution.displayLogsFileId), eraseOne(execution.logsFileId)])
        const scrubbed = await scrubRunIdentifiers({ executionId: execution.id, projectId: execution.projectId, needle })
        return { display, raw, slices: hitSliceFileIds.size, businessKey: scrubbed.businessKey, message: scrubbed.message }
    })))
    const projectIds = await tenantProjectIds({ tenantId: request.tenantId })
    const webhookPayloads = await deleteMatchingWebhookPayloads({ log, projectIds, needle })
    const dedupeKeys = await maskDedupeKeys({ projectIds, value })
    const searchHashes = await clearSearchHashes({ projectIds, kind: request.kind, value })
    const counts: ErasureCounts = {
        displayLogFiles: results.filter((result) => result.display).length,
        rawStateFiles: results.filter((result) => result.raw).length,
        logSlices: results.reduce((sum, result) => sum + result.slices, 0),
        webhookPayloads,
        runIdentifiers: results.filter((result) => result.businessKey).length,
        failureMessages: results.filter((result) => result.message).length,
        dedupeKeys,
        searchHashes,
    }
    await dataErasureRepo().update({ id: request.id }, {
        status: ErasureStatus.DONE,
        erasedRuns: results.filter((result) => result.display || result.raw || result.businessKey || result.message).length,
        counts,
        valueEncrypted: null,
        matchedExecutionIds: [],
        finishedAt: dayjs().toISOString(),
    })
    log.info({ dataErasure: { id: request.id }, counts: executions.length }, '[dataErasureService#erase] Personal data erased')
}

async function eraseFile({ log, fileId, projectId, needle, hitSliceFileIds }: EraseFileParams): Promise<boolean> {
    const file = await readLog({ log, fileId, projectId })
    if (isNil(file)) {
        return false
    }
    const { steps, erased } = personalDataEraser.eraseSteps({ steps: file.executionState.steps, needle, hitSliceFileIds })
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

async function deleteMatchingSlices({ log, execution, needle }: { log: FastifyBaseLogger, execution: ExecutionFiles, needle: RegExp }): Promise<Set<string>> {
    if (isNil(execution.logsFileId)) {
        return new Set()
    }
    const raw = await readLog({ log, fileId: execution.logsFileId, projectId: execution.projectId })
    const refs = isNil(raw) ? [] : personalDataEraser.sliceRefs(raw.executionState.steps)
    const hits = await Promise.all(refs.map(async (ref) => {
        const text = await readText({ log, fileId: ref.fileId, projectId: execution.projectId, type: FileType.EXECUTION_LOG_SLICE })
        return personalDataEraser.contains({ text, needle }) ? [ref.fileId] : []
    }))
    const hitIds = hits.flat()
    await Promise.all(hitIds.map((fileId) => fileService(log).delete({ fileId, projectId: execution.projectId })))
    return new Set(hitIds)
}

async function findByRunIdentifier({ projectIds, value, known }: { projectIds: string[], value: string, known: ReadonlySet<string> }): Promise<ScanHit[]> {
    if (projectIds.length === 0) {
        return []
    }
    const rows = await executionRepo().find({
        where: { projectId: In(projectIds), businessKey: ILike(`%${likePatternUtils.escape(value)}%`) },
        select: ['id', 'projectId', 'workflowId', 'created'],
        take: MAX_IDENTIFIER_MATCHES,
    })
    return rows
        .filter((row) => !known.has(row.id))
        .map((row) => ({ id: row.id, workflowId: row.workflowId, projectId: row.projectId, created: String(row.created) }))
}

async function scrubRunIdentifiers({ executionId, projectId, needle }: { executionId: string, projectId: string, needle: RegExp }): Promise<{ businessKey: boolean, message: boolean }> {
    const execution = await executionRepo().findOne({ where: { id: executionId, projectId }, select: ['id', 'businessKey', 'failedStep'] })
    if (isNil(execution)) {
        return { businessKey: false, message: false }
    }
    const businessKeyHit = !isNil(execution.businessKey) && personalDataEraser.contains({ text: execution.businessKey, needle })
    const message = execution.failedStep?.message
    const messageHit = !isNil(message) && personalDataEraser.contains({ text: message, needle })
    if (businessKeyHit || messageHit) {
        await executionRepo().update({ id: executionId, projectId }, {
            ...(businessKeyHit ? { businessKey: null } : {}),
            ...(messageHit && !isNil(execution.failedStep) ? { failedStep: { ...execution.failedStep, message: personalDataEraser.replaceAll({ text: message, needle }) } } : {}),
        })
    }
    return { businessKey: businessKeyHit, message: messageHit }
}

async function maskDedupeKeys({ projectIds, value }: { projectIds: string[], value: string }): Promise<number> {
    if (projectIds.length === 0) {
        return 0
    }
    const result = await dedupedEventRepo().update({ projectId: In(projectIds), keyPreview: ILike(`%${likePatternUtils.escape(value)}%`) }, { keyPreview: MASKED_PLACEHOLDER })
    return result.affected ?? 0
}

async function clearSearchHashes({ projectIds, kind, value }: { projectIds: string[], kind: ErasureSubjectKind, value: string }): Promise<number> {
    const hashes = await searchableHash.forLookup({ kind: identifierKindOf(kind), value })
    if (projectIds.length === 0 || hashes.length === 0) {
        return 0
    }
    const rows: unknown = await executionRepo().query(CLEAR_SEARCH_HASHES_SQL, [projectIds, hashes])
    return Array.isArray(rows) ? rows.length : 0
}

async function findBySearchHash({ projectIds, kind, value, known }: { projectIds: string[], kind: ErasureSubjectKind, value: string, known: ReadonlySet<string> }): Promise<ScanHit[]> {
    const hashes = await searchableHash.forLookup({ kind: identifierKindOf(kind), value })
    if (projectIds.length === 0 || hashes.length === 0) {
        return []
    }
    const rows = await executionRepo()
        .createQueryBuilder('execution')
        .select(['execution.id', 'execution.projectId', 'execution.workflowId', 'execution.created'])
        .where('execution."projectId" IN (:...projectIds)', { projectIds })
        .andWhere('execution."searchHashes" && ARRAY[:...hashes]::character varying[]', { hashes })
        .take(MAX_IDENTIFIER_MATCHES)
        .getMany()
    return rows
        .filter((row) => !known.has(row.id))
        .map((row) => ({ id: row.id, workflowId: row.workflowId, projectId: row.projectId, created: String(row.created) }))
}

async function tenantProjectIds({ tenantId }: { tenantId: TenantId }): Promise<string[]> {
    const projects = await projectRepo().find({ where: { tenantId }, select: ['id'] })
    return projects.map((project) => project.id)
}

async function deleteMatchingWebhookPayloads({ log, projectIds, needle }: { log: FastifyBaseLogger, projectIds: string[], needle: RegExp }): Promise<number> {
    if (projectIds.length === 0) {
        return 0
    }
    const files = await fileRepo().find({ select: ['id', 'projectId'], where: { projectId: In(projectIds), type: FileType.WEBHOOK_PAYLOAD }, take: MAX_PAYLOAD_FILES })
    const deleted = await Promise.all(files.map(async (file) => {
        if (isNil(file.projectId)) {
            return 0
        }
        const text = await readText({ log, fileId: file.id, projectId: file.projectId, type: FileType.WEBHOOK_PAYLOAD })
        if (!personalDataEraser.contains({ text, needle })) {
            return 0
        }
        await fileService(log).delete({ fileId: file.id, projectId: file.projectId })
        return 1
    }))
    return deleted.reduce<number>((sum, count) => sum + count, 0)
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
        confirmedById: request.confirmedById,
        confirmedAt: request.confirmedAt,
        counts: request.counts,
    }
}

async function personOf({ log, userId }: { log: FastifyBaseLogger, userId: string }): Promise<DataErasureReceiptPerson | null> {
    const { data } = await tryCatch(() => userService(log).getMetaInformation({ id: userId }))
    return isNil(data) ? null : { id: data.id, name: `${data.firstName} ${data.lastName}`.trim(), email: data.email }
}

function identifierKindOf(kind: ErasureSubjectKind): IdentifierKind {
    switch (kind) {
        case ErasureSubjectKind.PHONE:
            return IdentifierKind.PHONE
        case ErasureSubjectKind.EMAIL:
            return IdentifierKind.EMAIL
        case ErasureSubjectKind.EMPLOYEE_ID:
            return IdentifierKind.KEY
    }
}

function invalid(message: string): never {
    throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
}

const RECEIPT_ACTION = 'Cleared inputs, outputs and error text that contain the value; run status, duration and error codes were kept'
const CLEAR_SEARCH_HASHES_SQL = `UPDATE execution
SET "searchHashes" = ARRAY(SELECT hash FROM unnest("searchHashes") AS hash WHERE hash <> ALL($2))
WHERE "projectId" = ANY($1) AND "searchHashes" && $2::character varying[]
RETURNING id`

const EMPTY_COUNTS: ErasureCounts = {
    displayLogFiles: 0,
    rawStateFiles: 0,
    logSlices: 0,
    webhookPayloads: 0,
    runIdentifiers: 0,
    failureMessages: 0,
    dedupeKeys: 0,
    searchHashes: 0,
}

const LIST_LIMIT = 50
const SCAN_PAGE_SIZE = 200
const MAX_SCANNED_RUNS = 200_000
const READ_CONCURRENCY = 8
const MAX_IDENTIFIER_MATCHES = 5000
const MAX_PAYLOAD_FILES = 5000

const ExecutionLogShape = z.looseObject({
    executionState: z.looseObject({
        steps: z.record(z.string(), z.unknown()),
        tags: z.array(z.string()).optional(),
    }),
})

type ExecutionLog = z.infer<typeof ExecutionLogShape>

type ConfirmParams = RequestRef & {
    userId: UserId
    request: ConfirmDataErasureRequestBody
}

type RunErasure = {
    display: boolean
    raw: boolean
    slices: number
    businessKey: boolean
    message: boolean
}

type RequestRef = {
    id: string
    tenantId: TenantId
}

type JobParams = {
    log: FastifyBaseLogger
    request: DataErasureRequestSchema
    value: string
    needle: RegExp
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
    needle: RegExp
    hitSliceFileIds: ReadonlySet<string>
}
