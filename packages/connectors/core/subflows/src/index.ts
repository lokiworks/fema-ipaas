import { createConnector, ConnectorAuth } from '@fema/connector-sdk';
import { callFlow } from './lib/actions/call-flow';
import { streamCsvToSubflows } from './lib/actions/stream-csv-to-flow';
import { callableFlow } from './lib/triggers/callable-flow';
import { response } from './lib/actions/respond';
import { ConnectorCategory } from '@fema/connector-sdk';

export const flows = createConnector({
  displayName: 'Sub Flows',
  description: 'Trigger and call another sub flow.',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.82.0',
  categories: [ConnectorCategory.CORE, ConnectorCategory.FLOW_CONTROL],
  logoUrl: 'https://cdn.fema.local/connectors/new-core/subflows.svg',
  authors: ['hazemadelkhalel'],
  actions: [callFlow, streamCsvToSubflows, response],
  triggers: [callableFlow],
});
