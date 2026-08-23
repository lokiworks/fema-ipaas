import { ConnectorMetadata, ConnectorMetadataModel, ConnectorMetadataModelSummary, ConnectorPackageInformation, connectorTranslation } from '@fema-ipaas/connector-sdk'
import { apId, ApplicationError, assertNotNullOrUndefined, ErrorCode, isNil, LocalesEnum, TenantId } from '@fema-ipaas/core-utils'
import { apVersionUtil } from '@fema-ipaas/server-utils'
import { ConnectorAudienceFilter, ConnectorCategory, ConnectorOrderBy, ConnectorPackage, ConnectorSortBy, ConnectorType, EXACT_VERSION_REGEX, PackageType, PrivateConnectorPackage, PublicConnectorPackage, SuggestionType, workflowConnectorUtil } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import semVer from 'semver'
import { EntityManager, In, IsNull } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { workflowVersionRepo } from '../../workflows/workflow-version/workflow-version.service'
import { workspaceService } from '../../workspace/workspace-service'
import { resolveVisibility } from '../connector-visibility'
import { connectorCache, ConnectorRegistryEntry } from './connector-cache'
import { ConnectorMetadataEntity, ConnectorMetadataSchema } from './connector-metadata-entity'
import { connectorListUtils, filterActionsByAudience, filterConnectorBasedOnType, isNewerVersion, isSupportedRelease, lastVersionOfEachConnector, loadDevConnectorsIfEnabled } from './utils'

export const connectorRepos = repoFactory(ConnectorMetadataEntity)

