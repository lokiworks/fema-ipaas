import { ApplicationError, ErrorCode, generateId, isNil } from '@fema-ipaas/core-utils'
import {
    BLUEPRINT_LIMITS,
    blueprintAvailability,
    blueprintChanges,
    blueprintFactory,
    BlueprintPerson,
    blueprintProblems,
    BlueprintProjectOption,
    blueprintRules,
    BlueprintVersionView,
    ConnectorBlueprintDefinition,
    ConnectorBlueprintDetail,
    ConnectorBlueprintListFilter,
    ConnectorBlueprintSummary,
    CreateConnectorBlueprintRequest,
    ImportOpenApiBlueprintRequest,
    OpenApiBlueprintPreview,
    TenantModule,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In, IsNull } from 'typeorm'
import { connectionAccessService } from '../../connection/connection-access.service'
import { connectionsRepo } from '../../connection/connection-service/connection-service'
import { databaseConnection } from '../../database/database-connection'
import { projectRepo } from '../../project/project-service'
import { tenantAccessUtils } from '../../tenant-access/tenant-access.utils'
import { userRepo } from '../../user/user-service'
import { connectorMetadataService, connectorRepos } from '../metadata/connector-metadata-service'
import { openApiBlueprintMapper, OpenApiMappingError } from '../openapi/openapi-blueprint-mapper'
import { BLUEPRINT_SECRET_MASK, blueprintAccess, BlueprintActor, blueprintAuthState, blueprintCommon, blueprintRepo, blueprintTestData, blueprintVersionRepo } from './connector-blueprint-common'
import { connectorBlueprintPackage } from './connector-blueprint-package'
import { ConnectorBlueprintSchema } from './connector-blueprint.entity'

