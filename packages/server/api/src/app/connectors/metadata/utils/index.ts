import { ActionBase } from '@fema/connector-sdk'
import { ConnectorAudienceFilter, ConnectorCategory, ConnectorOrderBy, ConnectorSortBy, SuggestionType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { ConnectorMetadataSchema } from '../connector-metadata-entity'
import { connectorSearching } from './connector-searching'
import { connectorSorting } from './connector-sorting'

export const connectorListUtils = (_log: FastifyBaseLogger) => ({
    async sortAndSearchConnectors(params: SortAndSearchConnectorsParams): Promise<ConnectorMetadataSchema[]> {
        const sortedConnectors = connectorSorting.sortAndOrder(
            params.sortBy,
            params.orderBy,
            params.connectors,
        )

        return connectorSearching.search({
            categories: params.categories,
            searchQuery: params.searchQuery,
            connectors: sortedConnectors,
            suggestionType: params.suggestionType,
        })
    },
})

export function filterActionsByAudience(
    actions: Record<string, ActionBase>,
    audience: ConnectorAudienceFilter | undefined,
): Record<string, ActionBase> {
    return Object.fromEntries(
        Object.entries(actions).filter(([, action]) => {
            switch (audience) {
                case ConnectorAudienceFilter.ALL:
                    return true
                case ConnectorAudienceFilter.AI:
                    return action.audience !== 'human'
                case ConnectorAudienceFilter.HUMAN:
                case undefined:
                default:                                
                    return action.audience !== 'ai'
            }
            
        }),
    )
}

export type SortAndSearchConnectorsParams = {
    searchQuery?: string
    categories?: ConnectorCategory[]
    sortBy?: ConnectorSortBy
    orderBy?: ConnectorOrderBy
    connectors: ConnectorMetadataSchema[]
    suggestionType?: SuggestionType
}

export * from './connector-cache-utils'
