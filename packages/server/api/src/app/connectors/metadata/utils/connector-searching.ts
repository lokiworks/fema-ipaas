import { ActionBase, TriggerBase } from '@fema/connector-sdk'

import {
    ConnectorCategory,
    SuggestionType,
} from '@fema/shared'
import Fuse from 'fuse.js'
import { ConnectorMetadataSchema } from '../connector-metadata-entity'

export const connectorSearching = {
    search: (params: SearchParams): ConnectorMetadataSchema[] => {
        return filterBasedOnCategories(params.categories, filterBasedOnSearchQuery(params))
    },
}

type SearchParams = {
    categories: ConnectorCategory[] | undefined
    searchQuery: string | undefined
    connectors: ConnectorMetadataSchema[]
    suggestionType?: SuggestionType
}


const filterBasedOnSearchQuery = ({ searchQuery, connectors, suggestionType }: SearchParams): ConnectorMetadataSchema[] => {
    if (!searchQuery) {
        return connectors
    }
    const putActionsAndTriggersInAnArray = connectors.map((connector) => {
        const actions = suggestionType === SuggestionType.ACTION ||
                    suggestionType === SuggestionType.ACTION_AND_TRIGGER
            ? Object.values(connector.actions)
            : []

        const triggers = suggestionType === SuggestionType.TRIGGER ||
                    suggestionType === SuggestionType.ACTION_AND_TRIGGER
            ? Object.values(connector.triggers)
            : []
        return {
            ...connector,
            actions,
            triggers,
        }
    })

    const connectorWithTriggersAndActionsFilterKeys = [
        {
            name: 'displayName',
            weight: 3,
        },
        {
            name: 'description',
            weight: 1,
        },
        'actions.displayName',
        'actions.description',
        'triggers.displayName',
        'triggers.description',
    ]

    const fuse = new Fuse(putActionsAndTriggersInAnArray, {
        isCaseSensitive: false,
        shouldSort: true,
        keys: connectorWithTriggersAndActionsFilterKeys,
        threshold: 0.2,
        distance: 250,
        ignoreLocation: true,
    })

    const fuseMatches = fuse.search(searchQuery).map(({ item }) => item)

    // Guarantee that an exact/substring name match is never lost to fuzzy ranking:
    // an extra word in the query (e.g. "Discord webhook" vs the connector name "Discord")
    // must still surface the connector. Union the fuzzy hits with any connector whose name or
    // displayName contains a query token.
    const tokens = searchQuery.toLowerCase().split(/\s+/).filter((token) => token.length > 0)
    const fuseMatchedNames = new Set(fuseMatches.map((connector) => connector.name))
    const substringMatches = putActionsAndTriggersInAnArray.filter((connector) => {
        if (fuseMatchedNames.has(connector.name)) {
            return false
        }
        const haystack = `${connector.displayName} ${connector.name}`.toLowerCase()
        return tokens.some((token) => haystack.includes(token))
    })

    return [...fuseMatches, ...substringMatches].map((item) => {
        const suggestedActions = searchForSuggestion(
            item.actions,
            searchQuery,
            item.displayName,
        )
        const suggestedTriggers = searchForSuggestion(
            item.triggers,
            searchQuery,
            item.displayName,
        )

        return {
            ...item,
            actions: suggestedActions,
            triggers: suggestedTriggers,
        }
    })
}

const filterBasedOnCategories = (categories: ConnectorCategory[] | undefined, connectors: ConnectorMetadataSchema[]): ConnectorMetadataSchema[] => {
    if (!categories) {
        return connectors
    }

    return connectors.filter((p) => {
        return categories.some((item) => (p.categories ?? []).includes(item))
    })
}

function searchForSuggestion<T extends ActionBase | TriggerBase>(
    actionsOrTriggers: T[],
    searchQuery: string,
    connectorDisplayName: string,
): Record<string, T> {
    const actionsOrTriggerWithConnectorDisplayName = actionsOrTriggers.map(
        (actionOrTrigger) => ({
            ...actionOrTrigger,
            connectorDisplayName,
        }),
    )

    const nestedFuse = new Fuse(actionsOrTriggerWithConnectorDisplayName, {
        isCaseSensitive: false,
        shouldSort: true,
        keys: ['connectorDisplayName', 'displayName', 'description'],
        threshold: 0.2,
    })
    const suggestions = nestedFuse.search(searchQuery)
    return suggestions.reduce<Record<string, T>>(
        (filteredSuggestions, { item }) => {
            filteredSuggestions[item.name] = {
                ...item,
                connectorDisplayName: undefined,
            }
            return filteredSuggestions
        },
        {},
    )
}
