import { ConnectorAuth, createConnector } from '@fema-ipaas/connector-sdk'
import { echo } from './lib/actions/echo'

export const echoConnector = createConnector({
    displayName: 'E2E Custom Echo',
    description: 'Minimal no-auth custom connector used by the e2e smoke test to verify tar.gz custom-connector installation and execution.',
    auth: ConnectorAuth.None(),
    minimumSupportedRelease: '0.0.0',
    logoUrl: '/assets/connectors/webhooks.svg',
    authors: [],
    actions: [echo],
    triggers: [],
})
