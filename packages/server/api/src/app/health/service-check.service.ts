import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { safeHttp, versionUtil } from '@fema-ipaas/server-utils'
import { FileLocation, ObjectStorageServiceConfig, OptionalServiceKind, ServiceCheckFailure, ServiceCheckRequest, ServiceCheckResult, SmtpServiceConfig } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { s3Helper } from '../file/s3-helper'
import { mailSender } from '../helper/email/mail-sender'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { serviceFailure } from './service-failure'

const REGISTRY_TIMEOUT_MS = 8000
const OBJECT_STORAGE_TIMEOUT_MS = 20000

export const serviceCheckService = (log: FastifyBaseLogger) => ({
    async check({ request, tenantName }: CheckParams): Promise<ServiceCheckResult> {
        const outcome = await run({ log, request, tenantName })
        return resultOf({ kind: request.kind, outcome })
    },

    async checkCandidate({ candidate, recipient, tenantName }: CheckCandidateParams): Promise<ServiceCheckResult> {
        const outcome = await runCandidate({ log, candidate, recipient, tenantName })
        return resultOf({ kind: candidate.kind, outcome })
    },
})

async function runCandidate({ log, candidate, recipient, tenantName }: RunCandidateParams): Promise<Outcome> {
    switch (candidate.kind) {
        case OptionalServiceKind.SMTP: {
            const smtp = candidate.config
            const mailCandidate = { host: smtp.host, port: smtp.port, username: nonEmpty({ value: smtp.username }), password: nonEmpty({ value: smtp.password }), senderEmail: nonEmpty({ value: smtp.senderEmail }), senderName: nonEmpty({ value: smtp.senderName }) }
            const sender = mailSender(log)
            const verification = isNil(recipient) ? await sender.verify({ candidate: mailCandidate }) : await sender.sendTest({ to: recipient, tenantName, candidate: mailCandidate })
            return { ...verification, sentTo: verification.ok ? recipient ?? null : null }
        }
        case OptionalServiceKind.OBJECT_STORAGE: {
            const storage = candidate.config
            const { error } = await tryCatch(() => withTimeout({
                promise: s3Helper(log).validateS3Configuration({
                    region: nonEmpty({ value: storage.region }),
                    endpoint: nonEmpty({ value: storage.endpoint }),
                    bucket: storage.bucket,
                    accessKeyId: storage.accessKeyId,
                    secretAccessKey: storage.secretAccessKey,
                }),
                milliseconds: OBJECT_STORAGE_TIMEOUT_MS,
            }))
            if (!isNil(error)) {
                return failed({ error, secrets: [storage.secretAccessKey, storage.accessKeyId] })
            }
            return succeeded()
        }
        case OptionalServiceKind.CONNECTOR_REGISTRY:
            return checkRegistry({ url: candidate.config.url, path: `/registry?release=${encodeURIComponent(versionUtil.getCurrentRelease())}` })
        case OptionalServiceKind.TEMPLATE_REGISTRY:
            return checkRegistry({ url: candidate.config.url, path: '/categories' })
    }
}

function resultOf({ kind, outcome }: { kind: OptionalServiceKind, outcome: Outcome }): ServiceCheckResult {
    return {
        kind,
        ok: outcome.ok,
        failure: outcome.failure,
        reason: outcome.reason,
        sentTo: outcome.sentTo,
        checkedAt: new Date().toISOString(),
    }
}

function nonEmpty({ value }: { value: string | undefined }): string | undefined {
    return isNil(value) || value.trim().length === 0 ? undefined : value
}

async function run({ log, request, tenantName }: RunParams): Promise<Outcome> {
    switch (request.kind) {
        case OptionalServiceKind.SMTP:
            return checkSmtp({ log, recipient: request.recipient, tenantName })
        case OptionalServiceKind.OBJECT_STORAGE:
            return checkObjectStorage({ log })
        case OptionalServiceKind.CONNECTOR_REGISTRY:
            return checkRegistry({ url: system.get(AppSystemProp.CONNECTOR_REGISTRY_URL), path: `/registry?release=${encodeURIComponent(versionUtil.getCurrentRelease())}` })
        case OptionalServiceKind.TEMPLATE_REGISTRY:
            return checkRegistry({ url: system.get(AppSystemProp.TEMPLATES_SOURCE_URL), path: '/categories' })
    }
}