export const connectorBlueprintService = (log: FastifyBaseLogger) => ({
    async list({ actor, filter }: ListParams): Promise<ConnectorBlueprintSummary[]> {
        if (filter === ConnectorBlueprintListFilter.ALL && !actor.isAdmin) {
            throw blueprintCommon.denied('Only tenant administrators can see every connector')
        }
        const blueprints = await blueprintRepo().find({ where: { tenantId: actor.tenantId }, order: { updated: 'DESC' } })
        const visible = blueprints.filter((blueprint) => matchesFilter({ blueprint, actor, filter }))
        const versions = visible.length === 0 ? [] : await blueprintVersionRepo().find({ where: { tenantId: actor.tenantId, blueprintId: In(visible.map((blueprint) => blueprint.id)) } })
        const people = await peopleOf({ tenantId: actor.tenantId, userIds: visible.map((blueprint) => blueprint.ownerId) })
        return visible.map((blueprint) => summaryOf({ blueprint, versions: versions.filter((version) => version.blueprintId === blueprint.id), people }))
    },

    async create({ actor, request }: CreateParams): Promise<ConnectorBlueprintDetail> {
        await assertIdentifierAvailable({ tenantId: actor.tenantId, identifier: request.identifier })
        const definition = isNil(request.presetId)
            ? blueprintFactory.definition({ displayName: request.displayName.trim(), description: request.description.trim(), iconColor: request.iconColor, baseUrl: '' })
            : blueprintFactory.fromPreset({ presetId: request.presetId, displayName: request.displayName.trim(), description: request.description.trim(), iconColor: request.iconColor })
        const created = await insertBlueprint({ actor, identifier: request.identifier, definition })
        return this.detail({ id: created.id, actor })
    },

    previewOpenApi({ document, takenIdentifiers }: PreviewParams): OpenApiBlueprintPreview {
        const mapping = mapOpenApi({ document, takenIdentifiers })
        return {
            title: mapping.title,
            description: mapping.description,
            baseUrl: mapping.baseUrl,
            identifier: mapping.identifier,
            operations: mapping.operations.map((operation) => ({ key: operation.key, name: operation.name, method: operation.method, path: operation.path, inputCount: operation.inputs.length })),
        }
    },

    async takenIdentifiers(tenantId: string): Promise<string[]> {
        const rows = await blueprintRepo().find({ where: { tenantId }, select: { identifier: true } })
        return rows.map((row) => row.identifier)
    },

    async importOpenApi({ actor, request }: ImportParams): Promise<ConnectorBlueprintDetail> {
        await assertIdentifierAvailable({ tenantId: actor.tenantId, identifier: request.identifier })
        const mapping = mapOpenApi({ document: request.document, takenIdentifiers: [] })
        const base = blueprintFactory.definition({ displayName: request.displayName.trim(), description: request.description.trim(), iconColor: request.iconColor, baseUrl: mapping.baseUrl })
        const groups = [...new Set(mapping.operations.map((operation) => operation.group).filter((group) => group.length > 0))]
        const created = await insertBlueprint({ actor, identifier: request.identifier, definition: { ...base, groups, operations: mapping.operations } })
        return this.detail({ id: created.id, actor })
    },

    async detail({ id, actor }: IdParams): Promise<ConnectorBlueprintDetail> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor })
        return detailOf({ blueprint, actor, log })
    },

    async saveDefinition({ id, actor, definition }: SaveParams): Promise<ConnectorBlueprintDetail> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor })
        assertDefinitionShape({ blueprint, definition })
        await blueprintRepo().save({ ...blueprint, definition, updated: dayjs().toISOString() })
        return this.detail({ id, actor })
    },

    async updateCollaborators({ id, actor, collaboratorIds }: CollaboratorsParams): Promise<ConnectorBlueprintDetail> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor, manage: true })
        const next = [...new Set(collaboratorIds.filter((userId) => userId !== blueprint.ownerId))]
        const added = next.filter((userId) => !blueprint.collaboratorIds.includes(userId))
        await blueprintAccess.assertDevelopers({ tenantId: actor.tenantId, userIds: added })
        await blueprintRepo().save({ ...blueprint, collaboratorIds: next })
        return this.detail({ id, actor })
    },

    async transferOwnership({ id, actor, ownerId }: TransferParams): Promise<ConnectorBlueprintDetail> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor, manage: true })
        if (ownerId === blueprint.ownerId) {
            return this.detail({ id, actor })
        }
        await blueprintAccess.assertDevelopers({ tenantId: actor.tenantId, userIds: [ownerId] })
        const collaboratorIds = [...new Set([...blueprint.collaboratorIds.filter((userId) => userId !== ownerId), blueprint.ownerId])]
        await blueprintRepo().save({ ...blueprint, ownerId, collaboratorIds })
        return this.detail({ id, actor })
    },

    async candidates({ id, actor }: IdParams): Promise<BlueprintPerson[]> {
        await blueprintAccess.getOrThrow({ id, actor })
        const users = await userRepo().find({ where: { tenantId: actor.tenantId }, relations: { identity: true } })
        return users
            .filter((user) => tenantAccessUtils.hasModule({ tenantRole: user.tenantRole, storedModules: user.modules ?? [], module: TenantModule.CONNECTOR_DEVELOPMENT }))
            .map((user) => ({ id: user.id, name: blueprintCommon.fullName(user.identity), email: user.identity?.email ?? null }))
    },

    async projects({ id, actor }: IdParams): Promise<BlueprintProjectOption[]> {
        await blueprintAccess.getOrThrow({ id, actor })
        const [projects, memberIds] = await Promise.all([
            projectRepo().find({ where: { tenantId: actor.tenantId, deleted: IsNull() }, select: { id: true, displayName: true }, order: { displayName: 'ASC' } }),
            connectionAccessService(log).memberProjectIds({ userId: actor.userId, tenantId: actor.tenantId }),
        ])
        return projects.map((project) => ({ id: project.id, name: project.displayName, member: memberIds.includes(project.id) }))
    },

    async delete({ id, actor }: IdParams): Promise<void> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor, manage: true })
        const installed = await connectorRepos().findOneBy({ name: blueprint.connectorName, tenantId: actor.tenantId })
        if (!isNil(installed)) {
            await connectorMetadataService(log).delete({ id: installed.id, tenantId: actor.tenantId })
        }
        await blueprintRepo().delete({ id: blueprint.id, tenantId: actor.tenantId })
    },
})

