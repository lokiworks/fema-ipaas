import { ActionBase, connectorContract } from '@fema-ipaas/connector-sdk'
import { ApplicationError, chunk, ErrorCode, generateId, isNil, isObject, sanitizeObjectForPostgresql, tryCatch } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import { ComputedDifference, reconciliationDiff, ReconciliationDifference, ReconciliationEndpoint, ReconciliationRule, ReconciliationRuleBody, ReconciliationRun } from '@fema-ipaas/shared'
import { isValidCron } from 'cron-validator'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains, In, Not } from 'typeorm'
import { actionRunService, ActionRunStatus } from '../action-run/action-run.service'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { connectorMetadataService } from '../connectors/metadata/connector-metadata-service'
import { repoFactory } from '../core/db/repo-factory'
import { databaseConnection } from '../database/database-connection'
import { distributedLock } from '../database/redis-connections'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { mappingTableService } from '../mapping-table/mapping-table.service'
import { projectService } from '../project/project-service'
import { workflowService } from '../workflows/workflow/workflow.service'
import { reconciliationInputs } from './reconciliation-inputs'
import { reconciliationRepair } from './reconciliation-repair'
import { reconciliationSideEffects } from './reconciliation-side-effects'
import { ReconciliationDifferenceEntity, ReconciliationRuleEntity, ReconciliationRunEntity } from './reconciliation.entity'

export const reconciliationRuleRepo = repoFactory(ReconciliationRuleEntity)
export const reconciliationRunRepo = repoFactory(ReconciliationRunEntity)
export const reconciliationDifferenceRepo = repoFactory(ReconciliationDifferenceEntity)

