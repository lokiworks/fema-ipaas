import { SuggestionType } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { connectorSearching } from '../../../../src/app/connectors/metadata/utils/connector-searching'
import { createMockConnectorMetadata } from '../../../helpers/mocks'

const connectors = [
    createMockConnectorMetadata({ name: '@fema-ipaas/connector-discord', displayName: 'Discord', description: 'Send messages to Discord channels' }),
    createMockConnectorMetadata({ name: '@fema-ipaas/connector-slack', displayName: 'Slack', description: 'Send messages to Slack channels' }),
    createMockConnectorMetadata({ name: '@fema-ipaas/connector-gmail', displayName: 'Gmail', description: 'Send and read emails' }),
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

const translatedHttp = createMockConnectorMetadata({
    name: '@fema-ipaas/connector-http-trigger',
    displayName: '网址请求',
    description: '接收网址请求',
    actions: {
        return_response: {
            name: 'return_response',
            displayName: '返回网址触发器响应',
            description: '向发起请求的一方返回响应',
            props: {},
            requireAuth: false,
        },
    },
})
const englishHttp = createMockConnectorMetadata({
    name: '@fema-ipaas/connector-http-trigger',
    displayName: 'Webhook',
    description: 'Receive webhook requests',
    actions: {
        return_response: {
            name: 'return_response',
            displayName: 'Return Webhook Response',
            description: 'Answer the caller',
            props: {},
            requireAuth: false,
        },
    },
})

describe('connectorSearching.search — original English text of a translated catalogue', () => {
    it('does not find a translated action by its English name without the original text', () => {
        const results = connectorSearching.search({
            categories: undefined,
            searchQuery: 'Return Webhook Response',
            connectors: [translatedHttp],
            suggestionType: SuggestionType.ACTION,
        })
        expect(results).toHaveLength(0)
    })

    it('finds the connector and the action by the English name', () => {
        const results = connectorSearching.search({
            categories: undefined,
            searchQuery: 'Return Webhook Response',
            connectors: [translatedHttp],
            suggestionType: SuggestionType.ACTION,
            originalTexts: connectorSearching.originalTextsOf([englishHttp]),
        })
        expect(results.map((p) => p.displayName)).toEqual(['网址请求'])
        expect(Object.keys(results[0].actions)).toEqual(['return_response'])
    })

    it('does not leak the search-only text into the result', () => {
        const [result] = connectorSearching.search({
            categories: undefined,
            searchQuery: 'webhook',
            connectors: [translatedHttp],
            suggestionType: SuggestionType.ACTION,
            originalTexts: connectorSearching.originalTextsOf([englishHttp]),
        })
        expect(JSON.parse(JSON.stringify(result))).not.toHaveProperty('originalText')
        expect(JSON.parse(JSON.stringify(result.actions.return_response))).not.toHaveProperty('originalText')
    })

    it('still finds the translated name', () => {
        const results = connectorSearching.search({
            categories: undefined,
            searchQuery: '网址',
            connectors: [translatedHttp],
            suggestionType: SuggestionType.ACTION,
            originalTexts: connectorSearching.originalTextsOf([englishHttp]),
        })
        expect(results).toHaveLength(1)
    })
})
