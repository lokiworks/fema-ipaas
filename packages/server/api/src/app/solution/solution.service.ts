import { ApplicationError, ErrorCode, generateId, isNil, Permission, ProjectId, TenantId, UserId } from '@fema-ipaas/core-utils'
import {
    ConnectionStatus,
    CreateSolutionFromProjectRequestBody,
    InstallSolutionRequestBody,
    ListSolutionInstallsRequestQuery,
    ListSolutionsRequestQuery,
    PublishSolutionVersionRequestBody,
    RunSolutionChecksRequestBody,
    Solution,
    SolutionCheck,
    SolutionCheckKind,
    SolutionCheckResult,
    SolutionCheckResults,
    SolutionCheckStatus,
    SolutionDetail,
    SolutionInstall,
    SolutionInstallInput,
    SolutionInstallPreview,
    SolutionInstallResult,
    SolutionMappingTable,
    SolutionPackage,
    SolutionProvider,
    SolutionSummary,
    solutionUtils,
    SolutionVisibility,
    SolutionWorkflow,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { repoFactory } from '../core/db/repo-factory'
import { instanceLimits } from '../limits/instance-limits'
import { mappingTableRepo, mappingTableService } from '../mapping-table/mapping-table.service'
import { projectAccess } from '../project/project-access'
import { projectRepo } from '../project/project-repo'
import { workflowTransferService } from '../project-workspace/workflow-transfer.service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowService } from '../workflows/workflow/workflow.service'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { OFFICIAL_SOLUTIONS, OfficialSolution } from './official-solutions'
import { solutionPackageUtils } from './solution-package-utils'
import {
    SolutionEntity,
    SolutionInstallEntity,
    SolutionInstallSchema,
    SolutionSchema,
    SolutionVersionEntity,
    SolutionVersionSchema,
} from './solution.entity'

const solutionRepo = repoFactory(SolutionEntity)
const solutionVersionRepo = repoFactory(SolutionVersionEntity)
const solutionInstallRepo = repoFactory(SolutionInstallEntity)

export const solutionService = (log: FastifyBaseLogger) => ({
    async list({ tenantId, userId, query }: ListParams): Promise<SolutionSummary[]> {
        const visible = await visibleSolutions({ tenantId, userId, log })
        const installs = await solutionInstallRepo().find({ where: { tenantId } })
        const mine = query.mine === true
        const search = query.search?.trim().toLowerCase() ?? ''
        return visible
            .filter((entry) => !mine || entry.solution.createdBy === userId)
            .filter((entry) => isNil(query.category) || query.category === 'all' || entry.solution.category === query.category)
            .filter((entry) => search.length === 0 || `${entry.solution.name}${entry.solution.summary}`.toLowerCase().includes(search))
            .map((entry) => summaryOf({ entry, installs }))
    },

    async getDetail({ id, tenantId, userId }: SolutionRef): Promise<SolutionDetail> {
        const entry = await findVisibleOrThrow({ id, tenantId, userId, log })
        const installs = await solutionInstallRepo().find({ where: { tenantId, solutionId: id } })
        return { ...summaryOf({ entry, installs }), package: entry.package, versions: entry.versions }
    },

    async createFromProject({ tenantId, userId, request }: CreateFromProjectParams): Promise<SolutionDetail> {
        const built = await buildFromProject({ log, tenantId, projectId: request.projectId, workflowIds: request.workflowIds, manualChecks: request.manualChecks })
        const id = generateId()
        await solutionRepo().insert({
            id,
            tenantId,
            provider: SolutionProvider.TENANT,
            name: request.name,
            summary: request.summary,
            category: request.category,
            visibility: request.visibility,
            sourceProjectId: request.projectId,
            currentVersion: FIRST_VERSION,
            createdBy: userId,
        })
        await solutionVersionRepo().insert({ id: generateId(), solutionId: id, version: FIRST_VERSION, notes: 'First version', package: built, publishedBy: userId })
        log.info({ solution: { id }, project: { id: request.projectId } }, '[solutionService#createFromProject] Solution created')
        return this.getDetail({ id, tenantId, userId })
    },

    async publishVersion({ id, tenantId, userId, request }: PublishVersionParams): Promise<SolutionDetail> {
        const solution = await ownedSolutionOrThrow({ id, tenantId, userId })
        if (isNil(solution.sourceProjectId)) {
            throw validation('The solution has no source project to repackage')
        }
        const current = await latestPackage({ solutionId: id })
        const sourceIds = current.workflows.map((workflow) => workflow.sourceWorkflowId).filter((value): value is string => !isNil(value))
        const manualChecks = current.checks.filter((check) => check.kind === SolutionCheckKind.MANUAL).map(({ label, detail, who }) => ({ label, detail, who }))
        const rebuilt = await buildFromProject({ log, tenantId, projectId: solution.sourceProjectId, workflowIds: sourceIds, manualChecks })
        const version = solutionUtils.nextVersion(solution.currentVersion)
        await solutionVersionRepo().insert({ id: generateId(), solutionId: id, version, notes: request.notes, package: { ...rebuilt, config: current.config }, publishedBy: userId })
        await solutionRepo().update({ id }, { currentVersion: version })
        return this.getDetail({ id, tenantId, userId })
    },

    async installPreview({ id, tenantId, userId, input }: InstallParams): Promise<SolutionInstallPreview> {
        const entry = await findVisibleOrThrow({ id, tenantId, userId, log })
        const project = await projectOrThrow({ projectId: input.projectId, tenantId })
        const current = await workflowRepo().countBy({ projectId: input.projectId })
        const limit = project.workflowsLimit ?? instanceLimits.projectWorkflows()
        const existingTables = await mappingTableRepo().find({ where: { projectId: input.projectId } })
        return {
            workflows: entry.package.workflows.map((workflow) => ({ key: workflow.key, name: workflow.name })),
            mappingTables: entry.package.mappingTables.map((table) => ({
                key: table.key,
                name: table.name,
                reusedTableId: reusableTable({ table, existing: existingTables })?.id ?? null,
            })),
            workflowLimit: limit,
            currentWorkflowCount: current,
            capacityError: solutionUtils.capacityError({ limit, current, needed: entry.package.workflows.length }),
        }
    },

    async runChecks({ id, tenantId, userId, request }: RunChecksParams): Promise<SolutionCheckResults> {
        const entry = await findVisibleOrThrow({ id, tenantId, userId, log })
        await projectOrThrow({ projectId: request.projectId, tenantId })
        const checks = isNil(request.checkKey) ? entry.package.checks : entry.package.checks.filter((check) => check.key === request.checkKey)
        const results = await Promise.all(checks.map((check) => evaluateCheck({ check, projectId: request.projectId, tenantId, connections: request.connections })))
        return { results }
    },

    async install({ id, tenantId, userId, request }: InstallRequestParams): Promise<SolutionInstallResult> {
        const entry = await findVisibleOrThrow({ id, tenantId, userId, log })
        const pkg = entry.package
        await projectOrThrow({ projectId: request.projectId, tenantId })
        const config = resolveConfigOrThrow({ pkg, provided: request.config })
        await assertInstallable({ pkg, request, tenantId })
        const created = await createResources({ log, pkg, projectId: request.projectId, tenantId, userId, connections: request.connections, config })
        const skipped = await skippedChecks({ pkg, request, tenantId })
        const installId = generateId()
        await solutionInstallRepo().insert({
            id: installId,
            tenantId,
            projectId: request.projectId,
            solutionId: id,
            solutionName: entry.solution.name,
            version: entry.solution.currentVersion,
            config,
            connections: request.connections,
            workflowIds: created.workflows.map((workflow) => workflow.workflowId),
            mappingTableIds: created.mappingTables.map((table) => table.tableId),
            skippedChecks: skipped,
            installedBy: userId,
        })
        const install = await installOrThrow({ id: installId, tenantId, latestVersion: entry.solution.currentVersion })
        log.info({ solution: { id }, project: { id: request.projectId }, install: { id: installId } }, '[solutionService#install] Solution installed')
        return { install, workflows: created.workflows, mappingTables: created.mappingTables, skippedChecks: skipped }
    },

    async listInstalls({ tenantId, userId, query }: ListInstallsParams): Promise<SolutionInstall[]> {
        const accessible = await projectAccess(log).projectsWithPermission({ userId, tenantId, permission: Permission.READ_WORKFLOW })
        const accessibleIds = accessible.map((project) => project.id)
        const projectIds = isNil(query.projectId) ? accessibleIds : accessibleIds.filter((projectId) => projectId === query.projectId)
        if (projectIds.length === 0) {
            return []
        }
        const rows = await solutionInstallRepo().find({ where: { tenantId, projectId: In(projectIds) }, order: { created: 'DESC' } })
        const visible = await visibleSolutions({ tenantId, userId, log })
        return rows.map((row) => toInstall({ row, latestVersion: visible.find((entry) => entry.solution.id === row.solutionId)?.solution.currentVersion ?? row.version }))
    },

    async upgrade({ installId, tenantId, userId }: UpgradeParams): Promise<SolutionInstall> {
        const row = await solutionInstallRepo().findOneBy({ id: installId, tenantId })
        if (isNil(row)) {
            throw notFound({ id: installId, entityType: 'SolutionInstall' })
        }
        await assertCanWrite({ projectId: row.projectId, userId, tenantId, log })
        const entry = await findVisibleOrThrow({ id: row.solutionId, tenantId, userId, log })
        if (!solutionUtils.versionNewer({ candidate: entry.solution.currentVersion, current: row.version })) {
            throw validation('The solution is already on the latest version')
        }
        const previous = await packageOf({ solutionId: row.solutionId, version: row.version })
        const upgraded = await applyUpgrade({ log, row, previous, next: entry.package, tenantId, userId })
        await solutionInstallRepo().update({ id: installId }, { version: entry.solution.currentVersion, workflowIds: upgraded.workflowIds, mappingTableIds: upgraded.mappingTableIds })
        return installOrThrow({ id: installId, tenantId, latestVersion: entry.solution.currentVersion })
    },
})

async function applyUpgrade({ log, row, previous, next, tenantId, userId }: ApplyUpgradeParams): Promise<{ workflowIds: string[], mappingTableIds: string[] }> {
    const config = solutionUtils.resolveConfig({ items: next.config, provided: row.config }).values
    const tables = await ensureTables({ log, pkg: next, projectId: row.projectId, userId })
    const tableIdByKey = new Map(tables.map((table) => [table.key, table.tableId]))
    const idByKey = new Map(previous.workflows.map((workflow, index) => [workflow.key, row.workflowIds[index]]))
    const transfer = workflowTransferService(log)
    const outcomes = await next.workflows.reduce<Promise<string[]>>(async (accPromise, workflow) => {
        const acc = await accPromise
        const trigger = solutionPackageUtils.instantiate({ workflow, items: next.config, config, connections: row.connections, tableIdByKey })
        const existingId = idByKey.get(workflow.key)
        if (!isNil(existingId)) {
            await transfer.replaceDraft({ projectId: row.projectId, workflowId: existingId, userId, tenantId, displayName: workflow.name, trigger, schemaVersion: workflow.schemaVersion, notes: workflow.notes })
            return [...acc, existingId]
        }
        const created = await transfer.createFromTrigger({ projectId: row.projectId, userId, tenantId, displayName: workflow.name, description: workflow.description, trigger, schemaVersion: workflow.schemaVersion, notes: workflow.notes })
        return [...acc, created.workflowId]
    }, Promise.resolve([]))
    const keptOld = row.workflowIds.filter((workflowId, index) => !next.workflows.some((workflow) => workflow.key === previous.workflows[index]?.key) && !isNil(workflowId))
    return { workflowIds: [...outcomes, ...keptOld], mappingTableIds: tables.map((table) => table.tableId) }
}

async function buildFromProject({ log, tenantId, projectId, workflowIds, manualChecks }: BuildFromProjectParams): Promise<SolutionPackage> {
    await projectOrThrow({ projectId, tenantId })
    const workflows = await Promise.all(workflowIds.map(async (workflowId): Promise<SolutionWorkflow> => {
        const workflow = await workflowService(log).getOnePopulatedOrThrow({ id: workflowId, projectId })
        if (isNil(workflow.publishedVersionId)) {
            throw validation('Only published workflows can be packaged')
        }
        const version = await workflowVersionService(log).getWorkflowVersionOrThrow({
            workflowId,
            versionId: workflow.publishedVersionId,
            removeConnectionsName: true,
            removeSampleData: true,
            projectId,
        })
        return {
            key: workflowId,
            name: version.displayName,
            description: descriptionOf(workflow.metadata),
            sourceWorkflowId: workflowId,
            trigger: version.trigger,
            schemaVersion: version.schemaVersion ?? null,
            notes: version.notes,
        }
    }))
    const tableRows = await mappingTableRepo().find({ where: { projectId } })
    const tables = tableRows.map((table) => ({
        id: table.id,
        key: table.id,
        name: table.name,
        description: table.description,
        keyLabel: table.keyLabel,
        valueLabel: table.valueLabel,
        missingBehavior: table.missingBehavior,
        defaultValue: table.defaultValue ?? null,
        rows: [],
    }))
    return solutionPackageUtils.buildPackage({ workflows, tables, manualChecks })
}

async function createResources({ log, pkg, projectId, tenantId, userId, connections, config }: CreateResourcesParams): Promise<CreatedResources> {
    const tables = await ensureTables({ log, pkg, projectId, userId })
    const tableIdByKey = new Map(tables.map((table) => [table.key, table.tableId]))
    const transfer = workflowTransferService(log)
    const workflows = await pkg.workflows.reduce<Promise<CreatedResources['workflows']>>(async (accPromise, workflow) => {
        const acc = await accPromise
        const trigger = solutionPackageUtils.instantiate({ workflow, items: pkg.config, config, connections, tableIdByKey })
        const created = await transfer.createFromTrigger({ projectId, userId, tenantId, displayName: workflow.name, description: workflow.description, trigger, schemaVersion: workflow.schemaVersion, notes: workflow.notes })
        return [...acc, { key: workflow.key, workflowId: created.workflowId, displayName: created.displayName }]
    }, Promise.resolve([]))
    return { workflows, mappingTables: tables }
}

async function ensureTables({ log, pkg, projectId, userId }: { log: FastifyBaseLogger, pkg: SolutionPackage, projectId: ProjectId, userId: UserId }): Promise<CreatedResources['mappingTables']> {
    const existing = await mappingTableRepo().find({ where: { projectId } })
    return pkg.mappingTables.reduce<Promise<CreatedResources['mappingTables']>>(async (accPromise, table) => {
        const acc = await accPromise
        const reused = reusableTable({ table, existing })
        if (!isNil(reused)) {
            return [...acc, { key: table.key, tableId: reused.id, name: reused.name, reused: true }]
        }
        const name = uniqueTableName({ base: table.name, taken: [...existing.map((item) => item.name), ...acc.map((item) => item.name)] })
        const created = await mappingTableService(log).create({
            actorId: userId,
            request: {
                projectId,
                name,
                description: table.description.slice(0, MAX_TABLE_DESCRIPTION),
                keyLabel: table.keyLabel,
                valueLabel: table.valueLabel,
                missingBehavior: table.missingBehavior,
                defaultValue: table.defaultValue ?? null,
                rows: table.rows,
            },
        })
        return [...acc, { key: table.key, tableId: created.id, name: created.name, reused: false }]
    }, Promise.resolve([]))
}

function reusableTable({ table, existing }: { table: SolutionMappingTable, existing: { id: string, name: string, keyLabel: string, valueLabel: string }[] }): { id: string, name: string } | null {
    return existing.find((candidate) => candidate.keyLabel === table.keyLabel && candidate.valueLabel === table.valueLabel) ?? null
}

function uniqueTableName({ base, taken }: { base: string, taken: string[] }): string {
    const trimmed = base.slice(0, MAX_TABLE_NAME)
    if (!taken.includes(trimmed)) {
        return trimmed
    }
    return Array.from({ length: MAX_NAME_ATTEMPTS }, (_, index) => `${trimmed.slice(0, MAX_TABLE_NAME - 4)} (${index + 2})`).find((candidate) => !taken.includes(candidate)) ?? trimmed
}

async function evaluateCheck({ check, projectId, tenantId, connections }: EvaluateCheckParams): Promise<SolutionCheckResult> {
    const base = {
        key: check.key,
        label: check.label,
        kind: check.kind,
        blocking: check.blocking,
        detail: check.detail ?? null,
        who: check.who ?? null,
        fixSteps: check.fixSteps,
    }
    if (check.kind === SolutionCheckKind.MANUAL) {
        return { ...base, status: SolutionCheckStatus.NEEDS_CONFIRM, message: null }
    }
    const externalId = isNil(check.connectorName) ? undefined : connections[check.connectorName]
    if (isNil(externalId)) {
        return { ...base, status: SolutionCheckStatus.FAIL, message: 'noConnectionSelected' }
    }
    const connection = await connectionsRepo().findOne({ where: { tenantId, externalId }, select: ['id', 'status', 'scope', 'projectIds', 'preSelectForNewProjects'] })
    if (isNil(connection)) {
        return { ...base, status: SolutionCheckStatus.FAIL, message: 'connectionMissing' }
    }
    const availableHere = connection.scope === 'TENANT' ? connection.preSelectForNewProjects || connection.projectIds.includes(projectId) : connection.projectIds.includes(projectId)
    if (!availableHere) {
        return { ...base, status: SolutionCheckStatus.FAIL, message: 'connectionNotInProject' }
    }
    return connection.status === ConnectionStatus.ACTIVE
        ? { ...base, status: SolutionCheckStatus.PASS, message: null }
        : { ...base, status: SolutionCheckStatus.FAIL, message: 'connectionNotWorking' }
}

async function assertInstallable({ pkg, request, tenantId }: { pkg: SolutionPackage, request: InstallSolutionRequestBody, tenantId: TenantId }): Promise<void> {
    const project = await projectOrThrow({ projectId: request.projectId, tenantId })
    const current = await workflowRepo().countBy({ projectId: request.projectId })
    const error = solutionUtils.capacityError({ limit: project.workflowsLimit ?? instanceLimits.projectWorkflows(), current, needed: pkg.workflows.length })
    if (!isNil(error)) {
        throw validation(error)
    }
    const results = await Promise.all(pkg.checks.map((check) => evaluateCheck({ check, projectId: request.projectId, tenantId, connections: request.connections })))
    const blocking = results.filter((result) => result.blocking && result.status !== SolutionCheckStatus.PASS)
    if (blocking.length > 0) {
        throw validation(`These checks have to pass first: ${blocking.map((result) => result.label).join(', ')}`)
    }
}

async function skippedChecks({ pkg, request, tenantId }: { pkg: SolutionPackage, request: InstallSolutionRequestBody, tenantId: TenantId }): Promise<string[]> {
    const results = await Promise.all(pkg.checks.filter((check) => !check.blocking).map((check) => evaluateCheck({ check, projectId: request.projectId, tenantId, connections: request.connections })))
    return results
        .filter((result) => result.status === SolutionCheckStatus.FAIL || !request.acknowledgedChecks.includes(result.key))
        .map((result) => result.label)
}

function resolveConfigOrThrow({ pkg, provided }: { pkg: SolutionPackage, provided: Record<string, string> }): Record<string, string> {
    const resolved = solutionUtils.resolveConfig({ items: pkg.config, provided })
    if (resolved.errors.length > 0) {
        throw validation(`Invalid configuration: ${resolved.errors.map((error) => `${error.key} (${error.message})`).join(', ')}`)
    }
    return resolved.values
}

async function visibleSolutions({ tenantId, userId, log }: { tenantId: TenantId, userId: UserId, log: FastifyBaseLogger }): Promise<CatalogEntry[]> {
    const official = OFFICIAL_SOLUTIONS.map(officialEntry)
    const rows = await solutionRepo().find({ where: { tenantId }, order: { created: 'DESC' } })
    const accessible = await projectAccess(log).projectsWithPermission({ userId, tenantId, permission: Permission.READ_WORKFLOW })
    const accessibleIds = new Set(accessible.map((project) => project.id))
    const allowed = rows.filter((row) => row.visibility === SolutionVisibility.TENANT || row.createdBy === userId || (!isNil(row.sourceProjectId) && accessibleIds.has(row.sourceProjectId)))
    const versions = allowed.length === 0 ? [] : await solutionVersionRepo().find({ where: { solutionId: In(allowed.map((row) => row.id)) }, order: { created: 'DESC' } })
    const custom = allowed.flatMap((row): CatalogEntry[] => {
        const own = versions.filter((version) => version.solutionId === row.id)
        const latest = own.find((version) => version.version === row.currentVersion)
        return isNil(latest) ? [] : [{ solution: toSolution(row), package: latest.package, versions: own.map(versionSummary) }]
    })
    return [...official, ...custom]
}

async function findVisibleOrThrow({ id, tenantId, userId, log }: { id: string, tenantId: TenantId, userId: UserId, log: FastifyBaseLogger }): Promise<CatalogEntry> {
    const entry = (await visibleSolutions({ tenantId, userId, log })).find((candidate) => candidate.solution.id === id)
    if (isNil(entry)) {
        throw notFound({ id, entityType: 'Solution' })
    }
    return entry
}

async function ownedSolutionOrThrow({ id, tenantId, userId }: SolutionRef): Promise<SolutionSchema> {
    const row = await solutionRepo().findOneBy({ id, tenantId })
    if (isNil(row)) {
        throw notFound({ id, entityType: 'Solution' })
    }
    if (row.createdBy !== userId) {
        throw validation('Only the member who created the solution can publish a new version')
    }
    return row
}

async function latestPackage({ solutionId }: { solutionId: string }): Promise<SolutionPackage> {
    const solution = await solutionRepo().findOneByOrFail({ id: solutionId })
    return packageOf({ solutionId, version: solution.currentVersion })
}

async function packageOf({ solutionId, version }: { solutionId: string, version: string }): Promise<SolutionPackage> {
    const official = OFFICIAL_SOLUTIONS.find((candidate) => candidate.id === solutionId)
    if (!isNil(official)) {
        return official.package
    }
    const row = await solutionVersionRepo().findOneBy({ solutionId, version })
    if (isNil(row)) {
        throw notFound({ id: `${solutionId}@${version}`, entityType: 'SolutionVersion' })
    }
    return row.package
}

async function projectOrThrow({ projectId, tenantId }: { projectId: ProjectId, tenantId: TenantId }): Promise<{ id: string, workflowsLimit?: number | null }> {
    const project = await projectRepo().findOne({ where: { id: projectId, tenantId }, select: ['id', 'workflowsLimit'] })
    if (isNil(project)) {
        throw notFound({ id: projectId, entityType: 'Project' })
    }
    return project
}

async function assertCanWrite({ projectId, userId, tenantId, log }: { projectId: ProjectId, userId: UserId, tenantId: TenantId, log: FastifyBaseLogger }): Promise<void> {
    const writable = await projectAccess(log).projectsWithPermission({ userId, tenantId, permission: Permission.WRITE_WORKFLOW })
    if (!writable.some((project) => project.id === projectId)) {
        throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'You cannot edit workflows in this project' } })
    }
}