async function checkSmtp({ log, recipient, tenantName }: { log: FastifyBaseLogger, recipient: string | undefined, tenantName: string }): Promise<Outcome> {
    const sender = mailSender(log)
    const verification = isNil(recipient) ? await sender.verify() : await sender.sendTest({ to: recipient, tenantName })
    return { ...verification, sentTo: verification.ok ? recipient ?? null : null }
}

async function checkObjectStorage({ log }: { log: FastifyBaseLogger }): Promise<Outcome> {
    if (system.get(AppSystemProp.FILE_STORAGE_LOCATION) !== FileLocation.S3) {
        return notConfigured()
    }
    const { error } = await tryCatch(() => withTimeout({
        promise: s3Helper(log).validateS3Configuration(),
        milliseconds: OBJECT_STORAGE_TIMEOUT_MS,
    }))
    if (!isNil(error)) {
        log.warn({ error }, '[serviceCheck] object storage check failed')
        return failed({ error, secrets: secretsOf({ props: [AppSystemProp.S3_SECRET_ACCESS_KEY, AppSystemProp.S3_ACCESS_KEY_ID] }) })
    }
    return succeeded()
}

async function checkRegistry({ url, path }: { url: string | undefined, path: string }): Promise<Outcome> {
    const base = isNil(url) ? '' : url.trim().replace(/\/+$/, '')
    if (base.length === 0) {
        return notConfigured()
    }
    const { data, error } = await tryCatch(() => safeHttp.axios.get<unknown>(`${base}${path}`, { timeout: REGISTRY_TIMEOUT_MS }))
    if (error) {
        return failed({ error, secrets: [] })
    }
    if (!Array.isArray(data.data)) {
        return { ok: false, failure: ServiceCheckFailure.REJECTED, reason: 'The address answered, but not with a registry listing', sentTo: null }
    }
    return succeeded()
}

function withTimeout<T>({ promise, milliseconds }: { promise: Promise<T>, milliseconds: number }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out after ${milliseconds / 1000} seconds`)), milliseconds)
        promise.then(
            (value) => {
                clearTimeout(timer)
                resolve(value)
            },
            (reason: unknown) => {
                clearTimeout(timer)
                reject(reason)
            },
        )
    })
}

function secretsOf({ props }: { props: AppSystemProp[] }): string[] {
    return props.map((prop) => system.get(prop)).filter((value): value is string => !isNil(value))
}

function failed({ error, secrets }: { error: unknown, secrets: string[] }): Outcome {
    return { ok: false, ...serviceFailure.classify({ error, secrets }), sentTo: null }
}

function succeeded(): Outcome {
    return { ok: true, failure: null, reason: null, sentTo: null }
}

function notConfigured(): Outcome {
    return { ok: false, failure: ServiceCheckFailure.NOT_CONFIGURED, reason: null, sentTo: null }
}

type CheckParams = {
    request: ServiceCheckRequest
    tenantName: string
}

type RunParams = CheckParams & {
    log: FastifyBaseLogger
}

export type ServiceCandidate =
    | { kind: OptionalServiceKind.SMTP, config: SmtpServiceConfig }
    | { kind: OptionalServiceKind.OBJECT_STORAGE, config: ObjectStorageServiceConfig & { secretAccessKey: string } }
    | { kind: OptionalServiceKind.CONNECTOR_REGISTRY | OptionalServiceKind.TEMPLATE_REGISTRY, config: { url: string } }

type CheckCandidateParams = {
    candidate: ServiceCandidate
    recipient: string | undefined
    tenantName: string
}

type RunCandidateParams = CheckCandidateParams & {
    log: FastifyBaseLogger
}

type Outcome = {
    ok: boolean
    failure: ServiceCheckFailure | null
    reason: string | null
    sentTo: string | null
}
