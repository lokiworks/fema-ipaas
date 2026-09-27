import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { UNKNOWN_VERSION, versionUtil } from '@fema-ipaas/server-utils'
import { BACKUP_STALE_DAYS, ComponentHealthCheck, ComponentHealthLevel, ComponentHealthReport, FileLocation, HealthComponent, TriggerStrategy, WorkerNodeStatus } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import semver from 'semver'
import { repoFactory } from '../core/db/repo-factory'
import { databaseConnection } from '../database/database-connection'
import { redisConnections } from '../database/redis-connections'
import { s3Helper } from '../file/s3-helper'
import { FlagEntity } from '../flags/flag.entity'
import { domainHelper } from '../helper/domain-helper'
import { mailSender } from '../helper/email/mail-sender'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { jobQueue } from '../workers/job-queue/job-queue'
import { workerFleetService } from '../workers/machine/worker-fleet.service'

const flagRepo = repoFactory(FlagEntity)

export const componentHealthService = (log: FastifyBaseLogger) => ({
    async check({ tenantId }: TenantParams): Promise<ComponentHealthReport> {
        const [database, queue, triggers, fileStorage, backup, version, workers] = await Promise.all([
            checkDatabase(log),
            checkQueue(log),
            countTriggers({ tenantId, log }),
            checkFileStorage(log),
            checkBackup(),
            checkVersion(),
            summarizeWorkers(log),
        ])
        const noWorkers = workers.online === 0
        const checks: ComponentHealthCheck[] = [
            database,
            { ...queue, level: queue.level === ComponentHealthLevel.OK && noWorkers && Number(queue.facts.waiting) > 0 ? ComponentHealthLevel.WARNING : queue.level },
            {
                component: HealthComponent.TRIGGER_SCHEDULING,
                level: triggerLevel({ registered: triggers.scheduled, onlineWorkers: workers.online, queueOk: queue.level !== ComponentHealthLevel.ERROR }),
                facts: { scheduled: triggers.scheduled },
            },
            {
                component: HealthComponent.WEBHOOK_INTAKE,
                level: triggers.webhooks > 0 && noWorkers ? ComponentHealthLevel.WARNING : ComponentHealthLevel.OK,
                facts: { webhooks: triggers.webhooks, url: await domainHelper.getPublicApiUrl({ path: 'v1/webhooks' }) },
            },
            fileStorage,
            checkRegistry(),
            checkSmtp(log),
            backup,
            version,
            {
                component: HealthComponent.WORKERS,
                level: workersLevel(workers),
                facts: { ...workers },
            },
        ]
        return { checkedAt: dayjs().toISOString(), checks }
    },

    async confirmBackup(): Promise<ComponentHealthCheck> {
        await flagRepo().save({ id: BACKUP_FLAG_ID, value: { confirmedAt: dayjs().toISOString() } })
        return checkBackup()
    },
})

async function checkDatabase(log: FastifyBaseLogger): Promise<ComponentHealthCheck> {
    const startedAt = Date.now()
    const { data, error } = await tryCatch<Array<{ server_version: string }>>(() => databaseConnection().query('SHOW server_version'))
    if (error) {
        log.warn({ error }, '[componentHealth] database check failed')
        return { component: HealthComponent.DATABASE, level: ComponentHealthLevel.ERROR, facts: { version: null, latencyMs: null } }
    }
    return { component: HealthComponent.DATABASE, level: ComponentHealthLevel.OK, facts: { version: data[0]?.server_version ?? null, latencyMs: Date.now() - startedAt } }
}

async function checkQueue(log: FastifyBaseLogger): Promise<ComponentHealthCheck> {
    const { data, error } = await tryCatch(async () => {
        const client = await redisConnections.useExisting()
        await client.ping()
        const counts = await Promise.all(jobQueue(log).getAllQueues().map((queue) => queue.getJobCounts('waiting', 'active', 'prioritized', 'delayed')))
        return counts.reduce((sum, count) => ({
            waiting: sum.waiting + (count.waiting ?? 0) + (count.prioritized ?? 0),
            active: sum.active + (count.active ?? 0),
            delayed: sum.delayed + (count.delayed ?? 0),
        }), { waiting: 0, active: 0, delayed: 0 })
    })
    if (error) {
        log.warn({ error }, '[componentHealth] queue check failed')
        return { component: HealthComponent.QUEUE, level: ComponentHealthLevel.ERROR, facts: { redis: redisConnections.getRedisType(), waiting: null, active: null, delayed: null } }
    }
    return { component: HealthComponent.QUEUE, level: ComponentHealthLevel.OK, facts: { redis: redisConnections.getRedisType(), ...data } }
}

async function countTriggers({ tenantId, log }: { tenantId: string, log: FastifyBaseLogger }): Promise<{ scheduled: number, webhooks: number }> {
    const { data, error } = await tryCatch<Array<{ type: string, count: string }>>(() => databaseConnection().query(
        `SELECT t.type, COUNT(*) AS count
         FROM trigger_source t
         JOIN project p ON p.id = t."projectId"
         WHERE p."tenantId" = $1 AND p.deleted IS NULL AND t.deleted IS NULL AND t.simulate = false
         GROUP BY t.type`,
        [tenantId],
    ))
    if (error) {
        log.warn({ error }, '[componentHealth] trigger count failed')
        return { scheduled: 0, webhooks: 0 }
    }
    const countOf = (types: string[]): number => data.filter((row) => types.includes(row.type)).reduce((sum, row) => sum + Number(row.count), 0)
    return {
        scheduled: countOf([TriggerStrategy.POLLING]),
        webhooks: countOf([TriggerStrategy.WEBHOOK, TriggerStrategy.APP_WEBHOOK]),
    }
}