async function installOrThrow({ id, tenantId, latestVersion }: { id: string, tenantId: TenantId, latestVersion: string }): Promise<SolutionInstall> {
    const row = await solutionInstallRepo().findOneBy({ id, tenantId })
    if (isNil(row)) {
        throw notFound({ id, entityType: 'SolutionInstall' })
    }
    return toInstall({ row, latestVersion })
}

function toInstall({ row, latestVersion }: { row: SolutionInstallSchema, latestVersion: string }): SolutionInstall {
    return {
        id: row.id,
        created: row.created,
        updated: row.updated,
        tenantId: row.tenantId,
        projectId: row.projectId,
        solutionId: row.solutionId,
        solutionName: row.solutionName,
        version: row.version,
        latestVersion,
        config: row.config,
        connections: row.connections,
        workflowIds: row.workflowIds,
        mappingTableIds: row.mappingTableIds,
        skippedChecks: row.skippedChecks,
        installedBy: row.installedBy,
    }
}

function toSolution(row: SolutionSchema): Solution {
    const { tenant: _tenant, ...solution } = row
    return solution
}

function versionSummary(version: SolutionVersionSchema): { version: string, notes: string, publishedAt: string } {
    return { version: version.version, notes: version.notes, publishedAt: version.created }
}

function officialEntry(official: OfficialSolution): CatalogEntry {
    return {
        solution: {
            id: official.id,
            created: official.publishedAt,
            updated: official.publishedAt,
            tenantId: null,
            provider: SolutionProvider.OFFICIAL,
            name: official.name,
            summary: official.summary,
            category: official.category,
            visibility: SolutionVisibility.TENANT,
            sourceProjectId: null,
            currentVersion: official.version,
            createdBy: null,
        },
        package: official.package,
        versions: [{ version: official.version, notes: official.notes, publishedAt: official.publishedAt }],
    }
}

