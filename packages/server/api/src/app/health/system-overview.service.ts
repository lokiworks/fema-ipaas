import fs from 'fs/promises'
import path from 'path'
import { generateId } from '@fema-ipaas/core-utils'
import { DatabaseType, RedisType, UNKNOWN_VERSION, versionUtil } from '@fema-ipaas/server-utils'
import {
    ConnectorSyncMode,
    DiagnosticsBundle,
    EncryptionKeySource,
    FileLocation,
    FlagId,
    isNil,
    IssueStatus,
    OptionalServiceKind,
    OptionalServiceProblem,
    OptionalServiceStatus,
    ServiceProblemKind,
    SetupCheck,
    SetupCheckKind,
    SetupCheckLevel,
    SetupChecklist,
    SetupStatus,
    SystemOverview,
    tryCatch,
    tryCatchSync,
    unique,
    UpdateCheckStatus,
    WorkflowStatus,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import semver from 'semver'
import { In } from 'typeorm'
import { notificationChannelRepo } from '../alert/notification-channel.service'
import { backupService } from '../backup/backup.service'
import { databaseConnection } from '../database/database-connection'
import { redisConnections } from '../database/redis-connections'
import { flagService } from '../flags/flag.service'
import { mailSender } from '../helper/email/mail-sender'
import { encryptUtils } from '../helper/encryption'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { issueRepo } from '../issue/issue.service'
import { projectRepo } from '../project/project-repo'
import { tenantRepo } from '../tenant/tenant.service'
import { userRepo } from '../user/user-service'
import { machineService } from '../workers/machine/machine-service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'

export const systemOverviewService = (log: FastifyBaseLogger) => ({
    async isInitialized(): Promise<boolean> {
        const userCreated = await flagService(log).getOne(FlagId.USER_CREATED)
        return userCreated?.value === true
    },

    async getSetupStatus(): Promise<SetupStatus> {
        if (await this.isInitialized()) {
            return { initialized: true, version: null, checks: [], services: [] }
        }
        const [database, redis, workers, dataDirectory] = await Promise.all([
            readDatabaseVersion(log),
            readRedisVersion(log),
            machineService(log).list(''),
            checkDataDirectory(),
        ])
        const keySource = encryptionKeySource()
        const fileLocation = system.get(AppSystemProp.FILE_STORAGE_LOCATION) ?? null
        return {
            initialized: false,
            version: versionUtil.getCurrentRelease(),
            checks: [
                { kind: SetupCheckKind.DATABASE, level: database.ok ? SetupCheckLevel.OK : SetupCheckLevel.ERROR, detail: database.version },
                { kind: SetupCheckKind.REDIS, level: redis.ok ? SetupCheckLevel.OK : SetupCheckLevel.ERROR, detail: redis.ok ? `${redis.type} ${redis.version ?? ''}`.trim() : null },
                {
                    kind: SetupCheckKind.ENCRYPTION_KEY,
                    level: keySource === EncryptionKeySource.MISSING ? SetupCheckLevel.ERROR : keySource === EncryptionKeySource.GENERATED_FILE ? SetupCheckLevel.WARNING : SetupCheckLevel.OK,
                    detail: keySource === EncryptionKeySource.GENERATED_FILE ? `${system.get(AppSystemProp.CONFIG_PATH) ?? ''}/settings.json` : null,
                },
                { kind: SetupCheckKind.FILE_STORAGE, level: SetupCheckLevel.OK, detail: fileLocation },
                dataDirectory,
                { kind: SetupCheckKind.WORKERS, level: workers.length > 0 ? SetupCheckLevel.OK : SetupCheckLevel.WARNING, detail: String(workers.length) },
            ],
            services: optionalServices(log),
        }
    },

    async getSetupChecklist({ tenantId }: { tenantId: string }): Promise<SetupChecklist> {
        const [tenant, users, channels] = await Promise.all([
            tenantRepo().findOneByOrFail({ id: tenantId }),
            userRepo().countBy({ tenantId }),
            notificationChannelRepo().countBy({ tenantId }),
        ])
        const providers: unknown = tenant.federatedAuthProviders
        return {
            membersInvited: users > 1,
            loginMethodsConfigured: typeof providers === 'object' && !isNil(providers) && Object.values(providers).some((provider) => !isNil(provider)),
            alertChannelsConfigured: channels > 0,
            smtpEnabled: mailSender(log).isConfigured(),
            encryptionKeyFromFile: encryptionKeySource() === EncryptionKeySource.GENERATED_FILE,
        }
    },

    async getOverview({ tenantId }: { tenantId: string }): Promise<SystemOverview> {
        const [tenant, latestRelease, database, redis, workers, backup] = await Promise.all([
            tenantRepo().findOneByOrFail({ id: tenantId }),
            versionUtil.getLatestRelease(),
            readDatabaseVersion(log),
            readRedisVersion(log),
            machineService(log).list(tenantId),
            backupService(log).summaryForUpgrade(),
        ])
        const current = versionUtil.getCurrentRelease()
        const fileLocation = system.get(AppSystemProp.FILE_STORAGE_LOCATION) ?? null
        return {
            release: {
                current,
                latest: latestRelease === UNKNOWN_VERSION ? null : latestRelease,
                updateCheck: updateCheckOf({ current, latest: latestRelease }),
                checkedAt: new Date().toISOString(),
            },
            installedAt: tenant.created,
            database,
            redis,
            workers: {
                online: workers.length,
                versions: unique(workers.map((worker) => worker.information.workerProps.version ?? UNKNOWN_VERSION)),
            },
            encryptionKey: {
                source: encryptionKeySource(),
                path: system.get(AppSystemProp.CONFIG_PATH) ?? null,
                retiredKeys: encryptUtils.getRetiredEncryptionKeys().length,
            },
            fileStorage: {
                location: fileLocation,
                multiInstanceReady: fileLocation === FileLocation.S3,
            },
            containerType: system.get(AppSystemProp.CONTAINER_TYPE) ?? null,
            frontendUrl: system.get(AppSystemProp.FRONTEND_URL) ?? null,
            services: optionalServices(log),
            backup,
        }
    },

    async getDiagnosticsBundle({ tenantId }: { tenantId: string }): Promise<DiagnosticsBundle> {
        const overview = await this.getOverview({ tenantId })
        const projects = await projectRepo().find({ where: { tenantId }, select: ['id'] })
        const projectIds = projects.map((project) => project.id)
        const [workflows, enabledWorkflows, users, openIssues] = await Promise.all([
            workflowRepo().countBy({ projectId: In(projectIds) }),
            workflowRepo().countBy({ projectId: In(projectIds), status: WorkflowStatus.ENABLED }),
            userRepo().countBy({ tenantId }),
            issueRepo().countBy({ projectId: In(projectIds), status: In([IssueStatus.OPEN, IssueStatus.INVESTIGATING]) }),
        ])
        return {
            generatedAt: new Date().toISOString(),
            overview: { ...overview, frontendUrl: null },
            counts: {
                projects: projectIds.length,
                workflows,
                enabledWorkflows,
                users,
                openIssues,
            },
            excluded: EXCLUDED_FROM_DIAGNOSTICS,
        }
    },
})

function updateCheckOf({ current, latest }: { current: string, latest: string }): UpdateCheckStatus {
    if (latest === UNKNOWN_VERSION || isNil(semver.valid(latest)) || isNil(semver.valid(current))) {
        return UpdateCheckStatus.FAILED
    }
    return semver.gt(latest, current) ? UpdateCheckStatus.UPDATE_AVAILABLE : UpdateCheckStatus.UP_TO_DATE
}

function encryptionKeySource(): EncryptionKeySource {
    if (!isNil(system.get(AppSystemProp.ENCRYPTION_KEY))) {
        return EncryptionKeySource.ENVIRONMENT
    }
    return redisConnections.getRedisType() === RedisType.MEMORY ? EncryptionKeySource.GENERATED_FILE : EncryptionKeySource.MISSING
}

function optionalServices(log: FastifyBaseLogger): OptionalServiceStatus[] {
    const registry = urlSetting({ prop: AppSystemProp.CONNECTOR_REGISTRY_URL })
    const templates = urlSetting({ prop: AppSystemProp.TEMPLATES_SOURCE_URL })
    const smtp = mailSender(log)
    const smtpHost = system.get(AppSystemProp.SMTP_HOST) ?? null
    const s3Bucket = system.get(AppSystemProp.S3_BUCKET) ?? null
    const syncOff = system.get(AppSystemProp.CONNECTORS_SYNC_MODE) !== ConnectorSyncMode.OFFICIAL_AUTO
    return [
        { kind: OptionalServiceKind.SMTP, enabled: smtp.isConfigured(), detail: smtpHost, problem: smtpProblem({ log }) },
        { kind: OptionalServiceKind.OBJECT_STORAGE, enabled: system.get(AppSystemProp.FILE_STORAGE_LOCATION) === FileLocation.S3, detail: s3Bucket, problem: null },
        {
            kind: OptionalServiceKind.CONNECTOR_REGISTRY,
            enabled: registry.valid && !syncOff,
            detail: registry.valid ? hostOf(registry.url) : null,
            problem: registry.problem ?? (registry.valid && syncOff ? configurationProblem({ message: 'FEMA_CONNECTORS_SYNC_MODE is NONE, so the registry is never read' }) : null),
        },
        { kind: OptionalServiceKind.TEMPLATE_REGISTRY, enabled: templates.valid, detail: templates.valid ? hostOf(templates.url) : null, problem: templates.problem },
    ]
}

function smtpProblem({ log }: { log: FastifyBaseLogger }): OptionalServiceProblem | null {
    const sender = mailSender(log)
    const invalid = sender.configurationProblem()
    if (!isNil(invalid)) {
        return configurationProblem({ message: invalid })
    }
    const delivery = sender.lastDelivery()
    if (isNil(delivery) || delivery.ok) {
        return null
    }
    return { kind: ServiceProblemKind.RECENT_FAILURE, message: delivery.reason ?? 'The last email was not delivered', at: delivery.at }
}

function urlSetting({ prop }: { prop: AppSystemProp }): UrlSetting {
    const configured = system.get(prop)
    if (isNil(configured) || configured.trim().length === 0) {
        return { url: null, valid: false, problem: null }
    }
    const { data } = tryCatchSync(() => new URL(configured.trim()))
    const valid = !isNil(data) && (data.protocol === 'http:' || data.protocol === 'https:')
    return {
        url: configured.trim(),
        valid,
        problem: valid ? null : configurationProblem({ message: `FEMA_${prop} is not a valid http or https address` }),
    }
}

function configurationProblem({ message }: { message: string }): OptionalServiceProblem {
    return { kind: ServiceProblemKind.INVALID_CONFIGURATION, message, at: null }
}

async function checkDataDirectory(): Promise<SetupCheck> {
    const directory = system.get(AppSystemProp.CONFIG_PATH) ?? null
    if (isNil(directory)) {
        return { kind: SetupCheckKind.DATA_DIRECTORY, level: SetupCheckLevel.OK, detail: null }
    }
    const probe = path.join(directory, `.write-test-${generateId()}`)
    const { error } = await tryCatch(async () => {
        await fs.mkdir(directory, { recursive: true })
        await fs.writeFile(probe, 'ok')
        await fs.rm(probe, { force: true })
    })
    if (isNil(error)) {
        return { kind: SetupCheckKind.DATA_DIRECTORY, level: SetupCheckLevel.OK, detail: directory }
    }
    const needed = encryptionKeySource() === EncryptionKeySource.GENERATED_FILE || system.get(AppSystemProp.DB_TYPE) === DatabaseType.PGLITE
    return { kind: SetupCheckKind.DATA_DIRECTORY, level: needed ? SetupCheckLevel.ERROR : SetupCheckLevel.WARNING, detail: directory }
}

function hostOf(url: string | null): string | null {
    if (isNil(url) || url.length === 0) {
        return null
    }
    const { data } = tryCatchSync(() => new URL(url).host)
    return data ?? null
}

async function readDatabaseVersion(log: FastifyBaseLogger): Promise<SystemOverview['database']> {
    const { data, error } = await tryCatch<Array<{ server_version: string }>>(() => databaseConnection().query('SHOW server_version'))
    if (error) {
        log.warn({ error }, '[systemOverview] could not read the database version')
        return { ok: false, version: null }
    }
    return { ok: true, version: data[0]?.server_version ?? null }
}

async function readRedisVersion(log: FastifyBaseLogger): Promise<SystemOverview['redis']> {
    const type = redisConnections.getRedisType()
    const { data, error } = await tryCatch(async () => {
        const client = await redisConnections.useExisting()
        return client.info('server')
    })
    if (error) {
        log.warn({ error }, '[systemOverview] could not read the redis version')
        return { ok: false, type, version: null }
    }
    const match = /redis_version:([^\r\n]+)/.exec(data)
    return { ok: true, type, version: match?.[1]?.trim() ?? null }
}

type UrlSetting = {
    url: string | null
    valid: boolean
    problem: OptionalServiceProblem | null
}

const EXCLUDED_FROM_DIAGNOSTICS = [
    'passwords',
    'encryptionKeys',
    'connectionCredentials',
    'variableValues',
    'runPayloads',
    'userEmails',
    'frontendUrl',
]
