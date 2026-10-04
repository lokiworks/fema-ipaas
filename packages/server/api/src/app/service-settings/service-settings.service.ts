import { ApplicationError, ErrorCode, generateId, isNil, tryCatch } from '@fema-ipaas/core-utils'
import {
    FileLocation,
    OptionalServiceKind,
    SaveServiceSettingResponse,
    ServiceClearBlock,
    ServiceConfigSource,
    ServiceSettingDraft,
    ServiceSettingView,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { FileEntity } from '../file/file.entity'
import { serviceCheckService, ServiceCandidate } from '../health/service-check.service'
import { encryptUtils } from '../helper/encryption'
import { savedOverrides } from '../helper/system/saved-overrides'
import { system } from '../helper/system/system'
import { AppSystemProp, SystemProp } from '../helper/system/system-props'
import { tenantService } from '../tenant/tenant.service'
import { userService } from '../user/user-service'
import { ServiceSettingEntity, ServiceSettingSchema } from './service-setting.entity'

const SYNC_INTERVAL_MS = 30_000
const SERVICE_KINDS = Object.values(OptionalServiceKind)

export const serviceSettingRepo = repoFactory(ServiceSettingEntity)
const fileRepo = repoFactory(FileEntity)

let syncTimer: NodeJS.Timeout | null = null

export const serviceSettingsService = (log: FastifyBaseLogger) => ({
    async list({ tenantId }: TenantScope): Promise<ServiceSettingView[]> {
        const rows = await serviceSettingRepo().findBy({ tenantId })
        return Promise.all(SERVICE_KINDS.map((kind) => viewOf({ kind, row: rows.find((candidate) => candidate.kind === kind) ?? null, log })))
    },

    async resolveCandidate({ tenantId, draft }: ResolveParams): Promise<ServiceCandidate | { error: string }> {
        const row = await serviceSettingRepo().findOneBy({ tenantId, kind: draft.kind })
        const stored = isNil(row) ? null : await decryptSecrets({ row })
        switch (draft.kind) {
            case OptionalServiceKind.SMTP:
                return { kind: draft.kind, config: { ...draft.config, password: nonEmpty({ value: draft.config.password }) ?? stored?.password } }
            case OptionalServiceKind.OBJECT_STORAGE: {
                const secretAccessKey = nonEmpty({ value: draft.config.secretAccessKey }) ?? stored?.secretAccessKey
                return isNil(secretAccessKey)
                    ? { error: 'The secret access key is required' }
                    : { kind: draft.kind, config: { ...draft.config, secretAccessKey } }
            }
            case OptionalServiceKind.CONNECTOR_REGISTRY:
            case OptionalServiceKind.TEMPLATE_REGISTRY:
                return { kind: draft.kind, config: draft.config }
        }
    },

    async save({ tenantId, userId, draft }: SaveParams): Promise<SaveOutcome> {
        assertEditable({ kind: draft.kind })
        const candidate = await this.resolveCandidate({ tenantId, draft })
        if ('error' in candidate) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: candidate.error } })
        }
        const tenant = await tenantService(log).getOneOrThrow(tenantId)
        const check = await serviceCheckService(log).checkCandidate({ candidate, recipient: undefined, tenantName: tenant.name })
        if (!check.ok) {
            return { saved: false, check, setting: null }
        }
        const { values, secrets } = split({ candidate })
        const encrypted = isNil(secrets) ? null : await encryptUtils.encryptObject(secrets)
        const existing = await serviceSettingRepo().findOneBy({ tenantId, kind: draft.kind })
        if (isNil(existing)) {
            await serviceSettingRepo().insert({ id: generateId(), tenantId, kind: draft.kind, values, secrets: encrypted, updatedBy: userId })
        }
        else {
            await serviceSettingRepo().update({ id: existing.id, tenantId }, { values, secrets: encrypted, updatedBy: userId })
        }
        await this.sync()
        log.info({ tenant: { id: tenantId }, service: { kind: draft.kind } }, '[serviceSettings#save] Optional service saved')
        const saved = await serviceSettingRepo().findOneByOrFail({ tenantId, kind: draft.kind })
        return { saved: true, check, setting: await viewOf({ kind: draft.kind, row: saved, log }) }
    },

    async clear({ tenantId, kind }: TenantScope & { kind: OptionalServiceKind }): Promise<ServiceSettingView> {
        assertEditable({ kind })
        const block = await clearBlock({ kind })
        if (!isNil(block)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'Files are stored in object storage. Removing its configuration would make them unreadable.' },
            })
        }
        await serviceSettingRepo().delete({ tenantId, kind })
        await this.sync()
        return viewOf({ kind, row: null, log })
    },

    async sync(): Promise<void> {
        const primary = await tenantService(log).getOldestTenant()
        if (isNil(primary)) {
            savedOverrides.replace({ values: new Map() })
            return
        }
        const rows = await serviceSettingRepo().findBy({ tenantId: primary.id })
        const entries = await Promise.all(rows.filter((row) => !isLocked({ kind: row.kind })).map((row) => overlayOf({ row, log })))
        savedOverrides.replace({ values: new Map(entries.flat()) })
    },

    startSync(): void {
        if (!isNil(syncTimer)) {
            return
        }
        syncTimer = setInterval(() => {
            void tryCatch(() => this.sync()).then(({ error }) => {
                if (!isNil(error)) {
                    log.warn({ error }, '[serviceSettings#sync] Could not reload the saved service settings')
                }
            })
        }, SYNC_INTERVAL_MS)
        syncTimer.unref()
    },

    stopSync(): void {
        if (!isNil(syncTimer)) {
            clearInterval(syncTimer)
            syncTimer = null
        }
    },
})