function summaryOf({ entry, installs }: { entry: CatalogEntry, installs: SolutionInstallSchema[] }): SolutionSummary {
    const own = installs.filter((install) => install.solutionId === entry.solution.id)
    return {
        ...entry.solution,
        workflowCount: entry.package.workflows.length,
        connectorNames: entry.package.connections.map((slot) => slot.connectorName),
        installCount: own.length,
        installedProjectIds: [...new Set(own.map((install) => install.projectId))],
    }
}

function descriptionOf(metadata: unknown): string | undefined {
    if (typeof metadata !== 'object' || metadata === null || !('description' in metadata)) {
        return undefined
    }
    return typeof metadata.description === 'string' && metadata.description.length > 0 ? metadata.description : undefined
}

function validation(message: string): ApplicationError {
    return new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
}

function notFound({ id, entityType }: { id: string, entityType: string }): ApplicationError {
    return new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType } })
}

const FIRST_VERSION = '1.0'
const MAX_TABLE_NAME = 30
const MAX_TABLE_DESCRIPTION = 100
const MAX_NAME_ATTEMPTS = 20

type CatalogEntry = {
    solution: Solution
    package: SolutionPackage
    versions: { version: string, notes: string, publishedAt: string }[]
}

type CreatedResources = {
    workflows: { key: string, workflowId: string, displayName: string }[]
    mappingTables: { key: string, tableId: string, name: string, reused: boolean }[]
}