async function detailOf({ blueprint, actor, log }: { blueprint: ConnectorBlueprintSchema, actor: BlueprintActor, log: FastifyBaseLogger }): Promise<ConnectorBlueprintDetail> {
    const versions = await blueprintVersionRepo().find({ where: { tenantId: actor.tenantId, blueprintId: blueprint.id }, order: { publishedAt: 'DESC' } })
    const publisherIds = versions.flatMap((version) => [version.publishedBy, ...version.updates.map((update) => update.publishedBy)])
    const people = await peopleOf({ tenantId: actor.tenantId, userIds: [blueprint.ownerId, ...blueprint.collaboratorIds, ...publisherIds] })
    const usage = await usageOf({ tenantId: actor.tenantId, connectorName: blueprint.connectorName, log })
    const auth = blueprintAuthState.activeAuth(blueprint.definition)
    const revision = blueprint.authState.testRevision
    const authPublished = blueprintAuthState.isPublished({ definition: blueprint.definition, state: blueprint.authState })
    const secretKeys = isNil(blueprint.definition.auth) ? [] : [...blueprintFactory.autoAuthFields(blueprint.definition.auth.type), ...blueprint.definition.auth.fields].filter((field) => field.control === 'PASSWORD').map((field) => field.key)
    const testData = await blueprintTestData.read(blueprint)
    return {
        ...summaryOf({ blueprint, versions, people }),
        definition: blueprint.definition,
        publishedDefinition: blueprint.publishedDefinition,
        collaborators: blueprint.collaboratorIds.map((userId) => people.get(userId) ?? { id: userId, name: '', email: null }),
        canManage: blueprintAccess.canManage({ blueprint, actor }),
        authStatus: {
            published: !isNil(auth) && authPublished,
            everPublished: !isNil(blueprint.authState.publishedAt),
            typeLocked: !isNil(blueprint.authState.publishedType),
            flowTest: blueprintAuthState.validTest({ result: blueprint.authState.flowTest, auth, revision }),
            apiTest: blueprintAuthState.validTest({ result: blueprint.authState.apiTest, auth, revision }),
            testData: Object.fromEntries(Object.entries(testData.values).map(([key, value]) => [key, secretKeys.includes(key) && value.length > 0 ? BLUEPRINT_SECRET_MASK : value])),
            secretKeys,
            hasAuthorizationToken: !isNil(testData.oauth),
        },
        versions: versions.map((version): BlueprintVersionView => ({
            id: version.id,
            version: version.version,
            packageVersion: version.packageVersion,
            status: version.status,
            canaryProjectIds: version.canaryProjectIds,
            description: version.description,
            publishedBy: people.get(version.publishedBy) ?? null,
            publishedAt: version.publishedAt,
            updates: version.updates.map((update) => ({ ...update, publishedByName: people.get(update.publishedBy)?.name ?? null })),
            operationKeys: version.definition.operations.map((operation) => operation.key),
            triggerKeys: version.definition.triggers.map((trigger) => trigger.key),
            usage: usage.byVersion.get(version.version) ?? 0,
        })),
        changes: blueprintChanges.compute({ baseline: blueprint.publishedDefinition, draft: blueprint.definition }),
        issues: blueprintProblems.publish({ definition: blueprint.definition, authPublished }),
        debugRecords: blueprint.debugRecords,
        usage: { workflows: usage.workflows, connections: usage.connections },
    }
}

function summaryOf({ blueprint, versions, people }: SummaryParams): ConnectorBlueprintSummary {
    const { state, currentVersion } = blueprintAvailability.connectorState(versions.map((version) => ({ version: version.version, status: version.status, canaryProjectIds: version.canaryProjectIds })))
    return {
        id: blueprint.id,
        identifier: blueprint.identifier,
        connectorName: blueprint.connectorName,
        displayName: blueprint.definition.displayName,
        description: blueprint.definition.description,
        iconColor: blueprint.definition.iconColor,
        logoUrl: connectorBlueprintPackage.logoUrl({ displayName: blueprint.definition.displayName, iconColor: blueprint.definition.iconColor }),
        owner: people.get(blueprint.ownerId) ?? null,
        collaboratorIds: blueprint.collaboratorIds,
        state,
        currentVersion,
        pendingChanges: versions.length === 0 ? 0 : blueprintChanges.compute({ baseline: blueprint.publishedDefinition, draft: blueprint.definition }).length,
        operationCount: blueprint.definition.operations.length,
        triggerCount: blueprint.definition.triggers.length,
        created: blueprint.created,
        updated: blueprint.updated,
    }
}