export const connectorMetadataService = (log: FastifyBaseLogger) => {
    return {
        async setup(): Promise<void> {
            await connectorCache(log).setup()
        },
        async list(params: ListParams): Promise<ConnectorMetadataModelSummary[]> {
            const locale = params.locale ?? LocalesEnum.ENGLISH
            const translatedConnectors = await dedupe(`list:${params.tenantId ?? ''}:${locale}`, () => fetchLatestConnectors({
                tenantId: params.tenantId,
                locale,
                log,
            }))
            const policy = await resolveVisibility({ tenantId: params.tenantId, workspaceId: params.workspaceId, log })
            const audience = params.audience ?? ConnectorAudienceFilter.HUMAN
            const audienceConnectors = translatedConnectors.map((connector) => ({ ...connector, actions: filterActionsByAudience(connector.actions, audience) }))
            const sortedConnectors = await connectorListUtils(log).sortAndSearchConnectors({
                ...params,
                connectors: audienceConnectors,
                suggestionType: params.suggestionType,
            })
            const visibleConnectors = params.includeHidden ? sortedConnectors : sortedConnectors.filter((connector) => !connector.deprecated)
            const filteredConnectors = params.includeHidden || isNil(policy) ? visibleConnectors : policy.filterConnectors(visibleConnectors)

            const summaries = toConnectorMetadataModelSummary(filteredConnectors, audienceConnectors, params.suggestionType)
            return params.includeHidden || isNil(policy) ? summaries : policy.filterComponents(summaries)
        },
        async registry(params: RegistryParams): Promise<ConnectorPackageInformation[]> {
            const registry = filterRegistry(await loadRegistry(log), {
                release: params.release,
                tenantId: params.tenantId,
            })
            return registry.map((connector) => ({
                name: connector.name,
                version: connector.version,
            }))
        },
        async get({ workspaceId, tenantId, version, name }: GetOrThrowParams): Promise<ConnectorMetadataModel | undefined> {
            const bestMatch = await findExactVersion(log, { name, version, tenantId })
            if (isNil(bestMatch)) {
                return undefined
            }
            const connector = await dedupe(`connector:${bestMatch.name}:${bestMatch.version}:${bestMatch.tenantId ?? ''}`, () => fetchConnectorVersion({
                connectorName: bestMatch.name,
                version: bestMatch.version,
                tenantId: bestMatch.tenantId,
                log,
            }))

            if (isNil(connector)) {
                return undefined
            }

            const policy = await resolveVisibility({ tenantId, workspaceId, log })
            if (isNil(policy)) {
                return connector
            }
            if (!policy.isConnectorVisible(connector.name)) {
                return undefined
            }
            return policy.filterConnectorComponents(connector)
        },
        async getOrThrow({ version, name, tenantId, locale }: GetOrThrowParams): Promise<ConnectorMetadataModel> {
            const connector = await this.get({ version, name, tenantId })
            if (isNil(connector)) {
                throw new ApplicationError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: {
                        message: `connector_metadata_not_found connectorName=${name}`,
                    },
                })
            }
            if (isNil(locale) || locale === LocalesEnum.ENGLISH) {
                return connector
            }
            return connectorTranslation.translateConnector<ConnectorMetadataModel>({ connector, locale, mutate: false })
        },
        async updateUsage({ id, usage }: UpdateUsage): Promise<void> {
            const existingMetadata = await connectorRepos().findOneByOrFail({
                id,
            })
            await connectorRepos().update(id, {
                workspaceUsage: usage,
                updated: existingMetadata.updated,
                created: existingMetadata.created,
            })
        },
        async resolveExactVersion({ name, version, tenantId }: GetExactConnectorVersionParams): Promise<string> {
            const isExactVersion = EXACT_VERSION_REGEX.test(version)

            if (isExactVersion) {
                return version
            }

            const connectorMetadata = await this.getOrThrow({
                name,
                version,
                tenantId,
            })

            return connectorMetadata.version
        },
        async create({
            connectorMetadata,
            tenantId,
            packageType,
            connectorType,
            archiveId,
            publishCacheRefresh = true,
        }: CreateParams): Promise<ConnectorMetadataSchema> {
            const existingMetadata = await connectorRepos().findOneBy({
                name: connectorMetadata.name,
                version: connectorMetadata.version,
                tenantId: tenantId ?? IsNull(),
            })
            if (!isNil(existingMetadata)) {
                throw new ApplicationError({
                    code: ErrorCode.VALIDATION,
                    params: {
                        message: `connector_metadata_already_exists name=${connectorMetadata.name} version=${connectorMetadata.version}`,
                    },
                })
            }
            const createdDate = await findOldestCreatedDate({
                name: connectorMetadata.name,
                tenantId,
            })
            const savedConnector = await connectorRepos().save({
                id: apId(),
                packageType,
                connectorType,
                archiveId,
                tenantId,
                created: createdDate,
                ...connectorMetadata,
            })
            if (publishCacheRefresh) {
                await connectorCache(log).invalidate()
            }
            return savedConnector
        },

        async bulkDelete(connectors: { name: string, version: string }[]): Promise<void> {
            await Promise.all(connectors.map((connector) =>
                connectorRepos().delete({ name: connector.name, version: connector.version }),
            ))
            await connectorCache(log).invalidate()
        },

        async delete({ id, tenantId }: DeleteParams): Promise<void> {
            const connector = await connectorRepos().findOneBy({ id })
            if (isNil(connector) || connector.tenantId !== tenantId) {
                throw new ApplicationError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: { entityType: 'connector', entityId: id },
                })
            }
            if (connector.connectorType !== ConnectorType.CUSTOM) {
                throw new ApplicationError({
                    code: ErrorCode.AUTHORIZATION,
                    params: { message: 'Only custom connectors can be deleted' },
                })
            }
            const workflowsUsingConnector = await findWorkflowsUsingConnector({ connectorName: connector.name, tenantId, log })
            if (workflowsUsingConnector.length > 0) {
                throw new ApplicationError({
                    code: ErrorCode.VALIDATION,
                    params: { message: buildConnectorInUseMessage(workflowsUsingConnector) },
                })
            }
            await connectorRepos().delete({ name: connector.name, tenantId, connectorType: ConnectorType.CUSTOM })
            await connectorCache(log).invalidate()
        },
    }
}

async function findWorkflowsUsingConnector({ connectorName, tenantId, log }: FindWorkflowsUsingConnectorParams): Promise<string[]> {
    const workspaceIds = await workspaceService(log).getWorkspaceIdsByTenant(tenantId)
    if (workspaceIds.length === 0) {
        return []
    }
    const latestVersionSubquery = workflowVersionRepo()
        .createQueryBuilder('fv_latest')
        .select('fv_latest.id')
        .where('fv_latest."workflowId" = workflow.id')
        .orderBy('fv_latest.created', 'DESC')
        .limit(1)

    const candidates = await workflowVersionRepo().createQueryBuilder('workflow_version')
        .innerJoin('workflow_version.workflow', 'workflow')
        .where('workflow."workspaceId" IN (:...workspaceIds)', { workspaceIds })
        .andWhere('workflow_version.trigger::text LIKE :needle', { needle: `%"${connectorName}"%` })
        .andWhere(`(workflow_version.id = workflow."publishedVersionId" OR workflow_version.id = (${latestVersionSubquery.getQuery()}))`)
        .getMany()

    const workflowNamesById = new Map<string, string>()
    for (const workflowVersion of candidates) {
        if (!workflowNamesById.has(workflowVersion.workflowId) && workflowConnectorUtil.getUsedConnectors(workflowVersion.trigger).includes(connectorName)) {
            workflowNamesById.set(workflowVersion.workflowId, workflowVersion.displayName)
        }
    }
    return [...workflowNamesById.values()]
}