async function viewOf({ kind, row, log }: { kind: OptionalServiceKind, row: ServiceSettingSchema | null, log: FastifyBaseLogger }): Promise<ServiceSettingView> {
    const locked = isLocked({ kind })
    const block = await clearBlock({ kind })
    const source = locked ? ServiceConfigSource.ENVIRONMENT : isNil(row) ? ServiceConfigSource.NONE : ServiceConfigSource.SAVED
    const updatedBy = isNil(row) || isNil(row.updatedBy) ? null : await emailOf({ log, userId: row.updatedBy })
    return {
        kind,
        source,
        values: locked || isNil(row) ? effectiveValues({ kind }) : row.values,
        secretConfigured: locked ? hasEnvironmentSecret({ kind }) : !isNil(row?.secrets),
        updated: isNil(row) || locked ? null : new Date(row.updated).toISOString(),
        updatedBy: locked ? null : updatedBy,
        canClear: !locked && !isNil(row) && isNil(block),
        clearBlock: block,
    }
}

async function emailOf({ log, userId }: { log: FastifyBaseLogger, userId: string }): Promise<string | null> {
    const { data, error } = await tryCatch(() => userService(log).getMetaInformation({ id: userId }))
    return error ? null : data.email
}

function assertEditable({ kind }: { kind: OptionalServiceKind }): void {
    if (isLocked({ kind })) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'This service is configured through environment variables, which take priority. Change it there.' },
        })
    }
}

function isLocked({ kind }: { kind: OptionalServiceKind }): boolean {
    switch (kind) {
        case OptionalServiceKind.SMTP:
            return system.isFromEnvironment(AppSystemProp.SMTP_HOST)
        case OptionalServiceKind.OBJECT_STORAGE:
            return system.isFromEnvironment(AppSystemProp.S3_BUCKET) || (system.isFromEnvironment(AppSystemProp.FILE_STORAGE_LOCATION) && system.get(AppSystemProp.FILE_STORAGE_LOCATION) === FileLocation.S3)
        case OptionalServiceKind.CONNECTOR_REGISTRY:
            return system.isFromEnvironment(AppSystemProp.CONNECTOR_REGISTRY_URL)
        case OptionalServiceKind.TEMPLATE_REGISTRY:
            return system.isFromEnvironment(AppSystemProp.TEMPLATES_SOURCE_URL)
    }
}

async function clearBlock({ kind }: { kind: OptionalServiceKind }): Promise<ServiceClearBlock | null> {
    if (kind !== OptionalServiceKind.OBJECT_STORAGE) {
        return null
    }
    const stored = await fileRepo().count({ where: { location: FileLocation.S3 } })
    return stored > 0 ? ServiceClearBlock.FILES_IN_OBJECT_STORAGE : null
}

function effectiveValues({ kind }: { kind: OptionalServiceKind }): Record<string, string | number> {
    const pick = (props: Record<string, AppSystemProp>): Record<string, string | number> => Object.fromEntries(
        Object.entries(props).flatMap(([name, prop]) => {
            const value = system.get(prop)
            return isNil(value) || value.length === 0 ? [] : [[name, name === 'port' ? Number(value) : value]]
        }),
    )
    switch (kind) {
        case OptionalServiceKind.SMTP:
            return pick({ host: AppSystemProp.SMTP_HOST, port: AppSystemProp.SMTP_PORT, username: AppSystemProp.SMTP_USERNAME, senderEmail: AppSystemProp.SMTP_SENDER_EMAIL, senderName: AppSystemProp.SMTP_SENDER_NAME })
        case OptionalServiceKind.OBJECT_STORAGE:
            return pick({ endpoint: AppSystemProp.S3_ENDPOINT, region: AppSystemProp.S3_REGION, bucket: AppSystemProp.S3_BUCKET, accessKeyId: AppSystemProp.S3_ACCESS_KEY_ID })
        case OptionalServiceKind.CONNECTOR_REGISTRY:
            return pick({ url: AppSystemProp.CONNECTOR_REGISTRY_URL })
        case OptionalServiceKind.TEMPLATE_REGISTRY:
            return pick({ url: AppSystemProp.TEMPLATES_SOURCE_URL })
    }
}

