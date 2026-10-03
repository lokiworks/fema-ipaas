import { DomainModule } from '../support/route-review'
import { integrationsAiCases } from './integrations-ai'
import { integrationsConnectionCases } from './integrations-connections'
import { integrationsConnectorCases } from './integrations-connectors'
import { integrationsMcpCases } from './integrations-mcp'
import { integrationsReviews } from './reviews-integrations'

export const integrationsDomain: DomainModule = {
    cases: [...integrationsConnectionCases, ...integrationsConnectorCases, ...integrationsMcpCases, ...integrationsAiCases],
    reviews: integrationsReviews,
    exemptions: {},
}