function buildConnectorInUseMessage(workflowNames: string[]): string {
    const previewLimit = 3
    const preview = workflowNames.slice(0, previewLimit).map((name) => `"${name}"`).join(', ')
    const remaining = workflowNames.length - previewLimit
    const workflowList = remaining > 0 ? `${preview} and ${remaining} more` : preview
    if (workflowNames.length === 1) {
        return `Cannot delete this connector because it is still used by the workflow ${workflowList}. Remove the connector from that workflow first.`
    }
    return `Cannot delete this connector because it is still used by ${workflowNames.length} workflows: ${workflowList}. Remove the connector from those workflows first.`
}

export const getConnectorPackageWithoutArchive = async (
    log: FastifyBaseLogger,
    tenantId: TenantId | undefined,
    pkg: Omit<PublicConnectorPackage, 'directoryPath' | 'connectorType' | 'packageType'> | Omit<PrivateConnectorPackage, 'archiveId' | 'archive' | 'connectorType' | 'packageType'>,
): Promise<ConnectorPackage> => {
    const connectorMetadata = await connectorMetadataService(log).getOrThrow({
        name: pkg.connectorName,
        version: pkg.connectorVersion,
        tenantId,
    })
    switch (connectorMetadata.packageType) {
        case PackageType.ARCHIVE:
            assertNotNullOrUndefined(connectorMetadata.tenantId, 'tenantId is required')
            return {
                connectorName: connectorMetadata.name,
                connectorVersion: connectorMetadata.version,
                connectorType: connectorMetadata.connectorType,
                packageType: connectorMetadata.packageType,
                archiveId: connectorMetadata.archiveId!,
                tenantId: connectorMetadata.tenantId,
            }
        case PackageType.REGISTRY: {
            const connectorTenantId = connectorMetadata.tenantId
            if (connectorMetadata.connectorType === ConnectorType.CUSTOM) {
                assertNotNullOrUndefined(connectorTenantId, 'tenantId is required')
                return {
                    connectorName: connectorMetadata.name,
                    connectorVersion: connectorMetadata.version,
                    packageType: connectorMetadata.packageType,
                    connectorType: connectorMetadata.connectorType,
                    tenantId: connectorTenantId,
                }
            }
            return {
                connectorName: connectorMetadata.name,
                connectorVersion: connectorMetadata.version,
                packageType: connectorMetadata.packageType,
                connectorType: connectorMetadata.connectorType,
            }
        }
        default: {
            throw new Error(`Unhandled packageType: ${(connectorMetadata as { packageType: string }).packageType}`)
        }
    }
}

export function toConnectorMetadataModelSummary<T extends ConnectorMetadataSchema | ConnectorMetadataModel>(
    connectorMetadataEntityList: T[],
    originalMetadataList: T[],
    suggestionType?: SuggestionType,
): ConnectorMetadataModelSummary[] {
    return connectorMetadataEntityList.map((connectorMetadataEntity) => {
        const originalMetadata = originalMetadataList.find((p) => p.name === connectorMetadataEntity.name)
        assertNotNullOrUndefined(originalMetadata, `Original metadata not found for ${connectorMetadataEntity.name}`)
        return {
            ...connectorMetadataEntity,
            actions: Object.keys(originalMetadata.actions).length,
            triggers: Object.keys(originalMetadata.triggers).length,
            suggestedActions: suggestionType === SuggestionType.ACTION || suggestionType === SuggestionType.ACTION_AND_TRIGGER ?
                Object.values(connectorMetadataEntity.actions) : undefined,
            suggestedTriggers: suggestionType === SuggestionType.TRIGGER || suggestionType === SuggestionType.ACTION_AND_TRIGGER ?
                Object.values(connectorMetadataEntity.triggers) : undefined,
        }
    })
}

const findOldestCreatedDate = async ({ name, tenantId }: { name: string, tenantId?: string }): Promise<string> => {
    const connector = await connectorRepos().findOne({
        where: {
            name,
            tenantId: tenantId ?? IsNull(),
        },
        order: {
            created: 'ASC',
        },
    })
    return connector?.created ?? dayjs().toISOString()
}