function matchesFilter({ blueprint, actor, filter }: { blueprint: ConnectorBlueprintSchema, actor: BlueprintActor, filter: ConnectorBlueprintListFilter | undefined }): boolean {
    switch (filter) {
        case ConnectorBlueprintListFilter.MINE:
            return blueprint.ownerId === actor.userId
        case ConnectorBlueprintListFilter.COLLABORATING:
            return blueprint.ownerId !== actor.userId && blueprint.collaboratorIds.includes(actor.userId)
        case ConnectorBlueprintListFilter.ALL:
            return actor.isAdmin
        case undefined:
            return blueprintAccess.canView({ blueprint, actor })
    }
}

async function insertBlueprint({ actor, identifier, definition }: InsertParams): Promise<ConnectorBlueprintSchema> {
    const now = dayjs().toISOString()
    const created: ConnectorBlueprintSchema = {
        id: generateId(),
        created: now,
        updated: now,
        tenantId: actor.tenantId,
        identifier,
        connectorName: blueprintRules.connectorNameOf(identifier),
        ownerId: actor.userId,
        collaboratorIds: [],
        definition,
        publishedDefinition: null,
        authState: blueprintAuthState.empty(),
        authTestData: null,
        debugRecords: [],
        draftBuild: null,
    }
    await blueprintRepo().save(created)
    return created
}

async function assertIdentifierAvailable({ tenantId, identifier }: { tenantId: string, identifier: string }): Promise<void> {
    if (!blueprintRules.isValidIdentifier(identifier)) {
        throw blueprintCommon.validation('The identifier must start with a lowercase letter, use only lowercase letters, digits and underscores, and be at most 40 characters')
    }
    const existing = await blueprintRepo().findOneBy({ tenantId, identifier })
    const installed = await connectorRepos().findOneBy({ tenantId, name: blueprintRules.connectorNameOf(identifier) })
    if (!isNil(existing) || !isNil(installed)) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: `The identifier ${identifier} is already used by another connector` } })
    }
}

function assertDefinitionShape({ blueprint, definition }: { blueprint: ConnectorBlueprintSchema, definition: ConnectorBlueprintDefinition }): void {
    const name = definition.displayName.trim()
    if (name.length === 0 || name.length > BLUEPRINT_LIMITS.name) {
        throw blueprintCommon.validation('The connector name is required and must be at most 30 characters')
    }
    if (definition.description.length > BLUEPRINT_LIMITS.description) {
        throw blueprintCommon.validation('The connector description must be at most 200 characters')
    }
    const operationKeys = definition.operations.map((operation) => operation.key)
    const triggerKeys = definition.triggers.map((trigger) => trigger.key)
    if ([...operationKeys, ...triggerKeys].some((key) => !blueprintRules.isValidKey(key)) || new Set(operationKeys).size !== operationKeys.length || new Set(triggerKeys).size !== triggerKeys.length) {
        throw blueprintCommon.validation('Operation and trigger identifiers must be unique, start with a lowercase letter and use only lowercase letters, digits and underscores')
    }
    const inputKeys = [...definition.operations.map((operation) => operation.inputs), ...definition.triggers.map((trigger) => trigger.inputs)]
    if (inputKeys.some((inputs) => inputs.some((input) => input.key.startsWith('__') || input.key === 'auth'))) {
        throw blueprintCommon.validation('Input identifiers cannot start with two underscores or be named auth')
    }
    const lockedType = blueprint.authState.publishedType
    if (!isNil(lockedType) && (isNil(definition.auth) || definition.auth.type !== lockedType)) {
        throw blueprintCommon.validation('The authentication was published, so its type cannot change and it cannot be deleted. Turn it off instead.')
    }
}

