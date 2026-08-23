import { ApMultipartFile, OptionalArrayFromQuery, OptionalBooleanFromQuery } from '@fema/core-utils'
import { z } from 'zod'
import { ConnectorCategory, PackageType } from '../connector'

export const EXACT_VERSION_PATTERN = '^[0-9]+\\.[0-9]+\\.[0-9]+$'
export const EXACT_VERSION_REGEX = new RegExp(EXACT_VERSION_PATTERN)
const VERSION_PATTERN = '^([~^])?[0-9]+\\.[0-9]+\\.[0-9]+$'

export const ExactVersionType = z.string().regex(new RegExp(EXACT_VERSION_PATTERN))

export const VersionType = z.string().regex(new RegExp(VERSION_PATTERN))

export enum SuggestionType {
    ACTION = 'ACTION',
    TRIGGER = 'TRIGGER',
    ACTION_AND_TRIGGER = 'ACTION_AND_TRIGGER',
}
export enum ConnectorSortBy {
    NAME = 'NAME',
    UPDATED = 'UPDATED',
    CREATED = 'CREATED',
    POPULARITY = 'POPULARITY',
}

export enum ConnectorOrderBy {
    ASC = 'ASC',
    DESC = 'DESC',
}

export enum ConnectorAudienceFilter {
    HUMAN = 'human',
    AI = 'ai',
    ALL = 'all',
}

export const GetConnectorRequestWithScopeParams = z.object({
    name: z.string(),
    scope: z.string(),
})

export type GetConnectorRequestWithScopeParams = z.infer<typeof GetConnectorRequestWithScopeParams>


export const GetConnectorRequestParams = z.object({
    name: z.string(),
})

export type GetConnectorRequestParams = z.infer<typeof GetConnectorRequestParams>

export const ListConnectorsRequestQuery = z.object({
    workspaceId: z.string().optional(),
    release: ExactVersionType.optional(),
    includeHidden: OptionalBooleanFromQuery,
    audience: z.nativeEnum(ConnectorAudienceFilter).optional(),
    searchQuery: z.string().optional(),
    sortBy: z.nativeEnum(ConnectorSortBy).optional(),
    orderBy: z.nativeEnum(ConnectorOrderBy).optional(),
    categories: OptionalArrayFromQuery(z.nativeEnum(ConnectorCategory)),
    suggestionType: z.nativeEnum(SuggestionType).optional(),
    locale: z.string().optional(),
})

export type ListConnectorsRequestQuery = z.infer<typeof ListConnectorsRequestQuery>


export const RegistryConnectorsRequestQuery = z.object({
    release: ExactVersionType,
})

export type RegistryConnectorsRequestQuery = z.infer<typeof RegistryConnectorsRequestQuery>

export const GetConnectorRequestQuery = z.object({
    version: VersionType.optional(),
    workspaceId: z.string().optional(),
    locale: z.string().optional(),
    audience: z.nativeEnum(ConnectorAudienceFilter).optional(),
})

export type GetConnectorRequestQuery = z.infer<typeof GetConnectorRequestQuery>

export const ConnectorOptionRequest = z.object({
    workspaceId: z.string(),
    connectorName: z.string(),
    connectorVersion: VersionType,
    actionOrTriggerName: z.string(),
    propertyName: z.string(),
    flowId: z.string(),
    flowVersionId: z.string(),
    input: z.any(),
    searchValue: z.string().optional(),
})

export type ConnectorOptionRequest = z.infer<typeof ConnectorOptionRequest>

export enum ConnectorScope {
    PLATFORM = 'PLATFORM',
}

export const AddConnectorRequestBody = z.union([
    z.object({
        packageType: z.literal(PackageType.ARCHIVE),
        scope: z.literal(ConnectorScope.PLATFORM),
        connectorName: z.string().min(1),
        connectorVersion: ExactVersionType,
        connectorArchive: ApMultipartFile,
    }).describe('Private Connector'),
    z.object({
        packageType: z.literal(PackageType.REGISTRY),
        scope: z.literal(ConnectorScope.PLATFORM),
        connectorName: z.string().min(1),
        connectorVersion: ExactVersionType,
    }).describe('NPM Connector'),
])

export type AddConnectorRequestBody = z.infer<typeof AddConnectorRequestBody>