const sortByVersionDescending = <T extends { version: string }>(a: T, b: T): number => {
    const aValid = semVer.valid(a.version)
    const bValid = semVer.valid(b.version)
    if (!aValid && !bValid) {
        return b.version.localeCompare(a.version)
    }
    if (!aValid) {
        return 1
    }
    if (!bValid) {
        return -1
    }
    return semVer.rcompare(a.version, b.version)
}

const findExactVersion = async (
    log: FastifyBaseLogger,
    params: { name: string, version: string | undefined, tenantId: string | undefined },
): Promise<{ name: string, version: string, tenantId: string | undefined } | undefined> => {
    const { name, version, tenantId } = params
    const versionToSearch = findNextExcludedVersion(version)
    const currentRelease = apVersionUtil.getCurrentRelease()
    const registry = filterRegistry(await loadRegistry(log), { release: currentRelease, tenantId })
    const matchingRegistryEntries = registry.filter((entry) => {
        if (entry.name !== name) {
            return false
        }
        if (isNil(versionToSearch)) {
            return true
        }
        return semVer.compare(entry.version, versionToSearch.nextExcludedVersion) < 0
            && semVer.compare(entry.version, versionToSearch.baseVersion) >= 0
    })

    if (matchingRegistryEntries.length === 0) {
        return undefined
    }

    const sortedEntries = matchingRegistryEntries.sort(sortByVersionDescending)
    return {
        name: sortedEntries[0].name,
        version: sortedEntries[0].version,
        tenantId: sortedEntries[0].tenantId,
    }
}

const findNextExcludedVersion = (version: string | undefined): { baseVersion: string, nextExcludedVersion: string } | undefined => {
    if (version?.startsWith('^')) {
        const baseVersion = version.substring(1)
        return {
            baseVersion,
            nextExcludedVersion: increaseMajorVersion(baseVersion),
        }
    }
    if (version?.startsWith('~')) {
        const baseVersion = version.substring(1)
        return {
            baseVersion,
            nextExcludedVersion: increaseMinorVersion(baseVersion),
        }
    }
    if (isNil(version)) {
        return undefined
    }
    return {
        baseVersion: version,
        nextExcludedVersion: increasePatchVersion(version),
    }
}

const increasePatchVersion = (version: string): string => {
    const incrementedVersion = semVer.inc(version, 'patch')
    if (isNil(incrementedVersion)) {
        throw new Error(`Failed to increase patch version ${version}`)
    }
    return incrementedVersion
}

const increaseMinorVersion = (version: string): string => {
    const incrementedVersion = semVer.inc(version, 'minor')
    if (isNil(incrementedVersion)) {
        throw new Error(`Failed to increase minor version ${version}`)
    }
    return incrementedVersion
}

const increaseMajorVersion = (version: string): string => {
    const incrementedVersion = semVer.inc(version, 'major')
    if (isNil(incrementedVersion)) {
        throw new Error(`Failed to increase major version ${version}`)
    }
    return incrementedVersion
}

async function fetchLatestConnectors({ tenantId, locale = LocalesEnum.ENGLISH, log }: FetchLatestConnectorsParams): Promise<ConnectorMetadataSchema[]> {
    const currentRelease = apVersionUtil.getCurrentRelease()

    const latestConnectors = await dedupe(`latest-connectors:${currentRelease}`, () => fetchLatestCompatibleConnectorsFromDB(currentRelease))
    const translatedConnectors = translateConnectors(latestConnectors, locale)

    const devConnectors = await loadDevConnectorsIfEnabled(log)
    const translatedDevConnectors = devConnectors.map((connector) =>
        connectorTranslation.translateConnector<ConnectorMetadataSchema>({ connector, locale, mutate: true }),
    )

    const devConnectorNames = new Set(translatedDevConnectors.map((p) => p.name))
    const merged = [...translatedConnectors.filter((p) => !devConnectorNames.has(p.name)), ...translatedDevConnectors]
        .filter((connector) => filterConnectorBasedOnType(tenantId, connector))
        .filter((connector) => isSupportedRelease(currentRelease, connector))
    return lastVersionOfEachConnector(merged)
}