export const reconciliationService = (log: FastifyBaseLogger, deps: ReconciliationDeps = defaultDeps(log)) => ({
    async listRules({ projectId }: { projectId: string }): Promise<ReconciliationRule[]> {
        return reconciliationRuleRepo().find({ where: { projectId }, order: { created: 'DESC' } })
    },
    async getRule({ id, projectId }: RuleRef): Promise<ReconciliationRule> {
        const rule = await reconciliationRuleRepo().findOneBy({ id, projectId })
        if (isNil(rule)) {
            throw missing({ id, type: 'ReconciliationRule' })
        }
        return rule
    },
    async saveRule({ id, newRuleId, projectId, body }: { id?: string, newRuleId?: string, projectId: string, body: ReconciliationRuleBody }): Promise<ReconciliationRule> {
        if (!isValidCron(body.cron)) throw invalid('reconciliation.invalidCron')
        await workflowService(log).getOneOrThrow({ id: body.workflowId, projectId })
        const tenantId = await projectService(log).getTenantId(projectId)
        await validateEndpoint({ endpoint: body.source, tenantId, projectId, log })
        await validateEndpoint({ endpoint: body.target, tenantId, projectId, log })
        const sourceMetadata = await connectorMetadataService(log).getOrThrow({ name: body.source.connectorName, version: undefined, tenantId, projectId })
        if (sourceMetadata.actions[body.repair.readActionName]?.classification !== 'READ' || body.repair.keyInput === 'auth' || !Object.hasOwn(sourceMetadata.actions[body.repair.readActionName]?.props ?? {}, body.repair.keyInput)) {
            throw invalid('reconciliation.readActionRequired')
        }
        for (const tableId of mappingIds(body)) {
            await mappingTableService(log).getOneOrThrow({ id: tableId, projectId })
        }
        if (id) {
            await this.getRule({ id, projectId })
        }
        const ruleId = id ?? newRuleId ?? generateId()
        const now = dayjsUtil().toISOString()
        await reconciliationRuleRepo().save({ ...body, projectId, id: ruleId, ...(!id ? { created: now } : {}), updated: now })
        const rule = await this.getRule({ id: ruleId, projectId })
        await reconciliationSideEffects(log).syncSchedule(rule)
        return rule
    },
    async deleteRule({ id, projectId }: RuleRef): Promise<void> {
        const rule = await this.getRule({ id, projectId })
        await reconciliationRuleRepo().delete({ id, projectId })
        await reconciliationSideEffects(log).onRuleDeleted(rule)
    },
    async start({ id, projectId }: RuleRef): Promise<{ runId: string }> {
        return distributedLock(log).runExclusive({ key: `recon-start:${projectId}:${id}`, timeoutInSeconds: 15, fn: async () => {
            await this.getRule({ id, projectId })
            const existing = await reconciliationRunRepo().findOneBy({ ruleId: id, projectId, status: In(['QUEUED', 'RUNNING']) })
            if (existing) return { runId: existing.id }
            const runId = generateId()
            const now = dayjsUtil().toISOString()
            await reconciliationRunRepo().insert({ id: runId, created: now, updated: now, projectId, ruleId: id, status: 'QUEUED', startedAt: null, finishedAt: null, sourceCount: 0, targetCount: 0, matchedCount: 0, differenceCount: 0, repairedCount: 0, error: null })
            const { error } = await tryCatch(() => systemJobsSchedule(log).upsertJob({ job: { name: SystemJobName.RECONCILE, jobId: `recon-run-${runId}`, data: { ruleId: id, projectId, runId } }, schedule: { type: 'one-time', date: dayjsUtil() } }))
            if (error) {
                await reconciliationRunRepo().update({ id: runId, projectId }, { status: 'FAILED', finishedAt: dayjsUtil().toISOString(), error: 'reconciliation.runFailed' })
                throw error
            }
            return { runId }
        } })
    },
    async getRun({ id, projectId }: RuleRef): Promise<ReconciliationRun> {
        const run = await reconciliationRunRepo().findOneBy({ id, projectId })
        if (isNil(run)) {
            throw missing({ id, type: 'ReconciliationRun' })
        }
        return run
    },
    async listDifferences({ id, projectId, status, cursor, limit = 50 }: RuleRef & { status?: ReconciliationDifference['status'], cursor?: string, limit?: number }) {
        await this.getRule({ id, projectId })
        const query = reconciliationDifferenceRepo().createQueryBuilder('difference').where({ ruleId: id, projectId, ...(status ? { status } : {}) }).orderBy('difference.id', 'ASC').take(limit + 1)
        if (cursor) {
            query.andWhere('difference.id > :cursor', { cursor })
        }
        const rows = await query.getMany()
        const more = rows.length > limit
        const data = rows.slice(0, limit)
        return { data, next: more ? data.at(-1)?.id ?? null : null, previous: null }
    },
    async ignore({ ids, projectId, reason = '', actorId = null }: { ids: string[], projectId: string, reason?: string, actorId?: string | null }): Promise<void> {
        const rows = await reconciliationDifferenceRepo().findBy({ id: In(ids), projectId, status: In(['OPEN', 'REPAIRING']) })
        await reconciliationDifferenceRepo().update({ id: In(rows.map((row) => row.id)), projectId }, { status: 'IGNORED' })
        await reconciliationSideEffects(log).recordIgnored({ projectId, ruleIds: [...new Set(rows.map((row) => row.ruleId))], differenceIds: rows.map((row) => row.id), reason, actorId })
    },
    async run({ runId, projectId }: { runId: string, projectId: string }): Promise<void> {
        const run = await this.getRun({ id: runId, projectId })
        if (run.status === 'SUCCEEDED' || run.status === 'TRUNCATED') {
            return
        }
        const { error } = await tryCatch(() => distributedLock(log).runExclusive({
            key: `recon:${projectId}:${run.ruleId}`, timeoutInSeconds: 60,
            fn: async () => {
                const currentRun = await this.getRun({ id: runId, projectId })
                if (currentRun.status === 'SUCCEEDED' || currentRun.status === 'TRUNCATED') return
                const rule = await this.getRule({ id: run.ruleId, projectId })
                await reconciliationRunRepo().update({ id: runId, projectId }, { status: 'RUNNING', startedAt: dayjsUtil().toISOString() })
                const tenantId = await projectService(log).getTenantId(projectId)
                const deadline = Date.now() + system.getNumberOrThrow(AppSystemProp.RECONCILIATION_TIME_BUDGET_MINUTES) * 60_000
                const source = await enumerate({ endpoint: rule.source, projectId, tenantId, log, deadline, deps })
                const target = await enumerate({ endpoint: rule.target, projectId, tenantId, log, deadline, deps })
                const mappingTables = await Promise.all(mappingIds(rule).map((id) => mappingTableService(log).getForWorker({ id, projectId })))
                const observedTargetKeys = new Set(target.items.map((item) => String(fieldAt({ value: item, path: rule.target.keyPath }))))
                const comparableSource = target.truncated ? source.items.filter((item) => observedTargetKeys.has(String(fieldAt({ value: item, path: rule.source.keyPath })))) : source.items
                const diff = reconciliationDiff.compute({ source: comparableSource, target: target.items, rule, mappingTables })
                const truncated = source.truncated || target.truncated
                await persistDifferences({ rule, runId, differences: diff.differences, truncated })
                await reconciliationRepair(log).cleanup({ ruleId: rule.id, projectId, tenantId })
                const open = await reconciliationDifferenceRepo().find({ where: { projectId, ruleId: rule.id, status: In(['OPEN', 'REPAIRING']) } })
                await reconciliationRunRepo().update({ id: runId, projectId }, { sourceCount: source.items.length, targetCount: target.items.length, matchedCount: diff.matched, differenceCount: open.length, error: null })
                await reconciliationSideEffects(log).recordIssue({ rule, openCount: open.length })
                if (!truncated && open.length > 0 && open.length <= rule.maxRepairsPerRun) {
                    const businessKeys = [...new Set(open.filter((item) => item.aspect !== 'duplicate-key').map((item) => item.businessKey))]
                    let repairedCount = 0
                    for (const businessKey of businessKeys) {
                        const item = open.find((candidate) => candidate.businessKey === businessKey)
                        if (item) {
                            const { error: repairError } = await tryCatch(() => reconciliationRepair(log).start({ differenceId: item.id, projectId }))
                            if (!repairError) repairedCount++
                            else log.warn({ error: repairError, ruleId: rule.id }, 'Reconciliation repair failed')
                        }
                    }
                    await reconciliationRunRepo().update({ id: runId, projectId }, { repairedCount })
                }
                await reconciliationRunRepo().update({ id: runId, projectId }, { status: truncated ? 'TRUNCATED' : 'SUCCEEDED', finishedAt: dayjsUtil().toISOString() })
            },
        }))
        if (error) {
            log.error({ projectId, runId, error: { name: error.name, message: error.message } }, 'Reconciliation run failed')
            await reconciliationRunRepo().update({ id: runId, projectId }, { status: 'FAILED', finishedAt: dayjsUtil().toISOString(), error: 'reconciliation.runFailed' })
            throw error
        }
    },
})