type SolutionRef = {
    id: string
    tenantId: TenantId
    userId: UserId
}

type ListParams = {
    tenantId: TenantId
    userId: UserId
    query: ListSolutionsRequestQuery
}

type CreateFromProjectParams = {
    tenantId: TenantId
    userId: UserId
    request: CreateSolutionFromProjectRequestBody
}

type PublishVersionParams = SolutionRef & {
    request: PublishSolutionVersionRequestBody
}

type InstallParams = SolutionRef & {
    input: SolutionInstallInput
}

type RunChecksParams = SolutionRef & {
    request: RunSolutionChecksRequestBody
}

type InstallRequestParams = SolutionRef & {
    request: InstallSolutionRequestBody
}

type ListInstallsParams = {
    tenantId: TenantId
    userId: UserId
    query: ListSolutionInstallsRequestQuery
}

type UpgradeParams = {
    installId: string
    tenantId: TenantId
    userId: UserId
}

type ApplyUpgradeParams = {
    log: FastifyBaseLogger
    row: SolutionInstallSchema
    previous: SolutionPackage
    next: SolutionPackage
    tenantId: TenantId
    userId: UserId
}

type BuildFromProjectParams = {
    log: FastifyBaseLogger
    tenantId: TenantId
    projectId: ProjectId
    workflowIds: string[]
    manualChecks: { label: string, detail?: string, who?: string }[]
}

type CreateResourcesParams = {
    log: FastifyBaseLogger
    pkg: SolutionPackage
    projectId: ProjectId
    tenantId: TenantId
    userId: UserId
    connections: Record<string, string>
    config: Record<string, string>
}

type EvaluateCheckParams = {
    check: SolutionCheck
    projectId: ProjectId
    tenantId: TenantId
    connections: Record<string, string>
}
