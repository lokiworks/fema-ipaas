import { RedisType, UNKNOWN_VERSION, versionUtil } from '@fema-ipaas/server-utils'
import {
    DiagnosticsBundle,
    EncryptionKeySource,
    FileLocation,
    FlagId,
    isNil,
    IssueStatus,
    OptionalServiceKind,
    OptionalServiceStatus,
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
    async getSetupStatus(): Promise<SetupStatus> {
        const userCreated = await flagService(log).getOne(FlagId.USER_CREATED)
        if (userCreated?.value === true) {
            return { initialized: true, version: null, checks: [], services: [] }
        }
        const [database, redis, workers] = await Promise.all([
            readDatabaseVersion(log),
            readRedisVersion(log),
            machineService(log).list(''),
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
        const [tenant, latestRelease, database, redis, workers] = await Promise.all([
            tenantRepo().findOneByOrFail({ id: tenantId }),
            versionUtil.getLatestRelease(),
            readDatabaseVersion(log),
            readRedisVersion(log),
            machineService(log).list(tenantId),
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
    const registry = system.get(AppSystemProp.CONNECTOR_REGISTRY_URL) ?? null
    const templates = system.get(AppSystemProp.TEMPLATES_SOURCE_URL) ?? null
    const smtpHost = system.get(AppSystemProp.SMTP_HOST) ?? null
    const s3Bucket = system.get(AppSystemProp.S3_BUCKET) ?? null
    return [
        { kind: OptionalServiceKind.SMTP, enabled: mailSender(log).isConfigured(), detail: smtpHost },
        { kind: OptionalServiceKind.OBJECT_STORAGE, enabled: system.get(AppSystemProp.FILE_STORAGE_LOCATION) === FileLocation.S3, detail: s3Bucket },
        { kind: OptionalServiceKind.CONNECTOR_REGISTRY, enabled: !isNil(registry) && registry.length > 0, detail: hostOf(registry) },
        { kind: OptionalServiceKind.TEMPLATE_REGISTRY, enabled: !isNil(templates) && templates.length > 0, detail: hostOf(templates) },
    ]
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

const EXCLUDED_FROM_DIAGNOSTICS = [
    'passwords',
    'encryptionKeys',
    'connectionCredentials',
    'variableValues',
    'runPayloads',
    'userEmails',
    'frontendUrl',
]