async function validateEndpoint({ endpoint, projectId, tenantId, log }: EndpointParams): Promise<void> {
    reconciliationInputs.authReference(endpoint.connectionExternalId)
    const metadata = await connectorMetadataService(log).getOrThrow({ name: endpoint.connectorName, version: undefined, tenantId, projectId })
    if (metadata.actions[endpoint.actionName]?.classification !== 'SEARCH' || !metadata.actions[endpoint.actionName]?.reliability?.enumeration) {
        throw invalid('reconciliation.enumerationRequired')
    }
    const connection = await connectionsRepo().findOneBy({ externalId: endpoint.connectionExternalId, projectIds: ArrayContains([projectId]) })
    if (isNil(connection) || connection.connectorName !== endpoint.connectorName) {
        throw missing({ id: endpoint.connectionExternalId, type: 'Connection' })
    }
}

async function enumerate({ endpoint, projectId, tenantId, deadline, deps }: EndpointParams & { deadline: number, deps: ReconciliationDeps }): Promise<{ items: Record<string, unknown>[], truncated: boolean }> {
    const action = await deps.getAction({ endpoint, tenantId, projectId })
    if (action?.classification !== 'SEARCH' || !action.reliability?.enumeration) throw invalid('reconciliation.enumerationRequired')
    const maxItems = system.getNumberOrThrow(AppSystemProp.RECONCILIATION_MAX_ITEMS)
    const items: Record<string, unknown>[] = []
    const seen = new Set<string>()
    let pageToken: string | null = null
    do {
        if (Date.now() >= deadline || items.length >= maxItems) return { items, truncated: true }
        const page = await deps.runConnectorAction({
            tenantId, projectId, connectorName: endpoint.connectorName, actionName: endpoint.actionName,
            timeoutSeconds: Math.max(1, Math.min(120, Math.ceil((deadline - Date.now()) / 1000))),
            input: { ...endpoint.input, auth: reconciliationInputs.authReference(endpoint.connectionExternalId), pageToken: pageToken ?? undefined, pageSize: Math.min(300, maxItems - items.length) },
        })
        if (page.status !== ActionRunStatus.SUCCEEDED) throw new Error(page.errorMessage ?? 'Enumeration failed')
        if (connectorContract.pageViolationsOf({ action, output: page.output }).length > 0 || !isObject(page.output) || !Array.isArray(page.output['items'])) throw invalid('reconciliation.invalidPage')
        for (const item of page.output['items']) {
            if (!isObject(item)) throw invalid('reconciliation.invalidPage')
            if (items.length >= maxItems) return { items, truncated: true }
            items.push(item)
        }
        const next = page.output['nextPageToken']
        pageToken = typeof next === 'string' ? next : null
        if (pageToken !== null) {
            if (seen.has(pageToken)) throw invalid('reconciliation.repeatedPage')
            seen.add(pageToken)
        }
    } while (pageToken !== null)
    return { items, truncated: false }
}