async function checkFileStorage(log: FastifyBaseLogger): Promise<ComponentHealthCheck> {
    const location = system.get(AppSystemProp.FILE_STORAGE_LOCATION) ?? FileLocation.DB
    if (location !== FileLocation.S3) {
        return { component: HealthComponent.FILE_STORAGE, level: ComponentHealthLevel.OK, facts: { location, bucket: null, multiInstanceReady: false } }
    }
    const probeKey = `diagnostics/component-health-${Date.now()}.txt`
    const { error } = await tryCatch(async () => {
        await s3Helper(log).uploadFile(probeKey, Buffer.from('ok'))
        await s3Helper(log).getFile(probeKey)
    })
    await tryCatch(() => s3Helper(log).deleteFiles([probeKey]))
    if (error) {
        log.warn({ error }, '[componentHealth] object storage round-trip failed')
    }
    return {
        component: HealthComponent.FILE_STORAGE,
        level: error ? ComponentHealthLevel.ERROR : ComponentHealthLevel.OK,
        facts: { location, bucket: system.get(AppSystemProp.S3_BUCKET) ?? null, multiInstanceReady: true },
    }
}

function checkRegistry(): ComponentHealthCheck {
    const url = system.get(AppSystemProp.CONNECTOR_REGISTRY_URL) ?? ''
    if (url.length === 0) {
        return { component: HealthComponent.CONNECTOR_REGISTRY, level: ComponentHealthLevel.NOT_CONFIGURED, facts: { host: null } }
    }
    return { component: HealthComponent.CONNECTOR_REGISTRY, level: ComponentHealthLevel.OK, facts: { host: hostOf(url) } }
}

function checkSmtp(log: FastifyBaseLogger): ComponentHealthCheck {
    if (!mailSender(log).isConfigured()) {
        return { component: HealthComponent.SMTP, level: ComponentHealthLevel.NOT_CONFIGURED, facts: { host: null } }
    }
    return { component: HealthComponent.SMTP, level: ComponentHealthLevel.OK, facts: { host: system.get(AppSystemProp.SMTP_HOST) ?? null } }
}

async function checkBackup(): Promise<ComponentHealthCheck> {
    const flag = await flagRepo().findOneBy({ id: BACKUP_FLAG_ID })
    const value: unknown = flag?.value
    const confirmedAt = typeof value === 'object' && !isNil(value) && 'confirmedAt' in value && typeof value.confirmedAt === 'string' ? value.confirmedAt : null
    return {
        component: HealthComponent.BACKUP,
        level: backupLevel({ confirmedAt, now: dayjs().toISOString() }),
        facts: { confirmedAt },
    }
}

async function checkVersion(): Promise<ComponentHealthCheck> {
    const current = versionUtil.getCurrentRelease()
    const latest = await versionUtil.getLatestRelease()
    const checkable = latest !== UNKNOWN_VERSION && !isNil(semver.valid(latest)) && !isNil(semver.valid(current))
    const updateAvailable = checkable && semver.gt(latest, current)
    return {
        component: HealthComponent.VERSION,
        level: current === UNKNOWN_VERSION ? ComponentHealthLevel.ERROR : updateAvailable ? ComponentHealthLevel.INFO : ComponentHealthLevel.OK,
        facts: { current, latest: checkable ? latest : null, updateCheckFailed: !checkable },
    }
}

async function summarizeWorkers(log: FastifyBaseLogger): Promise<WorkerSummary> {
    const { data, error } = await tryCatch(() => workerFleetService(log).list())
    if (error) {
        log.warn({ error }, '[componentHealth] worker fleet read failed')
        return { online: 0, draining: 0, offline: 0, versionMismatched: 0 }
    }
    const live = data.nodes.filter((node) => node.status !== WorkerNodeStatus.OFFLINE)
    return {
        online: data.nodes.filter((node) => node.status === WorkerNodeStatus.ONLINE).length,
        draining: data.nodes.filter((node) => node.status === WorkerNodeStatus.DRAINING).length,
        offline: data.nodes.filter((node) => node.status === WorkerNodeStatus.OFFLINE).length,
        versionMismatched: live.filter((node) => !node.versionMatchesApp).length,
    }
}

function triggerLevel({ registered, onlineWorkers, queueOk }: TriggerLevelParams): ComponentHealthLevel {
    if (!queueOk) {
        return ComponentHealthLevel.ERROR
    }
    return registered > 0 && onlineWorkers === 0 ? ComponentHealthLevel.WARNING : ComponentHealthLevel.OK
}

function workersLevel(summary: WorkerSummary): ComponentHealthLevel {
    if (summary.online === 0) {
        return ComponentHealthLevel.ERROR
    }
    return summary.offline > 0 || summary.versionMismatched > 0 ? ComponentHealthLevel.WARNING : ComponentHealthLevel.OK
}

function backupLevel({ confirmedAt, now }: { confirmedAt: string | null, now: string }): ComponentHealthLevel {
    if (isNil(confirmedAt)) {
        return ComponentHealthLevel.NOT_CONFIGURED
    }
    return dayjs(now).diff(dayjs(confirmedAt), 'day', true) > BACKUP_STALE_DAYS ? ComponentHealthLevel.WARNING : ComponentHealthLevel.OK
}

function hostOf(url: string): string | null {
    try {
        return new URL(url).host
    }
    catch {
        return null
    }
}

const BACKUP_FLAG_ID = 'BACKUP_CONFIRMATION'

export const componentHealthUtils = {
    triggerLevel,
    workersLevel,
    backupLevel,
    hostOf,
}

type TenantParams = {
    tenantId: string
}

type WorkerSummary = {
    online: number
    draining: number
    offline: number
    versionMismatched: number
}

type TriggerLevelParams = {
    registered: number
    onlineWorkers: number
    queueOk: boolean
}