function mapOpenApi({ document, takenIdentifiers }: { document: string, takenIdentifiers: string[] }): ReturnType<typeof openApiBlueprintMapper.map> {
    try {
        return openApiBlueprintMapper.map({ document: JSON.parse(document), takenIdentifiers })
    }
    catch (error) {
        const message = error instanceof OpenApiMappingError ? error.message : 'The OpenAPI document must be valid JSON. Convert YAML to JSON before importing.'
        throw blueprintCommon.validation(message)
    }
}

async function peopleOf({ tenantId, userIds }: { tenantId: string, userIds: string[] }): Promise<Map<string, BlueprintPerson>> {
    const ids = [...new Set(userIds)]
    if (ids.length === 0) {
        return new Map()
    }
    const users = await userRepo().find({ where: { id: In(ids), tenantId }, relations: { identity: true } })
    return new Map(users.map((user) => [user.id, { id: user.id, name: blueprintCommon.fullName(user.identity), email: user.identity?.email ?? null }]))
}

async function usageOf({ tenantId, connectorName, log }: { tenantId: string, connectorName: string, log: FastifyBaseLogger }): Promise<BlueprintUsage> {
    const [rows, connections] = await Promise.all([
        databaseConnection().query(VERSION_USAGE_SQL, [tenantId, connectorName]),
        connectionsRepo().countBy({ tenantId, connectorName }),
    ])
    const parsed = Array.isArray(rows) ? rows.filter(isUsageRow) : []
    const byVersion = parsed.reduce((acc, row) => {
        const display = row.packageVersion.split('.').slice(0, 2).join('.')
        return new Map(acc).set(display, (acc.get(display) ?? 0) + Number(row.workflowCount))
    }, new Map<string, number>())
    const workflows = parsed.reduce((sum, row) => sum + Number(row.workflowCount), 0)
    log.debug({ connector: { name: connectorName }, workflowCount: workflows }, '[connectorBlueprintService#usage] computed usage')
    return { byVersion, workflows, connections }
}

function isUsageRow(row: unknown): row is { packageVersion: string, workflowCount: string } {
    return typeof row === 'object' && row !== null && 'packageVersion' in row && 'workflowCount' in row && typeof row.packageVersion === 'string'
}

const VERSION_USAGE_SQL = `SELECT versions.version AS "packageVersion", COUNT(DISTINCT w."id") AS "workflowCount"
FROM "workflow" w
JOIN "project" p ON p."id" = w."projectId" AND p."tenantId" = $1 AND p."deleted" IS NULL
JOIN LATERAL (
    SELECT v."trigger" FROM "workflow_version" v WHERE v."workflowId" = w."id" ORDER BY v."created" DESC LIMIT 1
) latest ON true
CROSS JOIN LATERAL (
    SELECT DISTINCT value #>> '{}' AS version
    FROM jsonb_path_query(latest."trigger", 'lax $.** ? (@.connectorName == $name).connectorVersion', jsonb_build_object('name', $2::text)) AS value
) versions
WHERE versions.version IS NOT NULL
GROUP BY versions.version`

type ListParams = {
    actor: BlueprintActor
    filter: ConnectorBlueprintListFilter | undefined
}

type CreateParams = {
    actor: BlueprintActor
    request: CreateConnectorBlueprintRequest
}

type ImportParams = {
    actor: BlueprintActor
    request: ImportOpenApiBlueprintRequest
}

type PreviewParams = {
    document: string
    takenIdentifiers: string[]
}

type IdParams = {
    id: string
    actor: BlueprintActor
}

type SaveParams = IdParams & {
    definition: ConnectorBlueprintDefinition
}

type CollaboratorsParams = IdParams & {
    collaboratorIds: string[]
}

type TransferParams = IdParams & {
    ownerId: string
}

type InsertParams = {
    actor: BlueprintActor
    identifier: string
    definition: ConnectorBlueprintDefinition
}

type SummaryParams = {
    blueprint: ConnectorBlueprintSchema
    versions: { version: string, status: ConnectorBlueprintDetail['versions'][number]['status'], canaryProjectIds: string[] }[]
    people: Map<string, BlueprintPerson>
}

type BlueprintUsage = {
    byVersion: Map<string, number>
    workflows: number
    connections: number
}

