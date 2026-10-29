import { ActionBase, TriggerBase } from '@fema-ipaas/connector-sdk'

import {
    ConnectorCategory,
    SuggestionType,
} from '@fema-ipaas/shared'
import Fuse from 'fuse.js'
import { ConnectorMetadataSchema } from '../connector-metadata-entity'

export const connectorSearching = {
    search: (params: SearchParams): ConnectorMetadataSchema[] => {
        return filterBasedOnCategories(params.categories, filterBasedOnSearchQuery(params))
    },
    originalTextsOf: (connectors: ConnectorMetadataSchema[]): Record<string, OriginalConnectorText> => {
        return Object.fromEntries(connectors.map((connector) => [connector.name, {
            text: textOf(connector),
            actions: textsOf(connector.actions),
            triggers: textsOf(connector.triggers),
        }]))
    },
}

function textOf({ displayName, description }: { displayName: string, description: string }): string {
    return `${displayName} ${description}`
}

function textsOf(entries: Record<string, ActionBase | TriggerBase>): Record<string, string> {
    return Object.fromEntries(Object.entries(entries).map(([name, entry]) => [name, textOf(entry)]))
}

function withOriginalText<T extends ActionBase | TriggerBase>(entries: T[], originals: Record<string, string> | undefined): (T & { originalText: string })[] {
    return entries.map((entry) => ({ ...entry, originalText: originals?.[entry.name] ?? '' }))
}

type SearchParams = {
    categories: ConnectorCategory[] | undefined
    searchQuery: string | undefined
    connectors: ConnectorMetadataSchema[]
    suggestionType?: SuggestionType
    originalTexts?: Record<string, OriginalConnectorText>
}

export type OriginalConnectorText = {
    text: string
    actions: Record<string, string>
    triggers: Record<string, string>
}


const filterBasedOnSearchQuery = ({ searchQuery, connectors, suggestionType, originalTexts }: SearchParams): ConnectorMetadataSchema[] => {
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
            originalText: originalTexts?.[connector.name]?.text ?? '',
            actions: withOriginalText(actions, originalTexts?.[connector.name]?.actions),
            triggers: withOriginalText(triggers, originalTexts?.[connector.name]?.triggers),
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
        'originalText',
        'actions.originalText',
        'triggers.originalText',
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
        const haystack = `${connector.displayName} ${connector.name} ${connector.originalText}`.toLowerCase()
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
            originalText: undefined,
            actions: orEveryEntry({ suggestions: suggestedActions, entries: item.actions }),
            triggers: orEveryEntry({ suggestions: suggestedTriggers, entries: item.triggers }),
        }
    })
}

function orEveryEntry<T extends ActionBase | TriggerBase>({ suggestions, entries }: { suggestions: Record<string, T>, entries: (T & { originalText: string })[] }): Record<string, T> {
    if (Object.keys(suggestions).length > 0) {
        return suggestions
    }
    return Object.fromEntries(entries.map((entry) => [entry.name, { ...entry, originalText: undefined }]))
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
    actionsOrTriggers: (T & { originalText: string })[],
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
        keys: ['connectorDisplayName', 'displayName', 'description', 'originalText'],
        threshold: 0.2,
        ignoreLocation: true,
    })
    const suggestions = nestedFuse.search(searchQuery)
    return suggestions.reduce<Record<string, T>>(
        (filteredSuggestions, { item }) => {
            filteredSuggestions[item.name] = {
                ...item,
                connectorDisplayName: undefined,
                originalText: undefined,
            }
            return filteredSuggestions
        },
        {},
    )
}