function hasEnvironmentSecret({ kind }: { kind: OptionalServiceKind }): boolean {
    if (kind === OptionalServiceKind.SMTP) {
        return system.isFromEnvironment(AppSystemProp.SMTP_PASSWORD)
    }
    if (kind === OptionalServiceKind.OBJECT_STORAGE) {
        return system.isFromEnvironment(AppSystemProp.S3_SECRET_ACCESS_KEY)
    }
    return false
}

function split({ candidate }: { candidate: ServiceCandidate }): { values: Record<string, string | number>, secrets: Record<string, string> | null } {
    switch (candidate.kind) {
        case OptionalServiceKind.SMTP: {
            const { password, ...rest } = candidate.config
            return { values: definedOnly({ values: rest }), secrets: isNil(password) || password.length === 0 ? null : { password } }
        }
        case OptionalServiceKind.OBJECT_STORAGE: {
            const { secretAccessKey, ...rest } = candidate.config
            return { values: definedOnly({ values: rest }), secrets: { secretAccessKey } }
        }
        case OptionalServiceKind.CONNECTOR_REGISTRY:
        case OptionalServiceKind.TEMPLATE_REGISTRY:
            return { values: { url: candidate.config.url }, secrets: null }
    }
}

function definedOnly({ values }: { values: Record<string, string | number | undefined> }): Record<string, string | number> {
    return Object.fromEntries(Object.entries(values).flatMap(([key, value]) => isNil(value) || value === '' ? [] : [[key, value]]))
}

async function overlayOf({ row, log }: { row: ServiceSettingSchema, log: FastifyBaseLogger }): Promise<Array<[SystemProp, string]>> {
    const { data: secrets, error } = await tryCatch(() => decryptSecrets({ row }))
    if (error) {
        log.warn({ error, service: { kind: row.kind } }, '[serviceSettings#sync] Could not decrypt the saved secret, so this service stays off')
        return []
    }
    const text = (name: string): string | undefined => {
        const value = row.values[name]
        return isNil(value) ? undefined : String(value)
    }
    const pairs: Array<[SystemProp, string | undefined]> = (() => {
        switch (row.kind) {
            case OptionalServiceKind.SMTP:
                return [
                    [AppSystemProp.SMTP_HOST, text('host')],
                    [AppSystemProp.SMTP_PORT, text('port')],
                    [AppSystemProp.SMTP_USERNAME, text('username')],
                    [AppSystemProp.SMTP_PASSWORD, secrets?.password],
                    [AppSystemProp.SMTP_SENDER_EMAIL, text('senderEmail')],
                    [AppSystemProp.SMTP_SENDER_NAME, text('senderName')],
                ]
            case OptionalServiceKind.OBJECT_STORAGE:
                return [
                    [AppSystemProp.FILE_STORAGE_LOCATION, FileLocation.S3],
                    [AppSystemProp.S3_ENDPOINT, text('endpoint')],
                    [AppSystemProp.S3_REGION, text('region')],
                    [AppSystemProp.S3_BUCKET, text('bucket')],
                    [AppSystemProp.S3_ACCESS_KEY_ID, text('accessKeyId')],
                    [AppSystemProp.S3_SECRET_ACCESS_KEY, secrets?.secretAccessKey],
                ]
            case OptionalServiceKind.CONNECTOR_REGISTRY:
                return [[AppSystemProp.CONNECTOR_REGISTRY_URL, text('url')]]
            case OptionalServiceKind.TEMPLATE_REGISTRY:
                return [[AppSystemProp.TEMPLATES_SOURCE_URL, text('url')]]
        }
    })()
    return pairs.flatMap(([prop, value]) => isNil(value) ? [] : [[prop, value] as [SystemProp, string]])
}

async function decryptSecrets({ row }: { row: ServiceSettingSchema }): Promise<Record<string, string> | null> {
    if (isNil(row.secrets)) {
        return null
    }
    return encryptUtils.decryptObject<Record<string, string>>(row.secrets)
}

function nonEmpty({ value }: { value: string | undefined }): string | undefined {
    return isNil(value) || value.length === 0 ? undefined : value
}

type TenantScope = {
    tenantId: string
}

type ResolveParams = TenantScope & {
    draft: ServiceSettingDraft
}

type SaveParams = ResolveParams & {
    userId: string
}

type SaveOutcome = SaveServiceSettingResponse
