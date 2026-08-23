import { SuggestionType } from '@fema/shared'
import { describe, expect, it } from 'vitest'
import { connectorSearching } from '../../../../src/app/connectors/metadata/utils/connector-searching'
import { createMockConnectorMetadata } from '../../../helpers/mocks'

const connectors = [
    createMockConnectorMetadata({ name: '@fema/connector-discord', displayName: 'Discord', description: 'Send messages to Discord channels' }),
    createMockConnectorMetadata({ name: '@fema/connector-slack', displayName: 'Slack', description: 'Send messages to Slack channels' }),
    createMockConnectorMetadata({ name: '@fema/connector-gmail', displayName: 'Gmail', description: 'Send and read emails' }),
]

describe('connectorSearching.search — robustness to extra query words', () => {
    it('finds Discord even when the query has an extra word ("Discord webhook")', () => {
        const results = connectorSearching.search({
            categories: undefined,
            searchQuery: 'Discord webhook',
            connectors,
            suggestionType: SuggestionType.ACTION,
        })
        expect(results.map((p) => p.displayName)).toContain('Discord')
    })

    it('finds a connector by an exact one-word name', () => {
        const results = connectorSearching.search({
            categories: undefined,
            searchQuery: 'Discord',
            connectors,
            suggestionType: SuggestionType.ACTION,
        })
        expect(results.map((p) => p.displayName)).toContain('Discord')
    })

    it('returns all connectors when there is no query', () => {
        const results = connectorSearching.search({
            categories: undefined,
            searchQuery: undefined,
            connectors,
            suggestionType: SuggestionType.ACTION,
        })
        expect(results).toHaveLength(connectors.length)
    })
})