async function persistDifferences({ rule, runId, differences, truncated }: { rule: ReconciliationRule, runId: string, differences: ComputedDifference[], truncated: boolean }): Promise<void> {
    await databaseConnection().transaction(async (manager) => {
        const repo = manager.getRepository(ReconciliationDifferenceEntity)
        const ignored = await repo.find({ where: { projectId: rule.projectId, ruleId: rule.id, status: 'IGNORED' }, select: ['businessKey', 'aspect'] })
        const ignoredKeys = new Set(ignored.map((item) => JSON.stringify([item.businessKey, item.aspect])))
        const now = dayjsUtil().toISOString()
        const rows: ReconciliationDifference[] = differences.filter((item) => !ignoredKeys.has(JSON.stringify([item.businessKey, item.aspect]))).map((item) => ({
            ...item, expected: sanitizeObjectForPostgresql(item.expected) ?? null, actual: sanitizeObjectForPostgresql(item.actual) ?? null,
            id: generateId(), projectId: rule.projectId, ruleId: rule.id, created: now, updated: now, status: 'OPEN', firstSeenRunId: runId, lastSeenRunId: runId, repairExecutionId: null, resolvedAt: null,
        }))
        for (const batch of chunk(rows, 500)) {
            const columns = ['id', 'projectId', 'ruleId', 'businessKey', 'aspect', 'kind', 'expected', 'actual', 'status', 'firstSeenRunId', 'lastSeenRunId', 'repairExecutionId', 'resolvedAt', 'created', 'updated']
            const values = batch.flatMap((row) => [row.id, row.projectId, row.ruleId, row.businessKey, row.aspect, row.kind, JSON.stringify(row.expected), JSON.stringify(row.actual), row.status, row.firstSeenRunId, row.lastSeenRunId, row.repairExecutionId, row.resolvedAt, row.created, row.updated])
            const tuples = batch.map((_row, index) => `(${columns.map((_column, offset) => `$${index * columns.length + offset + 1}`).join(',')})`)
            await manager.query(`INSERT INTO reconciliation_difference (${columns.map((column) => `"${column}"`).join(',')}) VALUES ${tuples.join(',')} ON CONFLICT ("ruleId", "businessKey", "aspect") WHERE status IN ('OPEN', 'REPAIRING') DO UPDATE SET "expected" = EXCLUDED."expected", "actual" = EXCLUDED."actual", "lastSeenRunId" = EXCLUDED."lastSeenRunId", "kind" = EXCLUDED."kind", "updated" = EXCLUDED."updated"`, values)
        }
        if (!truncated) {
            await repo.update({ projectId: rule.projectId, ruleId: rule.id, status: In(['OPEN', 'REPAIRING']), lastSeenRunId: Not(runId) }, { status: 'RESOLVED', resolvedAt: now })
        }
    })
}

function fieldAt({ value, path }: { value: unknown, path: string }): unknown {
    return path.split('.').reduce<unknown>((current, key) => isObject(current) ? current[key] : undefined, value)
}

function mappingIds(rule: Pick<ReconciliationRule, 'expectations'>): string[] {
    return [...new Set(rule.expectations.flatMap((item) => 'mappingTableId' in item.expect && item.expect.mappingTableId ? [item.expect.mappingTableId] : []))]
}

function missing({ id, type }: { id: string, type: string }): ApplicationError {
    return new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType: type } })
}

function invalid(message: string): ApplicationError {
    return new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
}

type RuleRef = { id: string, projectId: string }
type EndpointParams = { endpoint: ReconciliationEndpoint, projectId: string, tenantId: string, log: FastifyBaseLogger }

function defaultDeps(log: FastifyBaseLogger): ReconciliationDeps {
    return {
        runConnectorAction: (params) => actionRunService(log).runConnectorAction(params),
        getAction: async ({ endpoint, tenantId, projectId }) => {
            const metadata = await connectorMetadataService(log).getOrThrow({ name: endpoint.connectorName, version: undefined, tenantId, projectId })
            return metadata.actions[endpoint.actionName]
        },
    }
}

export type ReconciliationDeps = {
    runConnectorAction: ReturnType<typeof actionRunService>['runConnectorAction']
    getAction: (params: Omit<EndpointParams, 'log'>) => Promise<ActionBase | undefined>
}
