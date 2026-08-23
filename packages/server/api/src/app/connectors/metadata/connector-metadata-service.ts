import { ConnectorMetadata, ConnectorMetadataModel, ConnectorMetadataModelSummary, ConnectorPackageInformation, connectorTranslation } from '@fema/connector-sdk'
import { apId, assertNotNullOrUndefined, ErrorCode, isNil, LocalesEnum, PlatformError, PlatformId } from '@fema/core-utils'
import { apVersionUtil } from '@fema/server-utils'
import { ConnectorAudienceFilter, ConnectorCategory, ConnectorOrderBy, ConnectorPackage, ConnectorSortBy, ConnectorType, EXACT_VERSION_REGEX, flowConnectorUtil, PackageType, PrivateConnectorPackage, PublicConnectorPackage, SuggestionType } from '@fema/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import semVer from 'semver'
import { EntityManager, In, IsNull } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { flowVersionRepo } from '../../flows/flow-version/flow-version.service'
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
            const translatedConnectors = await dedupe(`list:${params.platformId ?? ''}:${locale}`, () => fetchLatestConnectors({
                platformId: params.platformId,
                locale,
                log,
            }))
            const policy = await resolveVisibility({ platformId: params.platformId, workspaceId: params.workspaceId, log })
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
                platformId: params.platformId,
            })
            return registry.map((connector) => ({
                name: connector.name,
                version: connector.version,
            }))
        },
        async get({ workspaceId, platformId, version, name }: GetOrThrowParams): Promise<ConnectorMetadataModel | undefined> {
            const bestMatch = await findExactVersion(log, { name, version, platformId })
            if (isNil(bestMatch)) {
                return undefined
            }
            const connector = await dedupe(`connector:${bestMatch.name}:${bestMatch.version}:${bestMatch.platformId ?? ''}`, () => fetchConnectorVersion({
                connectorName: bestMatch.name,
                version: bestMatch.version,
                platformId: bestMatch.platformId,
                log,
            }))

            if (isNil(connector)) {
                return undefined
            }

            const policy = await resolveVisibility({ platformId, workspaceId, log })
            if (isNil(policy)) {
                return connector
            }
            if (!policy.isConnectorVisible(connector.name)) {
                return undefined
            }
            return policy.filterConnectorComponents(connector)
        },
        async getOrThrow({ version, name, platformId, locale }: GetOrThrowParams): Promise<ConnectorMetadataModel> {
            const connector = await this.get({ version, name, platformId })
            if (isNil(connector)) {
                throw new PlatformError({
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
        async resolveExactVersion({ name, version, platformId }: GetExactConnectorVersionParams): Promise<string> {
            const isExactVersion = EXACT_VERSION_REGEX.test(version)

            if (isExactVersion) {
                return version
            }

            const connectorMetadata = await this.getOrThrow({
                name,
                version,
                platformId,
            })

            return connectorMetadata.version
        },
        async create({
            connectorMetadata,
            platformId,
            packageType,
            connectorType,
            archiveId,
            publishCacheRefresh = true,
        }: CreateParams): Promise<ConnectorMetadataSchema> {
            const existingMetadata = await connectorRepos().findOneBy({
                name: connectorMetadata.name,
                version: connectorMetadata.version,
                platformId: platformId ?? IsNull(),
            })
            if (!isNil(existingMetadata)) {
                throw new PlatformError({
                    code: ErrorCode.VALIDATION,
                    params: {
                        message: `connector_metadata_already_exists name=${connectorMetadata.name} version=${connectorMetadata.version}`,
                    },
                })
            }
            const createdDate = await findOldestCreatedDate({
                name: connectorMetadata.name,
                platformId,
            })
            const savedConnector = await connectorRepos().save({
                id: apId(),
                packageType,
                connectorType,
                archiveId,
                platformId,
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

        async delete({ id, platformId }: DeleteParams): Promise<void> {
            const connector = await connectorRepos().findOneBy({ id })
            if (isNil(connector) || connector.platformId !== platformId) {
                throw new PlatformError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: { entityType: 'connector', entityId: id },
                })
            }
            if (connector.connectorType !== ConnectorType.CUSTOM) {
                throw new PlatformError({
                    code: ErrorCode.AUTHORIZATION,
                    params: { message: 'Only custom connectors can be deleted' },
                })
            }
            const flowsUsingConnector = await findFlowsUsingConnector({ connectorName: connector.name, platformId, log })
            if (flowsUsingConnector.length > 0) {
                throw new PlatformError({
                    code: ErrorCode.VALIDATION,
                    params: { message: buildConnectorInUseMessage(flowsUsingConnector) },
                })
            }
            await connectorRepos().delete({ name: connector.name, platformId, connectorType: ConnectorType.CUSTOM })
            await connectorCache(log).invalidate()
        },
    }
}

async function findFlowsUsingConnector({ connectorName, platformId, log }: FindFlowsUsingConnectorParams): Promise<string[]> {
    const workspaceIds = await workspaceService(log).getWorkspaceIdsByPlatform(platformId)
    if (workspaceIds.length === 0) {
        return []
    }
    const latestVersionSubquery = flowVersionRepo()
        .createQueryBuilder('fv_latest')
        .select('fv_latest.id')
        .where('fv_latest."flowId" = flow.id')
        .orderBy('fv_latest.created', 'DESC')
        .limit(1)

    const candidates = await flowVersionRepo().createQueryBuilder('flow_version')
        .innerJoin('flow_version.flow', 'flow')
        .where('flow."workspaceId" IN (:...workspaceIds)', { workspaceIds })
        .andWhere('flow_version.trigger::text LIKE :needle', { needle: `%"${connectorName}"%` })
        .andWhere(`(flow_version.id = flow."publishedVersionId" OR flow_version.id = (${latestVersionSubquery.getQuery()}))`)
        .getMany()

    const flowNamesById = new Map<string, string>()
    for (const flowVersion of candidates) {
        if (!flowNamesById.has(flowVersion.flowId) && flowConnectorUtil.getUsedConnectors(flowVersion.trigger).includes(connectorName)) {
            flowNamesById.set(flowVersion.flowId, flowVersion.displayName)
        }
    }
    return [...flowNamesById.values()]
}

function buildConnectorInUseMessage(flowNames: string[]): string {
    const previewLimit = 3
    const preview = flowNames.slice(0, previewLimit).map((name) => `"${name}"`).join(', ')
    const remaining = flowNames.length - previewLimit
    const flowList = remaining > 0 ? `${preview} and ${remaining} more` : preview
    if (flowNames.length === 1) {
        return `Cannot delete this connector because it is still used by the flow ${flowList}. Remove the connector from that flow first.`
    }
    return `Cannot delete this connector because it is still used by ${flowNames.length} flows: ${flowList}. Remove the connector from those flows first.`
}

export const getConnectorPackageWithoutArchive = async (
    log: FastifyBaseLogger,
    platformId: PlatformId | undefined,
    pkg: Omit<PublicConnectorPackage, 'directoryPath' | 'connectorType' | 'packageType'> | Omit<PrivateConnectorPackage, 'archiveId' | 'archive' | 'connectorType' | 'packageType'>,
): Promise<ConnectorPackage> => {
    const connectorMetadata = await connectorMetadataService(log).getOrThrow({
        name: pkg.connectorName,
        version: pkg.connectorVersion,
        platformId,
    })
    switch (connectorMetadata.packageType) {
        case PackageType.ARCHIVE:
            assertNotNullOrUndefined(connectorMetadata.platformId, 'platformId is required')
            return {
                connectorName: connectorMetadata.name,
                connectorVersion: connectorMetadata.version,
                connectorType: connectorMetadata.connectorType,
                packageType: connectorMetadata.packageType,
                archiveId: connectorMetadata.archiveId!,
                platformId: connectorMetadata.platformId,
            }
        case PackageType.REGISTRY: {
            const connectorPlatformId = connectorMetadata.platformId
            if (connectorMetadata.connectorType === ConnectorType.CUSTOM) {
                assertNotNullOrUndefined(connectorPlatformId, 'platformId is required')
                return {
                    connectorName: connectorMetadata.name,
                    connectorVersion: connectorMetadata.version,
                    packageType: connectorMetadata.packageType,
                    connectorType: connectorMetadata.connectorType,
                    platformId: connectorPlatformId,
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

const findOldestCreatedDate = async ({ name, platformId }: { name: string, platformId?: string }): Promise<string> => {
    const connector = await connectorRepos().findOne({
        where: {
            name,
            platformId: platformId ?? IsNull(),
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
    params: { name: string, version: string | undefined, platformId: string | undefined },
): Promise<{ name: string, version: string, platformId: string | undefined } | undefined> => {
    const { name, version, platformId } = params
    const versionToSearch = findNextExcludedVersion(version)
    const currentRelease = apVersionUtil.getCurrentRelease()
    const registry = filterRegistry(await loadRegistry(log), { release: currentRelease, platformId })
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
        platformId: sortedEntries[0].platformId,
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

async function fetchLatestConnectors({ platformId, locale = LocalesEnum.ENGLISH, log }: FetchLatestConnectorsParams): Promise<ConnectorMetadataSchema[]> {
    const currentRelease = apVersionUtil.getCurrentRelease()

    const latestConnectors = await dedupe(`latest-connectors:${currentRelease}`, () => fetchLatestCompatibleConnectorsFromDB(currentRelease))
    const translatedConnectors = translateConnectors(latestConnectors, locale)

    const devConnectors = await loadDevConnectorsIfEnabled(log)
    const translatedDevConnectors = devConnectors.map((connector) =>
        connectorTranslation.translateConnector<ConnectorMetadataSchema>({ connector, locale, mutate: true }),
    )

    const devConnectorNames = new Set(translatedDevConnectors.map((p) => p.name))
    const merged = [...translatedConnectors.filter((p) => !devConnectorNames.has(p.name)), ...translatedDevConnectors]
        .filter((connector) => filterConnectorBasedOnType(platformId, connector))
        .filter((connector) => isSupportedRelease(currentRelease, connector))
    return lastVersionOfEachConnector(merged)
}

async function fetchConnectorVersion({ connectorName, version, platformId, log }: FetchConnectorVersionParams): Promise<ConnectorMetadataSchema | null> {
    const devConnectors = await loadDevConnectorsIfEnabled(log)
    const devConnector = devConnectors.find((p) => p.name === connectorName && p.version === version)
    if (!isNil(devConnector)) {
        return devConnector
    }

    const foundConnector = await connectorRepos().findOne({
        where: {
            name: connectorName,
            version,
            platformId: platformId ?? IsNull(),
        },
    })
    return foundConnector ?? null
}

export async function fetchLatestCompatibleConnectorsFromDB(currentRelease: string): Promise<ConnectorMetadataSchema[]> {
    const allKeys = await connectorRepos()
        .createQueryBuilder('pm')
        .select(['pm."id"', 'pm."name"', 'pm."version"', 'pm."platformId"', 'pm."minimumSupportedRelease"', 'pm."maximumSupportedRelease"'])
        .getRawMany<ConnectorKey>()

    const compatibleKeys = allKeys.filter((connector) => isSupportedRelease(currentRelease, connector))
    const latestIds = pickLatestVersionIds(compatibleKeys)
    return latestIds.length > 0 ? connectorRepos().find({ where: { id: In(latestIds) } }) : []
}

function pickLatestVersionIds(connectors: ConnectorKey[]): string[] {
    const latest = new Map<string, ConnectorKey>()
    for (const connector of connectors) {
        const key = `${connector.name}:${connector.platformId ?? ''}`
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

function filterRegistry(registry: ConnectorRegistryEntry[], params: { release: string | undefined, platformId: string | undefined }): ConnectorRegistryEntry[] {
    return registry
        .filter((connector) => filterConnectorBasedOnType(params.platformId, connector))
        .filter((connector) => isNil(params.release) || isSupportedRelease(params.release, connector))
}



type ListParams = {
    workspaceId?: string
    platformId?: string
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
    platformId?: string
    locale?: LocalesEnum
}

type DeleteParams = {
    id: string
    platformId: string
}

type FindFlowsUsingConnectorParams = {
    connectorName: string
    platformId: string
    log: FastifyBaseLogger
}

type CreateParams = {
    connectorMetadata: ConnectorMetadata
    platformId?: string
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
    platformId: PlatformId
}

type RegistryParams = {
    release: string
    platformId?: string
}

type FetchLatestConnectorsParams = {
    platformId?: string
    locale?: LocalesEnum
    log: FastifyBaseLogger
}

type FetchConnectorVersionParams = {
    connectorName: string
    version: string
    platformId?: string
    log: FastifyBaseLogger
}

type ConnectorKey = {
    id: string
    name: string
    version: string
    platformId: string | null
    minimumSupportedRelease?: string
    maximumSupportedRelease?: string
}