async function fetchConnectorVersion({ connectorName, version, tenantId, log }: FetchConnectorVersionParams): Promise<ConnectorMetadataSchema | null> {
    const devConnectors = await loadDevConnectorsIfEnabled(log)
    const devConnector = devConnectors.find((p) => p.name === connectorName && p.version === version)
    if (!isNil(devConnector)) {
        return devConnector
    }

    const foundConnector = await connectorRepos().findOne({
        where: {
            name: connectorName,
            version,
            tenantId: tenantId ?? IsNull(),
        },
    })
    return foundConnector ?? null
}

export async function fetchLatestCompatibleConnectorsFromDB(currentRelease: string): Promise<ConnectorMetadataSchema[]> {
    const allKeys = await connectorRepos()
        .createQueryBuilder('pm')
        .select(['pm."id"', 'pm."name"', 'pm."version"', 'pm."tenantId"', 'pm."minimumSupportedRelease"', 'pm."maximumSupportedRelease"'])
        .getRawMany<ConnectorKey>()

    const compatibleKeys = allKeys.filter((connector) => isSupportedRelease(currentRelease, connector))
    const latestIds = pickLatestVersionIds(compatibleKeys)
    return latestIds.length > 0 ? connectorRepos().find({ where: { id: In(latestIds) } }) : []
}

function pickLatestVersionIds(connectors: ConnectorKey[]): string[] {
    const latest = new Map<string, ConnectorKey>()
    for (const connector of connectors) {
        const key = `${connector.name}:${connector.tenantId ?? ''}`
        const existing = latest.get(key)
        if (isNil(existing) || isNewerVersion(connector.version, existing.version)) {
            latest.set(key, connector)
        }
    }
    return Array.from(latest.values()).map((p) => p.id)
}

function translateConnectors(connectors: ConnectorMetadataSchema[], locale: LocalesEnum): ConnectorMetadataSchema[] {
    return connectors.map((connector) => {
        const translated = locale === LocalesEnum.ENGLISH
            ? { ...connector }
            : connectorTranslation.translateConnector<ConnectorMetadataSchema>({ connector, locale, mutate: false })
        translated.i18n = undefined
        return translated
    })
}

const inflightFetches = new Map<string, Promise<unknown>>()

function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inflightFetches.get(key) as Promise<T> | undefined
    if (!isNil(existing)) {
        return existing
    }
    const promise = (async () => {
        try {
            return await fn()
        }
        finally {
            inflightFetches.delete(key)
        }
    })()
    inflightFetches.set(key, promise)
    return promise
}

function loadRegistry(log: FastifyBaseLogger): Promise<ConnectorRegistryEntry[]> {
    return dedupe('registry-load', () => connectorCache(log).loadRegistry())
}

function filterRegistry(registry: ConnectorRegistryEntry[], params: { release: string | undefined, tenantId: string | undefined }): ConnectorRegistryEntry[] {
    return registry
        .filter((connector) => filterConnectorBasedOnType(params.tenantId, connector))
        .filter((connector) => isNil(params.release) || isSupportedRelease(params.release, connector))
}



type ListParams = {
    workspaceId?: string
    tenantId?: string
    includeHidden: boolean
    categories?: ConnectorCategory[]
    sortBy?: ConnectorSortBy
    orderBy?: ConnectorOrderBy
    searchQuery?: string
    suggestionType?: SuggestionType
    locale?: LocalesEnum
    audience?: ConnectorAudienceFilter
}

type GetOrThrowParams = {
    name: string
    version?: string
    entityManager?: EntityManager
    workspaceId?: string
    tenantId?: string
    locale?: LocalesEnum
}

type DeleteParams = {
    id: string
    tenantId: string
}

type FindWorkflowsUsingConnectorParams = {
    connectorName: string
    tenantId: string
    log: FastifyBaseLogger
}

type CreateParams = {
    connectorMetadata: ConnectorMetadata
    tenantId?: string
    workspaceId?: string
    packageType: PackageType
    connectorType: ConnectorType
    archiveId?: string
    publishCacheRefresh?: boolean
}

type UpdateUsage = {
    id: string
    usage: number
}

type GetExactConnectorVersionParams = {
    name: string
    version: string
    tenantId: TenantId
}

type RegistryParams = {
    release: string
    tenantId?: string
}

type FetchLatestConnectorsParams = {
    tenantId?: string
    locale?: LocalesEnum
    log: FastifyBaseLogger
}

type FetchConnectorVersionParams = {
    connectorName: string
    version: string
    tenantId?: string
    log: FastifyBaseLogger
}

type ConnectorKey = {
    id: string
    name: string
    version: string
    tenantId: string | null
    minimumSupportedRelease?: string
    maximumSupportedRelease?: string
}

